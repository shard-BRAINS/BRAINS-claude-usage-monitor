import { test, expect } from 'vitest';
import * as path from 'path';
import { aggregateSession, aggregateSessionTimeline, computeBillable } from './aggregator';
import expected from './__fixtures__/expected-totals.json';
import expectedTimeline from './__fixtures__/expected-timeline.json';

const fixturesDir = path.join(__dirname, '__fixtures__');

test('aggregates session-a totals correctly', async () => {
  const result = await aggregateSession(path.join(fixturesDir, 'session-a.jsonl'));
  const exp = expected['session-a'];
  expect(result.sessionId).toBe('session-a');
  expect(result.input).toBe(exp.input);
  expect(result.output).toBe(exp.output);
  expect(result.cacheCreate).toBe(exp.cacheCreate);
  expect(result.cacheRead).toBe(exp.cacheRead);
  expect(result.total).toBe(exp.total);
  expect(result.lastModified).toBeInstanceOf(Date);
  expect(result.lastTurnInput).toBe(exp.lastTurnInput);
  expect(result.lastTurnOutput).toBe(exp.lastTurnOutput);
});

test('aggregates session-b totals correctly (skips malformed and no-usage lines)', async () => {
  const result = await aggregateSession(path.join(fixturesDir, 'session-b.jsonl'));
  const exp = expected['session-b'];
  expect(result.sessionId).toBe('session-b');
  expect(result.input).toBe(exp.input);
  expect(result.output).toBe(exp.output);
  expect(result.cacheCreate).toBe(exp.cacheCreate);
  expect(result.cacheRead).toBe(exp.cacheRead);
  expect(result.total).toBe(exp.total);
  expect(result.lastModified).toBeInstanceOf(Date);
  expect(result.lastTurnInput).toBe(exp.lastTurnInput);
  expect(result.lastTurnOutput).toBe(exp.lastTurnOutput);
});

test('filePath in session-a result matches the input path', async () => {
  const filePath = path.join(fixturesDir, 'session-a.jsonl');
  const result = await aggregateSession(filePath);
  expect(result.filePath).toBe(filePath);
});

test('session with zero usage records returns zero last-turn fields', async () => {
  const result = await aggregateSession(path.join(fixturesDir, 'session-empty.jsonl'));
  expect(result.total).toBe(0);
  expect(result.lastTurnInput).toBe(0);
  expect(result.lastTurnOutput).toBe(0);
});

test('aggregateSessionTimeline entry count matches expected for session-a', async () => {
  const result = await aggregateSessionTimeline(path.join(fixturesDir, 'session-a.jsonl'));
  const exp = expectedTimeline['session-a'];
  expect(result.sessionId).toBe('session-a');
  expect(result.entries.length).toBe(exp.entryCount);
});

test('aggregateSessionTimeline first and last timestamps match expected for session-a', async () => {
  const result = await aggregateSessionTimeline(path.join(fixturesDir, 'session-a.jsonl'));
  const exp = expectedTimeline['session-a'];
  expect(result.entries[0].timestampMs).toBe(exp.firstTimestampMs);
  expect(result.entries[result.entries.length - 1].timestampMs).toBe(exp.lastTimestampMs);
});

test('aggregateSessionTimeline cumulative matches aggregateSession for session-a', async () => {
  const timeline = await aggregateSessionTimeline(path.join(fixturesDir, 'session-a.jsonl'));
  const totals = await aggregateSession(path.join(fixturesDir, 'session-a.jsonl'));
  expect(timeline.cumulative.input).toBe(totals.input);
  expect(timeline.cumulative.output).toBe(totals.output);
  expect(timeline.cumulative.total).toBe(totals.total);
  expect(timeline.cumulative.lastTurnInput).toBe(totals.lastTurnInput);
  expect(timeline.cumulative.lastTurnOutput).toBe(totals.lastTurnOutput);
});

test('computeBillable applies Anthropic cache-price weights', () => {
  expect(computeBillable(0, 0, 0, 0)).toBe(0);
  expect(computeBillable(100, 50, 0, 0)).toBe(150);
  // cacheCreate weighted at 1.25
  expect(computeBillable(0, 0, 1000, 0)).toBe(1250);
  // cacheRead weighted at 0.10
  expect(computeBillable(0, 0, 0, 1000)).toBe(100);
  // combined: 100 + 50 + 1000*1.25 + 17_247_221*0.10 = 1_726_122 (rounds)
  expect(computeBillable(100, 50, 1000, 17_247_221)).toBe(
    Math.round(100 + 50 + 1000 * 1.25 + 17_247_221 * 0.1),
  );
});

test('aggregateSession dedupes by message.id, keeping each id once', async () => {
  const result = await aggregateSession(path.join(fixturesDir, 'session-dup.jsonl'));
  // 4 records, 2 unique ids → keep msg_aaa (100/50/1000/0) and msg_bbb (200/100/0/1100)
  expect(result.input).toBe(300);
  expect(result.output).toBe(150);
  expect(result.cacheCreate).toBe(1000);
  expect(result.cacheRead).toBe(1100);
  // billable: 300 + 150 + 1000*1.25 + 1100*0.10 = 1810
  expect(result.total).toBe(1810);
});

test('aggregateSessionTimeline dedupes by message.id (one entry per unique id)', async () => {
  const result = await aggregateSessionTimeline(path.join(fixturesDir, 'session-dup.jsonl'));
  expect(result.entries.length).toBe(2);
  expect(result.cumulative.total).toBe(1810);
});
