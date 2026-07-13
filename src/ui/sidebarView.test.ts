import { test, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('vscode', () => import('./__mocks__/vscode'));

import { renderUsagePanel, UsageSidebarProvider } from './sidebarView';
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
    reference: 10000,
    referenceSource: 'configured',
    nextResetAt: BASE_NOW + 2 * 3600_000,
    ...overrides,
  };
}

function makeWeeklySnapshot(overrides: Partial<RollingSnapshot> = {}): RollingSnapshot {
  return {
    windowLabel: 'Weekly (7d)',
    used: 5000,
    limit: 50000,
    reference: 50000,
    referenceSource: 'configured',
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
// renderUsagePanel tests
// ---------------------------------------------------------------------------

test('renderUsagePanel contains all major section labels', () => {
  const html = renderUsagePanel(makeHoverData());
  expect(html).toContain('Claude Usage');
  expect(html).toContain('Session (5h)');
  expect(html).toContain('Weekly (7d)');
  expect(html).toContain('This window');
  expect(html).toContain('Recently active sessions');
});

test('renderUsagePanel shows soft-reference label when session limit is null', () => {
  const html = renderUsagePanel(
    makeHoverData({
      session: makeSnapshot({
        limit: null,
        reference: 220_000,
        referenceSource: 'default',
        used: 22_000,
      }),
    }),
  );
  expect(html).toContain('typical');
  expect(html).toContain('10.0%');
});

test('renderUsagePanel shows "No session found" when thisWindow is undefined', () => {
  const html = renderUsagePanel(makeHoverData({ thisWindow: undefined }));
  expect(html).toContain('No session found for this workspace');
});

test('renderUsagePanel shows "No sessions found" when allSessions is empty', () => {
  const html = renderUsagePanel(makeHoverData({ allSessions: [] }));
  expect(html).toContain('No sessions found');
});

test('renderUsagePanel renders a Burn row with rate + projected exhaust when burn > 0', () => {
  const html = renderUsagePanel(
    makeHoverData({
      session: makeSnapshot({
        tokensPerMin: 1500,
        projectedExhaustMs: 20 * 60_000,
      }),
    }),
  );
  expect(html).toContain('>Burn<');
  expect(html).toContain('tok/min');
});

test('renderUsagePanel suppresses the Burn row when tokensPerMin is zero', () => {
  const html = renderUsagePanel(
    makeHoverData({
      session: makeSnapshot({ tokensPerMin: 0 }),
      weekly: makeWeeklySnapshot({ tokensPerMin: 0 }),
    }),
  );
  expect(html).not.toContain('>Burn<');
});

test('renderUsagePanel renders a Models row when modelMix is populated', () => {
  const html = renderUsagePanel(
    makeHoverData({
      session: makeSnapshot({
        modelMix: [
          { family: 'Opus', tokens: 900 },
          { family: 'Sonnet', tokens: 100 },
        ],
      }),
    }),
  );
  expect(html).toContain('>Models<');
});

test('renderUsagePanel suppresses the Models row when modelMix is empty', () => {
  const html = renderUsagePanel(
    makeHoverData({
      session: makeSnapshot({ modelMix: [] }),
    }),
  );
  expect(html).not.toContain('>Models<');
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
    makeHoverData,
  );

  expect(() => provider.refresh()).not.toThrow();
});

test('UsageSidebarProvider.refresh() after resolveWebviewView posts a panel message', () => {
  const watcher = makeFakeWatcher();
  const provider = new UsageSidebarProvider(
    Uri.file('/fake/ext'),
    watcher as unknown as import('../transcripts/watcher').TranscriptWatcher,
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
  expect(props).toHaveProperty('claudeUsageMonitor.unconfiguredBarStyle');
});
