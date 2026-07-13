import { test, expect } from 'vitest';
import { computeModelMix, friendlyFamily, formatModelMix } from './modelMix';
import type { SessionTimeline, TimelineEntry } from '../transcripts/types';

const NOW = 1_700_000_000_000;

function tl(entries: TimelineEntry[]): SessionTimeline {
  return {
    sessionId: 's',
    filePath: '/tmp/s.jsonl',
    entries,
    cumulative: {
      sessionId: 's',
      filePath: '/tmp/s.jsonl',
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

function e(offsetMin: number, total: number, model?: string): TimelineEntry {
  const entry: TimelineEntry = {
    timestampMs: NOW - offsetMin * 60_000,
    input: total,
    output: 0,
    cacheCreate: 0,
    cacheRead: 0,
    total,
  };
  if (model !== undefined) entry.model = model;
  return entry;
}

test('friendlyFamily maps Opus / Sonnet / Haiku ids', () => {
  expect(friendlyFamily('claude-opus-4-7')).toBe('Opus');
  expect(friendlyFamily('claude-sonnet-4-6')).toBe('Sonnet');
  expect(friendlyFamily('claude-3-5-haiku-20241022')).toBe('Haiku');
  expect(friendlyFamily(undefined)).toBe('Other');
});

test('computeModelMix aggregates tokens per family and sorts desc', () => {
  const t = tl([
    e(10, 1000, 'claude-sonnet-4-6'),
    e(9, 3000, 'claude-opus-4-7'),
    e(8, 500, 'claude-3-5-haiku-20241022'),
    e(7, 2000, 'claude-opus-4-7'),
  ]);
  const mix = computeModelMix([t], 60 * 60_000, NOW);
  expect(mix.map((m) => m.family)).toEqual(['Opus', 'Sonnet', 'Haiku']);
  expect(mix[0].tokens).toBe(5000);
  expect(Math.round(mix[0].pct)).toBe(77);
});

test('computeModelMix returns [] when no in-window entries carry a model tag', () => {
  const t = tl([e(1, 1000)]);
  expect(computeModelMix([t], 60 * 60_000, NOW)).toEqual([]);
});

test('formatModelMix produces a compact single-line label', () => {
  const t = tl([
    e(1, 60, 'claude-opus-4-7'),
    e(1, 30, 'claude-sonnet-4-6'),
    e(1, 10, 'claude-3-5-haiku-20241022'),
  ]);
  const mix = computeModelMix([t], 60 * 60_000, NOW);
  expect(formatModelMix(mix)).toBe('Opus 60% · Sonnet 30% · Haiku 10%');
});
