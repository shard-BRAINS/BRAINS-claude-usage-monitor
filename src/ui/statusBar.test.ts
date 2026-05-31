import { test, expect, vi } from 'vitest';

vi.mock('vscode', () => import('./__mocks__/vscode'));

import { createStatusBar, _test } from './statusBar';
import { ThemeColor, window as vscodeWindow, context as fakeContext } from './__mocks__/vscode';
import type { SessionTotals } from '../transcripts/types';
import type { HoverCardData, RollingSnapshot, SessionListItem } from './hoverCard';
import { EventEmitter } from 'events';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTotals(total: number): SessionTotals {
  return {
    sessionId: 'test-session',
    filePath: '/tmp/test.jsonl',
    input: Math.floor(total * 0.4),
    output: Math.floor(total * 0.3),
    cacheRead: Math.floor(total * 0.2),
    cacheCreate: Math.floor(total * 0.1),
    total,
    lastModified: new Date(),
    lastTurnInput: Math.floor(total * 0.4),
    lastTurnOutput: Math.floor(total * 0.3),
  };
}

function makeMinimalHoverData(sessionUsed = 0, sessionLimit: number | null = null): HoverCardData {
  const now = Date.now();
  const session: RollingSnapshot = {
    windowLabel: 'Session (5h)',
    used: sessionUsed,
    limit: sessionLimit,
    nextResetAt: undefined,
  };
  const weekly: RollingSnapshot = {
    windowLabel: 'Weekly (7d)',
    used: 0,
    limit: null,
    nextResetAt: undefined,
  };
  const allSessions: SessionListItem[] = [];
  return { session, weekly, thisWindow: undefined, allSessions, nowMs: now };
}

// ---------------------------------------------------------------------------
// Test 1: format helper
// ---------------------------------------------------------------------------

test('format produces "1234" for 1234 and "12.3k" for 12345', () => {
  expect(_test.format(1234)).toBe('1234');
  expect(_test.format(12345)).toBe('12.3k');
});

test('format produces M suffix for values >= 1M', () => {
  expect(_test.format(1500000)).toBe('1.5M');
  expect(_test.format(2000000)).toBe('2.0M');
});

// ---------------------------------------------------------------------------
// Test 2: update — no color when below warning
// ---------------------------------------------------------------------------

test('update sets backgroundColor undefined when total < warning', () => {
  const item = vscodeWindow.createStatusBarItem(1, 100);
  const totals = makeTotals(50000);
  const thresholds = { warning: 100000, critical: 160000 };

  _test.update(item as unknown as import('vscode').StatusBarItem, totals, thresholds);

  expect(item.backgroundColor).toBeUndefined();
});

// ---------------------------------------------------------------------------
// Test 3: update — warningBackground when warning <= total < critical
// ---------------------------------------------------------------------------

test('update sets warningBackground when warning <= total < critical', () => {
  const item = vscodeWindow.createStatusBarItem(1, 100);
  const totals = makeTotals(130000);
  const thresholds = { warning: 100000, critical: 160000 };

  _test.update(item as unknown as import('vscode').StatusBarItem, totals, thresholds);

  expect(item.backgroundColor).toBeInstanceOf(ThemeColor);
  expect((item.backgroundColor as ThemeColor).id).toBe('statusBarItem.warningBackground');
});

// ---------------------------------------------------------------------------
// Test 4: update — errorBackground when total >= critical
// ---------------------------------------------------------------------------

test('update sets errorBackground when total >= critical', () => {
  const item = vscodeWindow.createStatusBarItem(1, 100);
  const totals = makeTotals(170000);
  const thresholds = { warning: 100000, critical: 160000 };

  _test.update(item as unknown as import('vscode').StatusBarItem, totals, thresholds);

  expect((item.backgroundColor as ThemeColor).id).toBe('statusBarItem.errorBackground');
});

// ---------------------------------------------------------------------------
// Test 5: createStatusBar registers in subscriptions and calls show()
// ---------------------------------------------------------------------------

test('createStatusBar registers item in context.subscriptions and calls show()', () => {
  fakeContext.subscriptions.length = 0;

  const watcher = new EventEmitter() as unknown as import('../transcripts/watcher').TranscriptWatcher;
  const ctx = fakeContext as unknown as import('vscode').ExtensionContext;

  const item = createStatusBar(
    ctx,
    watcher,
    () => ({ warning: 100000, critical: 160000 }),
    makeMinimalHoverData,
  );

  expect(fakeContext.subscriptions.length).toBe(1);
  expect((item as unknown as { shown: boolean }).shown).toBe(true);
});

// ---------------------------------------------------------------------------
// buildFillIndicator unit tests
// ---------------------------------------------------------------------------

test('buildFillIndicator returns 0 filled for ratio 0', () => {
  expect(_test.buildFillIndicator(0, 100)).toBe('░░░░░░░░░░');
});

test('buildFillIndicator returns 5 filled for ratio 0.5', () => {
  expect(_test.buildFillIndicator(50, 100)).toBe('█████░░░░░');
});

test('buildFillIndicator returns 10 filled for ratio 1.0', () => {
  expect(_test.buildFillIndicator(100, 100)).toBe('██████████');
});

test('buildFillIndicator caps at 10 filled for overflow', () => {
  expect(_test.buildFillIndicator(200, 100)).toBe('██████████');
});

// ---------------------------------------------------------------------------
// update — session limit path
// ---------------------------------------------------------------------------

test('update uses session limit when set', () => {
  const item = vscodeWindow.createStatusBarItem(1, 100);
  const totals = makeTotals(0);
  const thresholds = { warning: 100000, critical: 160000 };
  const hoverData = makeMinimalHoverData(500, 1000);

  _test.update(item as unknown as import('vscode').StatusBarItem, totals, thresholds, hoverData);

  // ratio = 500/1000 = 0.5 → 5 filled blocks
  expect(item.text).toContain('█████░░░░░');
});

test('update falls back to critical threshold when session limit null', () => {
  const item = vscodeWindow.createStatusBarItem(1, 100);
  // thisWindow.total = 80000, critical = 160000 → ratio 0.5 → 5 filled
  const totals = makeTotals(80000);
  const thresholds = { warning: 100000, critical: 160000 };
  const hoverData = makeMinimalHoverData(0, null);
  // Attach thisWindow so the fallback reads it
  hoverData.thisWindow = makeTotals(80000);

  _test.update(item as unknown as import('vscode').StatusBarItem, totals, thresholds, hoverData);

  expect(item.text).toContain('█████░░░░░');
});

// ---------------------------------------------------------------------------
// update — color driven by ratio, not raw threshold
// ---------------------------------------------------------------------------

test('update colors yellow above warning ratio', () => {
  // warningRatio = 100000/160000 = 0.625; use session limit to set ratio 0.7
  const item = vscodeWindow.createStatusBarItem(1, 100);
  const totals = makeTotals(0);
  const thresholds = { warning: 100000, critical: 160000 };
  const hoverData = makeMinimalHoverData(700, 1000); // ratio = 0.7

  _test.update(item as unknown as import('vscode').StatusBarItem, totals, thresholds, hoverData);

  expect(item.backgroundColor).toBeInstanceOf(ThemeColor);
  expect((item.backgroundColor as ThemeColor).id).toBe('statusBarItem.warningBackground');
});

test('update colors red at ratio >= 1.0', () => {
  const item = vscodeWindow.createStatusBarItem(1, 100);
  const totals = makeTotals(0);
  const thresholds = { warning: 100000, critical: 160000 };
  const hoverData = makeMinimalHoverData(1500, 1000); // ratio = 1.5

  _test.update(item as unknown as import('vscode').StatusBarItem, totals, thresholds, hoverData);

  expect(item.backgroundColor).toBeInstanceOf(ThemeColor);
  expect((item.backgroundColor as ThemeColor).id).toBe('statusBarItem.errorBackground');
});
