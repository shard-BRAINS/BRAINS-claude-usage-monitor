import { test, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TranscriptWatcher } from './watcher';
import type { SessionTotals } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSandbox(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cum-watcher-'));
}

function makeAssistantLine(inputTokens: number, outputTokens: number): string {
  return JSON.stringify({
    type: 'assistant',
    message: {
      role: 'assistant',
      content: 'text',
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    },
    uuid: `u-${Date.now()}`,
    timestamp: new Date().toISOString(),
  });
}

/** Wait for the next 'change' event, or throw if timeout elapses first. */
function nextChange(watcher: TranscriptWatcher, timeoutMs: number): Promise<SessionTotals> {
  return new Promise((resolve, reject) => {
    const handler = (totals: SessionTotals) => {
      clearTimeout(timer);
      watcher.off('change', handler);
      resolve(totals);
    };

    const timer = setTimeout(() => {
      watcher.off('change', handler);
      reject(new Error(`'change' not emitted within ${timeoutMs}ms`));
    }, timeoutMs);

    watcher.on('change', handler);
  });
}

// ---------------------------------------------------------------------------
// State shared across tests
// ---------------------------------------------------------------------------

let sandbox: string;
let watcher: TranscriptWatcher;

beforeEach(() => {
  sandbox = makeSandbox();
  watcher = new TranscriptWatcher();
});

afterEach(() => {
  watcher.stop();
  // Best-effort cleanup of temp dir
  try {
    fs.rmSync(sandbox, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

// ---------------------------------------------------------------------------
// Test 1: onChange fires within 2s of appending a new usage line
// ---------------------------------------------------------------------------

test('onChange fires within 2s of appending a new usage line', async () => {
  // Build projects/demo/ structure inside the sandbox
  const projectsDir = path.join(sandbox, 'projects');
  const demoDir = path.join(projectsDir, 'demo');
  fs.mkdirSync(demoDir, { recursive: true });

  const sessionFile = path.join(demoDir, 'session-x.jsonl');

  // Write initial line: input 100, output 50
  fs.writeFileSync(sessionFile, makeAssistantLine(100, 50) + '\n', 'utf8');

  await watcher.start(projectsDir);

  // Drain the initial 'change' that fires after start's debounce
  await nextChange(watcher, 2000);

  // Append second line: input 200, output 100
  const appendPromise = nextChange(watcher, 2000);
  fs.appendFileSync(sessionFile, makeAssistantLine(200, 100) + '\n', 'utf8');

  const totals = await appendPromise;

  expect(totals.input).toBe(300);
  expect(totals.output).toBe(150);
  expect(totals.sessionId).toBe('session-x');

  watcher.stop();
}, 6000);

// ---------------------------------------------------------------------------
// Test 2: stop() removes the watcher and the process can exit cleanly
// ---------------------------------------------------------------------------

test('stop() removes the watcher so no change fires after stop', async () => {
  const projectsDir = path.join(sandbox, 'projects');
  const demoDir = path.join(projectsDir, 'demo');
  fs.mkdirSync(demoDir, { recursive: true });

  const sessionFile = path.join(demoDir, 'session-y.jsonl');
  fs.writeFileSync(sessionFile, makeAssistantLine(10, 5) + '\n', 'utf8');

  await watcher.start(projectsDir);

  // Drain the initial change
  await nextChange(watcher, 2000);

  // Stop the watcher
  watcher.stop();

  // After stop, appending should NOT trigger a 'change' within 1s
  let firedAfterStop = false;
  watcher.on('change', () => {
    firedAfterStop = true;
  });

  fs.appendFileSync(sessionFile, makeAssistantLine(50, 25) + '\n', 'utf8');
  await new Promise<void>((r) => setTimeout(r, 1000));

  expect(firedAfterStop).toBe(false);
  // The closed getter confirms the watcher handle is gone
  expect(watcher.closed).toBe(true);
}, 5000);

// ---------------------------------------------------------------------------
// Test 3: start() on a non-existent projects dir is a no-op
// ---------------------------------------------------------------------------

test('start() on a non-existent projects dir logs a warning and does not throw', async () => {
  const nonExistent = path.join(sandbox, 'does-not-exist', 'projects');

  // Should not throw
  await expect(watcher.start(nonExistent)).resolves.toBeUndefined();

  // Should not emit 'change' within 500ms
  let fired = false;
  watcher.on('change', () => {
    fired = true;
  });
  await new Promise<void>((r) => setTimeout(r, 500));
  expect(fired).toBe(false);
}, 3000);

// ---------------------------------------------------------------------------
// Test 4: start() against a non-existent dir leaves closed === false
// ---------------------------------------------------------------------------

test('start() against a non-existent projects dir leaves closed === false', async () => {
  const nonExistent = path.join(sandbox, 'does-not-exist', 'projects');

  await watcher.start(nonExistent);

  // The watcher was never successfully started, so closed must not be true
  expect(watcher.closed).toBe(false);
}, 3000);

// ---------------------------------------------------------------------------
// Test 5: scoped slug picks only the matching project's session
// ---------------------------------------------------------------------------

test('rescanNow forces an immediate change emit, bypassing debounce', async () => {
  const projectsDir = path.join(sandbox, 'projects');
  const demoDir = path.join(projectsDir, 'demo');
  fs.mkdirSync(demoDir, { recursive: true });

  const sessionFile = path.join(demoDir, 'session-r.jsonl');
  fs.writeFileSync(sessionFile, makeAssistantLine(11, 22) + '\n', 'utf8');

  await watcher.start(projectsDir);
  await nextChange(watcher, 2000); // drain initial

  // Append without waiting for the watcher event to debounce
  fs.appendFileSync(sessionFile, makeAssistantLine(100, 100) + '\n', 'utf8');

  const eventPromise = nextChange(watcher, 1000);
  await watcher.rescanNow();
  const totals = await eventPromise;

  expect(totals.input).toBe(111);
  expect(totals.output).toBe(122);
}, 5000);

test('rescanNow on a watcher that was never started is a no-op', async () => {
  // Fresh watcher, never started — _projectsDir is null, _rescan should early-return
  let fired = false;
  watcher.on('change', () => {
    fired = true;
  });
  await watcher.rescanNow();
  expect(fired).toBe(false);
}, 2000);

test('scoped slug picks only the matching project session', async () => {
  // Build .claude/projects/{proj-a,proj-b} inside sandbox
  const projectsDir = path.join(sandbox, '.claude', 'projects');
  const projA = path.join(projectsDir, 'proj-a');
  const projB = path.join(projectsDir, 'proj-b');
  fs.mkdirSync(projA, { recursive: true });
  fs.mkdirSync(projB, { recursive: true });

  const sessionA = path.join(projA, 'session-1.jsonl');
  const sessionB = path.join(projB, 'session-2.jsonl');

  // Write proj-a first
  fs.writeFileSync(sessionA, makeAssistantLine(100, 50) + '\n', 'utf8');

  // Ensure proj-b has a strictly later mtime by waiting 10ms
  await new Promise<void>((r) => setTimeout(r, 10));
  fs.writeFileSync(sessionB, makeAssistantLine(999, 999) + '\n', 'utf8');

  // Without scoping the watcher would pick session-2 (proj-b, more recent).
  // With projectSlug: 'proj-a', it must return proj-a's totals.
  await watcher.start(projectsDir, 'proj-a');

  const totals = await nextChange(watcher, 3000);

  expect(totals.input).toBe(100);
  expect(totals.output).toBe(50);
  expect(totals.sessionId).toBe('session-1');
}, 6000);
