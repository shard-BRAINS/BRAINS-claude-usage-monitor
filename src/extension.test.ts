import { test, expect, vi } from 'vitest';
vi.mock('vscode', () => import('./ui/__mocks__/vscode'));
import { _test } from './extension';
import type { SessionTimeline } from './transcripts/types';

const { buildSparkline, bucketTokensInWindow, buildWindowDetail } = _test;

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

// ---------------------------------------------------------------------------
// bucketTokensInWindow
// ---------------------------------------------------------------------------

const HOUR_MS = 60 * 60 * 1000;

test('bucketTokensInWindow places entries into the correct oldest-first bucket', () => {
  const now = 1_700_000_000_000;
  // 5h window, 5 buckets of 1h each. Pick mid-bucket times (30min into each)
  // so entries don't sit on bucket boundaries: 270, 210, 150, 90, 30 minutes ago
  // map to buckets 0..4 respectively.
  const t = timeline(
    [
      { tMinAgo: 270, total: 100 },
      { tMinAgo: 210, total: 200 },
      { tMinAgo: 150, total: 300 },
      { tMinAgo: 90, total: 400 },
      { tMinAgo: 30, total: 500 },
    ],
    now,
  );
  const buckets = bucketTokensInWindow([t], 5 * HOUR_MS, 5, now);
  expect(buckets).toEqual([100, 200, 300, 400, 500]);
});

test('bucketTokensInWindow ignores entries outside [now - windowMs, now]', () => {
  const now = 1_700_000_000_000;
  const t = timeline(
    [
      { tMinAgo: 600, total: 999 },
      { tMinAgo: 30, total: 100 },
      { tMinAgo: -5, total: 99 },
    ],
    now,
  );
  const buckets = bucketTokensInWindow([t], 5 * HOUR_MS, 5, now);
  expect(buckets.reduce((a, b) => a + b, 0)).toBe(100);
});

// ---------------------------------------------------------------------------
// buildWindowDetail
// ---------------------------------------------------------------------------

test('buildWindowDetail returns zero intensity/saturation and empty samples for no activity', () => {
  const now = 1_700_000_000_000;
  const detail = buildWindowDetail([], 5 * HOUR_MS, 20, now);
  expect(detail.buckets.every((b) => b === 0)).toBe(true);
  expect(detail.samples).toEqual([]);
  expect(detail.intensity).toBe(0);
  expect(detail.saturation).toBe(0);
});

test('buildWindowDetail intensity = latest non-zero bucket value / peak', () => {
  const now = 1_700_000_000_000;
  // 5h window, 5 1h buckets. Heavy spike at bucket 1 (3h ago), small tail at bucket 4 (now).
  const t = timeline(
    [
      { tMinAgo: 180, total: 1000 },
      { tMinAgo: 1, total: 250 },
    ],
    now,
  );
  const detail = buildWindowDetail([t], 5 * HOUR_MS, 5, now);
  expect(detail.intensity).toBeCloseTo(0.25, 5);
});

test('buildWindowDetail intensity caps at 1 when latest bucket IS the peak', () => {
  const now = 1_700_000_000_000;
  const t = timeline(
    [
      { tMinAgo: 180, total: 100 },
      { tMinAgo: 1, total: 1000 },
    ],
    now,
  );
  const detail = buildWindowDetail([t], 5 * HOUR_MS, 5, now);
  expect(detail.intensity).toBe(1);
});

test('buildWindowDetail saturation reflects window coverage', () => {
  const now = 1_700_000_000_000;
  // Single entry 4h ago in a 5h window → saturation = 4/5 = 0.8.
  const t = timeline([{ tMinAgo: 240, total: 100 }], now);
  const detail = buildWindowDetail([t], 5 * HOUR_MS, 5, now);
  expect(detail.saturation).toBeCloseTo(240 / 300, 3);
});

test('buildWindowDetail saturation is 0 when no activity sits in window', () => {
  const now = 1_700_000_000_000;
  const t = timeline([{ tMinAgo: 600, total: 100 }], now);
  const detail = buildWindowDetail([t], 5 * HOUR_MS, 5, now);
  expect(detail.saturation).toBe(0);
});

test('buildWindowDetail samples derived from buckets are monotonic and end at total', () => {
  const now = 1_700_000_000_000;
  const t = timeline(
    [
      { tMinAgo: 240, total: 100 },
      { tMinAgo: 120, total: 200 },
      { tMinAgo: 1, total: 300 },
    ],
    now,
  );
  const detail = buildWindowDetail([t], 5 * HOUR_MS, 5, now);
  expect(detail.samples).toHaveLength(5);
  for (let i = 1; i < detail.samples.length; i++) {
    expect(detail.samples[i].cumulative).toBeGreaterThanOrEqual(detail.samples[i - 1].cumulative);
  }
  expect(detail.samples[detail.samples.length - 1].cumulative).toBe(600);
});
