import { test, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('vscode', () => import('./__mocks__/vscode'));

import { renderRows, renderUsagePanel, UsageSidebarProvider } from './sidebarView';
import type { SessionTotals } from '../transcripts/types';
import type { HoverCardData, RollingSnapshot, SessionListItem } from './hoverCard';
import { Uri, makeFakeWebviewView } from './__mocks__/vscode';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTotals(overrides: Partial<SessionTotals> = {}): SessionTotals {
  return {
    sessionId: 'test',
    filePath: '/tmp/test.jsonl',
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheCreate: 0,
    total: 0,
    lastModified: new Date(),
    lastTurnInput: 0,
    lastTurnOutput: 0,
    ...overrides,
  };
}

const BASE_NOW = 1_700_000_000_000;

function makeSnapshot(overrides: Partial<RollingSnapshot> = {}): RollingSnapshot {
  return {
    windowLabel: 'Session (5h)',
    used: 1000,
    limit: 10000,
    nextResetAt: BASE_NOW + 2 * 3600_000,
    ...overrides,
  };
}

function makeWeeklySnapshot(overrides: Partial<RollingSnapshot> = {}): RollingSnapshot {
  return {
    windowLabel: 'Weekly (7d)',
    used: 5000,
    limit: 50000,
    nextResetAt: BASE_NOW + 24 * 3600_000,
    ...overrides,
  };
}

function makeHoverData(overrides: Partial<HoverCardData> = {}): HoverCardData {
  const allSessions: SessionListItem[] = [
    {
      sessionId: 'abc123',
      label: 'my-project',
      total: 1500,
      lastActivityMs: BASE_NOW - 60_000,
    },
  ];
  return {
    session: makeSnapshot(),
    weekly: makeWeeklySnapshot(),
    thisWindow: makeTotals({ sessionId: 'abcdef12345678', total: 3000 }),
    allSessions,
    nowMs: BASE_NOW,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Legacy renderRows tests
// ---------------------------------------------------------------------------

test('renderRows produces 0% progress for total 0', () => {
  const totals = makeTotals({ total: 0 });
  const { progressWidthPercent } = renderRows(totals, { warning: 100000, critical: 160000 });
  expect(progressWidthPercent).toBe('0%');
});

test('renderRows produces 50% for total = critical/2', () => {
  const totals = makeTotals({ total: 80000 });
  const { progressWidthPercent } = renderRows(totals, { warning: 100000, critical: 160000 });
  expect(progressWidthPercent).toBe('50%');
});

test('renderRows produces 100% for total >= critical (clamps)', () => {
  const totals = makeTotals({ total: 320000 });
  const { progressWidthPercent } = renderRows(totals, { warning: 100000, critical: 160000 });
  expect(progressWidthPercent).toBe('100%');
});

test('renderRows formats values with comma thousands', () => {
  const totals = makeTotals({ input: 1234567, total: 1234567 });
  const { rows } = renderRows(totals, { warning: 100000, critical: 160000 });
  expect(rows['input']).toBe('1,234,567');
});

test('renderRows rounds progress percent to nearest integer', () => {
  const totals25 = makeTotals({ total: 40000 });
  const { progressWidthPercent: pct25 } = renderRows(totals25, { warning: 100000, critical: 160000 });
  expect(pct25).toBe('25%');

  const totals33 = makeTotals({ total: 53333 });
  const { progressWidthPercent: pct33 } = renderRows(totals33, { warning: 100000, critical: 160000 });
  expect(pct33).toBe('33%');
});

// ---------------------------------------------------------------------------
// renderUsagePanel tests
// ---------------------------------------------------------------------------

test('renderUsagePanel contains all major section labels', () => {
  const html = renderUsagePanel(makeHoverData());
  expect(html).toContain('Claude Usage');
  expect(html).toContain('Session (5h)');
  expect(html).toContain('Weekly (7d)');
  expect(html).toContain('This window');
  expect(html).toContain('All sessions');
});

test('renderUsagePanel shows "n/a" when session limit is null', () => {
  const html = renderUsagePanel(makeHoverData({ session: makeSnapshot({ limit: null }) }));
  expect(html).toContain('n/a');
});

test('renderUsagePanel shows "No session found" when thisWindow is undefined', () => {
  const html = renderUsagePanel(makeHoverData({ thisWindow: undefined }));
  expect(html).toContain('No session found for this workspace');
});

test('renderUsagePanel shows "No sessions found" when allSessions is empty', () => {
  const html = renderUsagePanel(makeHoverData({ allSessions: [] }));
  expect(html).toContain('No sessions found');
});

// ---------------------------------------------------------------------------
// UsageSidebarProvider.refresh() tests
// ---------------------------------------------------------------------------

function makeFakeWatcher() {
  return {
    on: vi.fn(),
    off: vi.fn(),
  };
}

test('UsageSidebarProvider.refresh() before resolveWebviewView is a no-op', () => {
  const watcher = makeFakeWatcher();
  const provider = new UsageSidebarProvider(
    Uri.file('/fake/ext'),
    watcher as unknown as import('../transcripts/watcher').TranscriptWatcher,
    () => ({ warning: 100000, critical: 160000 }),
    makeHoverData,
  );

  expect(() => provider.refresh()).not.toThrow();
});

test('UsageSidebarProvider.refresh() after resolveWebviewView posts a panel message', () => {
  const watcher = makeFakeWatcher();
  const provider = new UsageSidebarProvider(
    Uri.file('/fake/ext'),
    watcher as unknown as import('../transcripts/watcher').TranscriptWatcher,
    () => ({ warning: 100000, critical: 160000 }),
    makeHoverData,
  );

  const fakeView = makeFakeWebviewView();
  const postMessageSpy = vi.spyOn(fakeView.webview, 'postMessage');

  provider.resolveWebviewView(
    fakeView as unknown as import('vscode').WebviewView,
    {} as unknown as import('vscode').WebviewViewResolveContext,
    {} as unknown as import('vscode').CancellationToken,
  );

  provider.refresh();

  expect(postMessageSpy).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'panel', html: expect.stringContaining('<') }),
  );
});

// ---------------------------------------------------------------------------
// package.json contributes shape test
// ---------------------------------------------------------------------------

test('package.json contributes shape is correct', () => {
  const pkgPath = path.resolve(__dirname, '..', '..', 'package.json');
  const raw = fs.readFileSync(pkgPath, 'utf-8');
  const pkg = JSON.parse(raw) as {
    contributes: {
      viewsContainers: { activitybar: Array<{ id: string }> };
      views: Record<string, Array<{ id: string; type: string }>>;
      configuration: { properties: Record<string, unknown> };
    };
  };

  expect(pkg.contributes.viewsContainers.activitybar[0].id).toBe('claudeUsageMonitor');
  expect(pkg.contributes.views['claudeUsageMonitor'][0].id).toBe('claudeUsageMonitor.view');
  expect(pkg.contributes.views['claudeUsageMonitor'][0].type).toBe('webview');

  const props = pkg.contributes.configuration.properties;
  expect(props).toHaveProperty('claudeUsageMonitor.nudge.mode');
  expect(props).toHaveProperty('claudeUsageMonitor.nudge.minIntervalMinutes');
  expect(props).toHaveProperty('claudeUsageMonitor.nudge.suppressedSessions');
  expect(props).toHaveProperty('claudeUsageMonitor.limits.sessionTokens');
  expect(props).toHaveProperty('claudeUsageMonitor.limits.weeklyTokens');
  expect(props).toHaveProperty('claudeUsageMonitor.limits.sessionWindowHours');
  expect(props).toHaveProperty('claudeUsageMonitor.limits.weeklyWindowDays');
});
