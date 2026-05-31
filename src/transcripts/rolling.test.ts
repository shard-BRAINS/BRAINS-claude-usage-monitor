import { test, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { listAllSessions, tokensInWindow, nextResetAt } from './rolling';
import type { SessionTimeline, TimelineEntry } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(timestampMs: number, total: number): TimelineEntry {
  return { timestampMs, input: total, output: 0, cacheCreate: 0, cacheRead: 0, total };
}

function makeAssistantLine(timestampMs: number, inputTokens: number): string {
  return JSON.stringify({
    type: 'assistant',
    timestamp: new Date(timestampMs).toISOString(),
    message: {
      role: 'assistant',
      usage: {
        input_tokens: inputTokens,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Fixture project tree
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rolling-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
const NOW_MS = Date.parse('2026-05-29T12:00:00.000Z');

function buildTree(): void {
  // proj-1/sess-a.jsonl: entries at 4h ago (in window), 6h ago (out), 1d ago (out)
  const proj1 = path.join(tmpDir, 'proj-1');
  fs.mkdirSync(proj1);
  const sessA = [
    makeAssistantLine(NOW_MS - 4 * 60 * 60 * 1000, 100),  // in window
    makeAssistantLine(NOW_MS - 6 * 60 * 60 * 1000, 200),  // out of window
    makeAssistantLine(NOW_MS - 24 * 60 * 60 * 1000, 300), // out of window
  ].join('\n');
  fs.writeFileSync(path.join(proj1, 'sess-a.jsonl'), sessA, 'utf8');

  // proj-2/sess-b.jsonl: entries at 1h ago and 3h ago (both in window)
  const proj2 = path.join(tmpDir, 'proj-2');
  fs.mkdirSync(proj2);
  const sessB = [
    makeAssistantLine(NOW_MS - 1 * 60 * 60 * 1000, 50),   // in window
    makeAssistantLine(NOW_MS - 3 * 60 * 60 * 1000, 75),   // in window
  ].join('\n');
  fs.writeFileSync(path.join(proj2, 'sess-b.jsonl'), sessB, 'utf8');
}

// ---------------------------------------------------------------------------
// listAllSessions
// ---------------------------------------------------------------------------

test('listAllSessions returns timelines for both projects', async () => {
  buildTree();
  const timelines = await listAllSessions(tmpDir);
  expect(timelines).toHaveLength(2);
  const ids = timelines.map((t) => t.sessionId).sort();
  expect(ids).toEqual(['sess-a', 'sess-b']);
});

// ---------------------------------------------------------------------------
// tokensInWindow
// ---------------------------------------------------------------------------

test('tokensInWindow sums only entries inside the window', () => {
  const timelines: SessionTimeline[] = [
    {
      sessionId: 'a',
      filePath: '/fake/a.jsonl',
      entries: [
        makeEntry(NOW_MS - 4 * 60 * 60 * 1000, 100),  // 4h ago — inside 5h window
        makeEntry(NOW_MS - 6 * 60 * 60 * 1000, 200),  // 6h ago — outside
        makeEntry(NOW_MS - 24 * 60 * 60 * 1000, 300), // 1d ago — outside
      ],
      cumulative: {
        sessionId: 'a',
        filePath: '/fake/a.jsonl',
        input: 600,
        output: 0,
        cacheCreate: 0,
        cacheRead: 0,
        total: 600,
        lastModified: new Date(NOW_MS),
        lastTurnInput: 300,
        lastTurnOutput: 0,
      },
    },
    {
      sessionId: 'b',
      filePath: '/fake/b.jsonl',
      entries: [
        makeEntry(NOW_MS - 1 * 60 * 60 * 1000, 50),  // 1h ago — inside
        makeEntry(NOW_MS - 3 * 60 * 60 * 1000, 75),  // 3h ago — inside
      ],
      cumulative: {
        sessionId: 'b',
        filePath: '/fake/b.jsonl',
        input: 125,
        output: 0,
        cacheCreate: 0,
        cacheRead: 0,
        total: 125,
        lastModified: new Date(NOW_MS),
        lastTurnInput: 75,
        lastTurnOutput: 0,
      },
    },
  ];

  // In window: 100 (4h) + 50 (1h) + 75 (3h) = 225
  expect(tokensInWindow(timelines, FIVE_HOURS_MS, NOW_MS)).toBe(225);
});

test('tokensInWindow handles empty timelines list', () => {
  expect(tokensInWindow([], FIVE_HOURS_MS, NOW_MS)).toBe(0);
});

// ---------------------------------------------------------------------------
// nextResetAt
// ---------------------------------------------------------------------------

test('nextResetAt returns oldestInWindow + windowMs', () => {
  const oldestInWindow = NOW_MS - 4 * 60 * 60 * 1000; // 4h ago

  const timelines: SessionTimeline[] = [
    {
      sessionId: 'a',
      filePath: '/fake/a.jsonl',
      entries: [
        makeEntry(oldestInWindow, 100),                    // oldest in-window
        makeEntry(NOW_MS - 6 * 60 * 60 * 1000, 200),     // outside window
        makeEntry(NOW_MS - 1 * 60 * 60 * 1000, 50),      // 1h ago — inside
      ],
      cumulative: {
        sessionId: 'a',
        filePath: '/fake/a.jsonl',
        input: 350,
        output: 0,
        cacheCreate: 0,
        cacheRead: 0,
        total: 350,
        lastModified: new Date(NOW_MS),
        lastTurnInput: 50,
        lastTurnOutput: 0,
      },
    },
  ];

  const result = nextResetAt(timelines, FIVE_HOURS_MS, NOW_MS);
  expect(result).toBe(oldestInWindow + FIVE_HOURS_MS);
});

test('nextResetAt returns undefined when no entries in window', () => {
  const timelines: SessionTimeline[] = [
    {
      sessionId: 'a',
      filePath: '/fake/a.jsonl',
      entries: [
        makeEntry(NOW_MS - 6 * 60 * 60 * 1000, 200),  // all outside 5h window
        makeEntry(NOW_MS - 24 * 60 * 60 * 1000, 300),
      ],
      cumulative: {
        sessionId: 'a',
        filePath: '/fake/a.jsonl',
        input: 500,
        output: 0,
        cacheCreate: 0,
        cacheRead: 0,
        total: 500,
        lastModified: new Date(NOW_MS),
        lastTurnInput: 300,
        lastTurnOutput: 0,
      },
    },
  ];

  expect(nextResetAt(timelines, FIVE_HOURS_MS, NOW_MS)).toBeUndefined();
});
