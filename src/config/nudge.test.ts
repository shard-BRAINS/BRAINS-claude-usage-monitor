import { test, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => import('../ui/__mocks__/vscode'));

import { getNudgeConfig, addSuppressedSession, DEFAULT_NUDGE_CONFIG } from './nudge';
import { __setConfig, __clearConfig } from '../ui/__mocks__/vscode';

beforeEach(() => {
  __clearConfig();
});

// ---------------------------------------------------------------------------
// Test 1: returns DEFAULT_NUDGE_CONFIG when config keys are empty
// ---------------------------------------------------------------------------

test('returns DEFAULT_NUDGE_CONFIG when configuration is empty', () => {
  const result = getNudgeConfig();
  expect(result).toEqual(DEFAULT_NUDGE_CONFIG);
});

// ---------------------------------------------------------------------------
// Test 2: returns user values when mode, interval, and suppressedSessions are set
// ---------------------------------------------------------------------------

test('returns user values when mode, interval and suppressedSessions are valid', () => {
  __setConfig('claudeUsageMonitor', 'nudge.mode', 'on-each');
  __setConfig('claudeUsageMonitor', 'nudge.minIntervalMinutes', 5);
  __setConfig('claudeUsageMonitor', 'nudge.suppressedSessions', ['sess-1', 'sess-2']);

  const result = getNudgeConfig();
  expect(result.mode).toBe('on-each');
  expect(result.minIntervalMinutes).toBe(5);
  expect(result.suppressedSessions).toEqual(['sess-1', 'sess-2']);
});

// ---------------------------------------------------------------------------
// Test 3: falls back to default on invalid mode (e.g. 'always')
// ---------------------------------------------------------------------------

test('falls back to default mode on invalid mode string', () => {
  __setConfig('claudeUsageMonitor', 'nudge.mode', 'always');

  const result = getNudgeConfig();
  expect(result.mode).toBe(DEFAULT_NUDGE_CONFIG.mode);
});

// ---------------------------------------------------------------------------
// Test 4: falls back to default on negative minIntervalMinutes
// ---------------------------------------------------------------------------

test('falls back to default minIntervalMinutes when value is negative', () => {
  __setConfig('claudeUsageMonitor', 'nudge.minIntervalMinutes', -5);

  const result = getNudgeConfig();
  expect(result.minIntervalMinutes).toBe(DEFAULT_NUDGE_CONFIG.minIntervalMinutes);
});

// ---------------------------------------------------------------------------
// Test 5: falls back to default when suppressedSessions is not an array
// ---------------------------------------------------------------------------

test('falls back to default suppressedSessions when value is not an array', () => {
  __setConfig('claudeUsageMonitor', 'nudge.suppressedSessions', 'not-an-array');

  const result = getNudgeConfig();
  expect(result.suppressedSessions).toEqual([]);
});

// ---------------------------------------------------------------------------
// Test 6: falls back to default suppressedSessions when array contains non-strings
// ---------------------------------------------------------------------------

test('falls back to default suppressedSessions when array contains non-strings', () => {
  __setConfig('claudeUsageMonitor', 'nudge.suppressedSessions', [1, 2, 3]);

  const result = getNudgeConfig();
  expect(result.suppressedSessions).toEqual([]);
});

// ---------------------------------------------------------------------------
// Test 7: addSuppressedSession appends and deduplicates
// ---------------------------------------------------------------------------

test('addSuppressedSession appends new session and deduplicates', async () => {
  __setConfig('claudeUsageMonitor', 'nudge.suppressedSessions', ['existing-sess']);

  await addSuppressedSession('new-sess');
  const after1 = getNudgeConfig();
  expect(after1.suppressedSessions).toContain('existing-sess');
  expect(after1.suppressedSessions).toContain('new-sess');
  expect(after1.suppressedSessions).toHaveLength(2);

  // Call again with the same id — should not duplicate.
  await addSuppressedSession('new-sess');
  const after2 = getNudgeConfig();
  expect(after2.suppressedSessions).toHaveLength(2);
});

// ---------------------------------------------------------------------------
// Test 8: addSuppressedSession starts from empty list when no config is set
// ---------------------------------------------------------------------------

test('addSuppressedSession works when suppressedSessions not yet configured', async () => {
  await addSuppressedSession('first-sess');
  const result = getNudgeConfig();
  expect(result.suppressedSessions).toEqual(['first-sess']);
});
