import { test, expect, vi } from 'vitest';
vi.mock('vscode', () => import('./ui/__mocks__/vscode'));
import { _test } from './extension';
import type { SessionTimeline } from './transcripts/types';

const { buildSparkline } = _test;

function timeline(entries: Array<{ tMinAgo: number; total: number }>, nowMs: number): SessionTimeline {
  return {
    sessionId: 's',
    filePath: '/tmp/s.jsonl',
    cumulative: {
      sessionId: 's',
      filePath: '/tmp/s.jsonl',
      input: 0,
      output: 0,
      cacheCreate: 0,
      cacheRead: 0,
      total: 0,
      lastModified: new Date(nowMs),
      lastTurnInput: 0,
      lastTurnOutput: 0,
    },
    entries: entries.map((e) => ({
      timestampMs: nowMs - e.tMinAgo * 60_000,
      input: 0,
      output: 0,
      cacheCreate: 0,
      cacheRead: 0,
      total: e.total,
    })),
  };
}

test('buildSparkline returns [] when no entries fall in the last hour', () => {
  const now = 1_700_000_000_000;
  const t = timeline([{ tMinAgo: 120, total: 5000 }], now); // 2h ago, outside window
  expect(buildSparkline([t], now)).toEqual([]);
});

test('buildSparkline yields 60 points covering the last hour', () => {
  const now = 1_700_000_000_000;
  const t = timeline([{ tMinAgo: 0, total: 100 }], now);
  const result = buildSparkline([t], now);
  expect(result).toHaveLength(60);
});

test('buildSparkline produces a monotonically non-decreasing cumulative series', () => {
  const now = 1_700_000_000_000;
  const t = timeline(
    [
      { tMinAgo: 50, total: 1000 },
      { tMinAgo: 30, total: 500 },
      { tMinAgo: 10, total: 250 },
      { tMinAgo: 0, total: 750 },
    ],
    now,
  );
  const result = buildSparkline([t], now);
  for (let i = 1; i < result.length; i++) {
    expect(result[i].cumulative).toBeGreaterThanOrEqual(result[i - 1].cumulative);
  }
  // Final cumulative equals the sum of in-window entry totals.
  expect(result[result.length - 1].cumulative).toBe(1000 + 500 + 250 + 750);
});

test('buildSparkline merges entries across multiple timelines into one curve', () => {
  const now = 1_700_000_000_000;
  const a = timeline([{ tMinAgo: 20, total: 300 }], now);
  const b = timeline([{ tMinAgo: 5, total: 700 }], now);
  const result = buildSparkline([a, b], now);
  expect(result[result.length - 1].cumulative).toBe(1000);
  // Cumulative at the 20-min-ago point should already include the 300 from
  // timeline a but not yet the 700 from timeline b.
  const at40MinForward = result[40]; // window minute 40 corresponds to ~20m ago
  expect(at40MinForward.cumulative).toBe(300);
});

test('buildSparkline drops entries newer than now', () => {
  const now = 1_700_000_000_000;
  const t: SessionTimeline = {
    sessionId: 's',
    filePath: '/tmp/s.jsonl',
    cumulative: {
      sessionId: 's',
      filePath: '/tmp/s.jsonl',
      input: 0,
      output: 0,
      cacheCreate: 0,
      cacheRead: 0,
      total: 0,
      lastModified: new Date(now),
      lastTurnInput: 0,
      lastTurnOutput: 0,
    },
    entries: [
      { timestampMs: now + 60_000, input: 0, output: 0, cacheCreate: 0, cacheRead: 0, total: 999 },
    ],
  };
  expect(buildSparkline([t], now)).toEqual([]);
});
