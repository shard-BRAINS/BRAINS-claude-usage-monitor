import { test, expect, vi } from 'vitest';

vi.mock('vscode', () => import('./__mocks__/vscode'));

import { maybeNudge, makeMemoryNudgeState, makeWorkspaceStateNudgeState } from './nudge';
import { makeFakeMemento } from './__mocks__/vscode';
import type { SessionTotals } from '../transcripts/types';
import type { Thresholds } from '../config/thresholds';
import type { NudgeConfig } from '../config/nudge';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const THRESHOLDS: Thresholds = { warning: 100000, critical: 160000 };

const CONFIG_ONCE: NudgeConfig = {
  mode: 'once-per-session',
  minIntervalMinutes: 0,
  suppressedSessions: [],
};

function makeTotals(total: number, sessionId = 'session-a'): SessionTotals {
  return {
    sessionId,
    filePath: '/tmp/test.jsonl',
    input: Math.floor(total * 0.5),
    output: Math.floor(total * 0.3),
    cacheRead: Math.floor(total * 0.1),
    cacheCreate: Math.floor(total * 0.1),
    total,
    lastModified: new Date(),
    lastTurnInput: Math.floor(total * 0.5),
    lastTurnOutput: Math.floor(total * 0.3),
  };
}

function makeArgs(
  overrides: Partial<Parameters<typeof maybeNudge>[0]> = {},
): Parameters<typeof maybeNudge>[0] {
  const showInfo = vi.fn().mockResolvedValue(undefined);
  const onSnooze = vi.fn().mockResolvedValue(undefined);
  return {
    totals: makeTotals(160000),
    thresholds: THRESHOLDS,
    config: CONFIG_ONCE,
    state: makeMemoryNudgeState(),
    workspaceName: 'test-workspace',
    showInfo,
    onSnooze,
    clock: () => 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test 1: below critical returns false; showInfo never called
// ---------------------------------------------------------------------------

test('below critical returns false and showInfo is never called', () => {
  const showInfo = vi.fn().mockResolvedValue(undefined);
  const result = maybeNudge(makeArgs({ totals: makeTotals(159999), showInfo }));

  expect(result).toBe(false);
  expect(showInfo).not.toHaveBeenCalled();
});

// ---------------------------------------------------------------------------
// Test 2: once-per-session fires exactly once across 3 calls
// ---------------------------------------------------------------------------

test('at or above critical calls showInfo exactly once across 3 repeated calls for same sessionId', () => {
  const state = makeMemoryNudgeState();
  const showInfo = vi.fn().mockResolvedValue(undefined);
  const onSnooze = vi.fn().mockResolvedValue(undefined);
  const totals = makeTotals(160000, 'session-b');

  const r1 = maybeNudge({ totals, thresholds: THRESHOLDS, config: CONFIG_ONCE, state, workspaceName: 'w', showInfo, onSnooze, clock: () => 0 });
  const r2 = maybeNudge({ totals, thresholds: THRESHOLDS, config: CONFIG_ONCE, state, workspaceName: 'w', showInfo, onSnooze, clock: () => 0 });
  const r3 = maybeNudge({ totals, thresholds: THRESHOLDS, config: CONFIG_ONCE, state, workspaceName: 'w', showInfo, onSnooze, clock: () => 0 });

  expect(r1).toBe(true);
  expect(r2).toBe(false);
  expect(r3).toBe(false);
  expect(showInfo).toHaveBeenCalledTimes(1);
});

// ---------------------------------------------------------------------------
// Test 3: different sessionIds each get one nudge
// ---------------------------------------------------------------------------

test('different sessionIds each get exactly one nudge', () => {
  const state = makeMemoryNudgeState();
  const showInfo = vi.fn().mockResolvedValue(undefined);
  const onSnooze = vi.fn().mockResolvedValue(undefined);

  const base = { thresholds: THRESHOLDS, config: CONFIG_ONCE, state, workspaceName: 'w', showInfo, onSnooze, clock: () => 0 };

  const r1 = maybeNudge({ ...base, totals: makeTotals(200000, 'session-x') });
  const r2 = maybeNudge({ ...base, totals: makeTotals(200000, 'session-y') });
  const r3 = maybeNudge({ ...base, totals: makeTotals(200000, 'session-x') });

  expect(r1).toBe(true);
  expect(r2).toBe(true);
  expect(r3).toBe(false);
  expect(showInfo).toHaveBeenCalledTimes(2);
});

// ---------------------------------------------------------------------------
// Test 4: makeMemoryNudgeState behaves correctly
// ---------------------------------------------------------------------------

test('makeMemoryNudgeState: hasNudged is false then true after markNudged', () => {
  const state = makeMemoryNudgeState();

  expect(state.hasNudged('abc')).toBe(false);
  state.markNudged('abc');
  expect(state.hasNudged('abc')).toBe(true);
  expect(state.hasNudged('xyz')).toBe(false);
});

// ---------------------------------------------------------------------------
// Test 5: workspaceStateNudgeState persists session ids across instances
// ---------------------------------------------------------------------------

test('workspaceStateNudgeState persists session ids across instances', async () => {
  const memento = makeFakeMemento();
  const state1 = makeWorkspaceStateNudgeState(memento);

  state1.markNudged('session-persist');
  await Promise.resolve();

  const state2 = makeWorkspaceStateNudgeState(memento);
  expect(state2.hasNudged('session-persist')).toBe(true);
});

// ---------------------------------------------------------------------------
// Test 6: workspaceStateNudgeState does not double-record same sessionId
// ---------------------------------------------------------------------------

test('workspaceStateNudgeState does not double-record same sessionId', async () => {
  const memento = makeFakeMemento();
  const state = makeWorkspaceStateNudgeState(memento);

  state.markNudged('session-dedup');
  await Promise.resolve();
  state.markNudged('session-dedup');
  await Promise.resolve();

  const snapshot = memento.__snapshot();
  // nudgeRecords map should have exactly one entry for this sessionId
  const records = snapshot['nudgeRecords'] as Record<string, { fired: boolean }>;
  expect(Object.keys(records)).toHaveLength(1);
  expect(records['session-dedup'].fired).toBe(true);
});

// ---------------------------------------------------------------------------
// Test 7: off mode never fires
// ---------------------------------------------------------------------------

test('off mode never fires', () => {
  const showInfo = vi.fn().mockResolvedValue(undefined);
  const config: NudgeConfig = { mode: 'off', minIntervalMinutes: 0, suppressedSessions: [] };
  const result = maybeNudge(makeArgs({ totals: makeTotals(999999), config, showInfo }));

  expect(result).toBe(false);
  expect(showInfo).not.toHaveBeenCalled();
});

// ---------------------------------------------------------------------------
// Test 8: on-warning fires on upward crossing only
// ---------------------------------------------------------------------------

test('on-warning fires on upward crossing only', () => {
  const state = makeMemoryNudgeState();
  const showInfo = vi.fn().mockResolvedValue(undefined);
  const onSnooze = vi.fn().mockResolvedValue(undefined);
  const config: NudgeConfig = { mode: 'on-warning', minIntervalMinutes: 0, suppressedSessions: [] };
  let now = 0;

  const base = { thresholds: THRESHOLDS, config, state, workspaceName: 'w', showInfo, onSnooze, clock: () => now };

  // First call: total below warning — no fire; observation recorded.
  const r1 = maybeNudge({ ...base, totals: makeTotals(50000, 'sess-warn') });
  expect(r1).toBe(false);
  expect(showInfo).toHaveBeenCalledTimes(0);

  // Second call: total crosses warning upward — fires.
  now = 1000;
  const r2 = maybeNudge({ ...base, totals: makeTotals(110000, 'sess-warn') });
  expect(r2).toBe(true);
  expect(showInfo).toHaveBeenCalledTimes(1);

  // Third call: total still >= warning but prevTotal also >= warning — does NOT fire even if interval passed.
  now = 200000;
  const r3 = maybeNudge({ ...base, totals: makeTotals(120000, 'sess-warn') });
  expect(r3).toBe(false);
  expect(showInfo).toHaveBeenCalledTimes(1);
});

// ---------------------------------------------------------------------------
// Test 9: on-each respects minIntervalMinutes
// ---------------------------------------------------------------------------

test('on-each respects minIntervalMinutes', () => {
  const state = makeMemoryNudgeState();
  const showInfo = vi.fn().mockResolvedValue(undefined);
  const onSnooze = vi.fn().mockResolvedValue(undefined);
  const config: NudgeConfig = { mode: 'on-each', minIntervalMinutes: 10, suppressedSessions: [] };

  const base = { thresholds: THRESHOLDS, config, state, workspaceName: 'w', showInfo, onSnooze };

  // First call fires (no previous fire).
  const r1 = maybeNudge({ ...base, totals: makeTotals(110000, 'sess-each'), clock: () => 0 });
  expect(r1).toBe(true);

  // Second call 5 minutes later — interval not passed (5 < 10 minutes).
  const r2 = maybeNudge({ ...base, totals: makeTotals(110000, 'sess-each'), clock: () => 5 * 60_000 });
  expect(r2).toBe(false);

  // Third call 11 minutes after first fire — interval passed.
  const r3 = maybeNudge({ ...base, totals: makeTotals(110000, 'sess-each'), clock: () => 11 * 60_000 });
  expect(r3).toBe(true);

  expect(showInfo).toHaveBeenCalledTimes(2);
});

// ---------------------------------------------------------------------------
// Test 10: suppressedSessions short-circuits all modes
// ---------------------------------------------------------------------------

test('suppressedSessions list short-circuits all modes', () => {
  const showInfo = vi.fn().mockResolvedValue(undefined);
  const config: NudgeConfig = {
    mode: 'on-each',
    minIntervalMinutes: 0,
    suppressedSessions: ['suppressed-session'],
  };
  const result = maybeNudge(makeArgs({
    totals: makeTotals(999999, 'suppressed-session'),
    config,
    showInfo,
  }));

  expect(result).toBe(false);
  expect(showInfo).not.toHaveBeenCalled();
});

// ---------------------------------------------------------------------------
// Test 11: Snooze action triggers onSnooze callback
// ---------------------------------------------------------------------------

test('Snooze action triggers onSnooze callback', async () => {
  const showInfo = vi.fn().mockResolvedValue('Snooze this session');
  const onSnooze = vi.fn().mockResolvedValue(undefined);
  const config: NudgeConfig = { mode: 'once-per-session', minIntervalMinutes: 0, suppressedSessions: [] };

  maybeNudge(makeArgs({
    totals: makeTotals(160000, 'snooze-sess'),
    config,
    showInfo,
    onSnooze,
  }));

  // Drain the microtask queue: showInfo resolves → .then fires → onSnooze called.
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }

  expect(onSnooze).toHaveBeenCalledWith('snooze-sess');
});

// ---------------------------------------------------------------------------
// Test 12: Message includes workspaceName when provided
// ---------------------------------------------------------------------------

test('message includes workspaceName when provided', () => {
  const showInfo = vi.fn().mockResolvedValue(undefined);
  const config: NudgeConfig = { mode: 'once-per-session', minIntervalMinutes: 0, suppressedSessions: [] };

  maybeNudge(makeArgs({
    totals: makeTotals(160000, 'abcdef12345'),
    config,
    workspaceName: 'BRAINS',
    showInfo,
  }));

  expect(showInfo).toHaveBeenCalledWith(
    expect.stringContaining('[BRAINS]'),
    'Start fresh chat',
    'Snooze this session',
  );
});

// ---------------------------------------------------------------------------
// Test 13: Message uses last 8 chars of sessionId when workspaceName is undefined
// ---------------------------------------------------------------------------

test('message uses last 8 chars of sessionId when workspaceName is undefined', () => {
  const showInfo = vi.fn().mockResolvedValue(undefined);
  const config: NudgeConfig = { mode: 'once-per-session', minIntervalMinutes: 0, suppressedSessions: [] };

  // sessionId = 'abcdef12345' → last 8 chars = 'bcdef12345'.slice(-8) = 'f12345' ... actually:
  // 'abcdef12345'.slice(-8) = 'cdef1234' — let's verify: a-b-c-d-e-f-1-2-3-4-5 (11 chars), last 8 = 'def12345'
  maybeNudge(makeArgs({
    totals: makeTotals(160000, 'abcdef12345'),
    config,
    workspaceName: undefined,
    showInfo,
  }));

  // 'abcdef12345'.slice(-8) = 'bcdef123' — let's compute: length 11, -8 = index 3 → 'def12345' (8 chars from index 3)
  // a(0) b(1) c(2) d(3) e(4) f(5) 1(6) 2(7) 3(8) 4(9) 5(10) → index 3 onward = 'def12345'
  expect(showInfo).toHaveBeenCalledWith(
    expect.stringContaining('[def12345]'),
    'Start fresh chat',
    'Snooze this session',
  );
});
