import { test, expect } from 'vitest';
import { computeBurnRate, projectExhaustMs } from './burnRate';
import type { SessionTimeline, TimelineEntry } from '../transcripts/types';

const NOW = 1_700_000_000_000;

function timeline(entries: TimelineEntry[]): SessionTimeline {
  return {
    sessionId: 's1',
    filePath: '/tmp/s1.jsonl',
    entries,
    cumulative: {
      sessionId: 's1',
      filePath: '/tmp/s1.jsonl',
      input: 0,
      output: 0,
      cacheCreate: 0,
      cacheRead: 0,
      total: 0,
      lastModified: new Date(NOW),
      lastTurnInput: 0,
      lastTurnOutput: 0,
    },
  };
}

function entry(offsetMinutes: number, total: number): TimelineEntry {
  return {
    timestampMs: NOW - offsetMinutes * 60_000,
    input: total,
    output: 0,
    cacheCreate: 0,
    cacheRead: 0,
    total,
  };
}

test('computeBurnRate returns zero when no in-window activity', () => {
  const result = computeBurnRate([timeline([entry(60, 1000)])], NOW, 10 * 60_000);
  expect(result.tokensPerMin).toBe(0);
  expect(result.activeMs).toBe(0);
});

test('computeBurnRate averages over the lookback window', () => {
  // Two entries 10 min apart totalling 10 000 tokens.
  // Denominator is the full 10-min lookback → 1 000 tok/min.
  const t = timeline([entry(9, 5000), entry(1, 5000)]);
  const result = computeBurnRate([t], NOW, 10 * 60_000);
  expect(Math.round(result.tokensPerMin)).toBe(1000);
});

test('projectExhaustMs returns undefined when burn rate is zero', () => {
  expect(projectExhaustMs(0, 100_000, 0)).toBeUndefined();
});

test('projectExhaustMs returns undefined when used already exceeds reference', () => {
  expect(projectExhaustMs(200_000, 100_000, 5000)).toBeUndefined();
});

test('projectExhaustMs computes remaining ms at current rate', () => {
  // 100 000 remaining ÷ 1 000 tok/min = 100 minutes = 6 000 000 ms.
  expect(projectExhaustMs(0, 100_000, 1000)).toBe(6_000_000);
});
