import { test, expect, vi } from 'vitest';

vi.mock('vscode', () => import('./__mocks__/vscode'));

import { renderHoverMarkdown } from './hoverCard';
import type { HoverCardData, RollingSnapshot, SessionListItem } from './hoverCard';
import type { SessionTotals } from '../transcripts/types';
import type { Sample } from './svg';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function makeSessionTotals(overrides: Partial<SessionTotals> = {}): SessionTotals {
  return {
    sessionId: 'abcdef1234567890',
    filePath: '/tmp/test.jsonl',
    input: 3000,
    output: 1300,
    cacheCreate: 200,
    cacheRead: 1800,
    total: 6300,
    lastModified: new Date(BASE_NOW - 300_000),
    lastTurnInput: 2000,
    lastTurnOutput: 800,
    ...overrides,
  };
}

function makeSessionListItem(id: string, lastActivityMs: number): SessionListItem {
  return {
    sessionId: id,
    label: `slug-${id.slice(0, 4)}`,
    total: 1000,
    lastActivityMs,
  };
}

function makeData(overrides: Partial<HoverCardData> = {}): HoverCardData {
  return {
    session: makeSnapshot(),
    weekly: makeWeeklySnapshot(),
    thisWindow: makeSessionTotals(),
    allSessions: [makeSessionListItem('session-aaa', BASE_NOW - 60_000)],
    nowMs: BASE_NOW,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test 1: markdown contains all four section headers
// ---------------------------------------------------------------------------

test('renderHoverMarkdown contains all required section headers', () => {
  const md = renderHoverMarkdown(makeData());
  expect(md.value).toContain('Claude Usage');
  expect(md.value).toContain('Session (5h)');
  expect(md.value).toContain('Weekly (7d)');
  expect(md.value).toContain('This window');
  expect(md.value).toContain('Recently active sessions');
});

// ---------------------------------------------------------------------------
// Test 2: percentage shows "n/a" when session.limit === null
// ---------------------------------------------------------------------------

test('percentage shows "n/a" when session.limit is null', () => {
  const data = makeData({ session: makeSnapshot({ limit: null }) });
  const md = renderHoverMarkdown(data);
  expect(md.value).toContain('n/a');
});

// ---------------------------------------------------------------------------
// Test 3: percentage shows ">100%" when session.used > session.limit
// ---------------------------------------------------------------------------

test('percentage shows ">100%" when session.used exceeds session.limit', () => {
  const data = makeData({ session: makeSnapshot({ used: 200000, limit: 100000 }) });
  const md = renderHoverMarkdown(data);
  expect(md.value).toContain('>100%');
});

// ---------------------------------------------------------------------------
// Test 4: normal percentage: used=200, limit=1000 => "20.0%"
// ---------------------------------------------------------------------------

test('percentage shows "20.0%" when used=200 limit=1000', () => {
  const data = makeData({ session: makeSnapshot({ used: 200, limit: 1000 }) });
  const md = renderHoverMarkdown(data);
  expect(md.value).toContain('20.0%');
});

// ---------------------------------------------------------------------------
// Test 5: reset countdown — nextResetAt = nowMs + 2h => "2h 0m"
// ---------------------------------------------------------------------------

test('reset countdown shows "2h 0m" when nextResetAt is 2 hours from now', () => {
  const data = makeData({
    session: makeSnapshot({ nextResetAt: BASE_NOW + 2 * 3600_000 }),
  });
  const md = renderHoverMarkdown(data);
  expect(md.value).toContain('2h 0m');
});

// ---------------------------------------------------------------------------
// Test 6: all-sessions list caps at 5 rows even with 10 items
// Also verifies "Last hour" header appears when sparkline is provided
// ---------------------------------------------------------------------------

test('all-sessions list caps at 5 even when input has 10 entries', () => {
  const sessions: SessionListItem[] = Array.from({ length: 10 }, (_, i) =>
    makeSessionListItem(`session-${i.toString().padStart(3, '0')}`, BASE_NOW - i * 60_000),
  );
  const sparkline: Sample[] = Array.from({ length: 60 }, (_, i) => ({
    tMs: BASE_NOW - (59 - i) * 60_000,
    cumulative: i * 100,
  }));
  const data = makeData({ allSessions: sessions, sparkline });
  const md = renderHoverMarkdown(data);
  // Count list item dashes — each session row starts with "- `"
  const matches = md.value.match(/^- `/gm);
  expect(matches).not.toBeNull();
  expect(matches!.length).toBeLessThanOrEqual(5);
  expect(md.value).toContain('Last hour');
});

// ---------------------------------------------------------------------------
// Test 7: empty allSessions still renders the section header without crashing
// ---------------------------------------------------------------------------

test('empty allSessions renders section header without crashing', () => {
  const data = makeData({ allSessions: [] });
  const md = renderHoverMarkdown(data);
  expect(md.value).toContain('Recently active sessions');
  expect(md.value).toContain('No sessions found');
});

// ---------------------------------------------------------------------------
// Test 8: thisWindow undefined shows "No session found for this workspace"
// ---------------------------------------------------------------------------

test('thisWindow undefined shows "No session found for this workspace"', () => {
  const data = makeData({ thisWindow: undefined });
  const md = renderHoverMarkdown(data);
  expect(md.value).toContain('No session found for this workspace');
});

// ---------------------------------------------------------------------------
// Test 9: supportHtml is set to true
// ---------------------------------------------------------------------------

test('hover card sets supportHtml true', () => {
  const md = renderHoverMarkdown(makeData());
  expect(md.supportHtml).toBe(true);
});

// ---------------------------------------------------------------------------
// Test 10: session bar uses SVG data URI img tag
// ---------------------------------------------------------------------------

test('hover card contains img src data:image/svg+xml;base64 for the session bar', () => {
  const md = renderHoverMarkdown(makeData());
  expect(md.value).toContain('<img src="data:image/svg+xml;base64,');
});

// ---------------------------------------------------------------------------
// Test 11: Last hour section is omitted when sparkline is undefined
// ---------------------------------------------------------------------------

test('hover card omits Last hour section when sparkline undefined', () => {
  const data = makeData({ sparkline: undefined });
  const md = renderHoverMarkdown(data);
  expect(md.value).not.toContain('Last hour');
});
