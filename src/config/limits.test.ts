import { test, expect, beforeEach } from 'vitest';
import { vi } from 'vitest';

vi.mock('vscode', () => import('../ui/__mocks__/vscode'));

import { getLimits, DEFAULT_LIMITS } from './limits';
import { __setConfig, __clearConfig } from '../ui/__mocks__/vscode';

beforeEach(() => {
  __clearConfig();
});

// ---------------------------------------------------------------------------
// Test 1: returns DEFAULT_LIMITS when configuration is empty
// ---------------------------------------------------------------------------

test('getLimits returns DEFAULT_LIMITS when configuration is empty', () => {
  const result = getLimits();
  expect(result).toEqual(DEFAULT_LIMITS);
});

// ---------------------------------------------------------------------------
// Test 2: accepts valid positive integers for window settings
// ---------------------------------------------------------------------------

test('getLimits accepts valid positive integers for sessionWindowHours and weeklyWindowDays', () => {
  __setConfig('claudeUsageMonitor', 'limits.sessionWindowHours', 8);
  __setConfig('claudeUsageMonitor', 'limits.weeklyWindowDays', 14);
  const result = getLimits();
  expect(result.sessionWindowHours).toBe(8);
  expect(result.weeklyWindowDays).toBe(14);
});

// ---------------------------------------------------------------------------
// Test 3: accepts valid positive integers for token limits
// ---------------------------------------------------------------------------

test('getLimits accepts valid positive integers for token limits', () => {
  __setConfig('claudeUsageMonitor', 'limits.sessionTokens', 50000);
  __setConfig('claudeUsageMonitor', 'limits.weeklyTokens', 200000);
  const result = getLimits();
  expect(result.sessionTokens).toBe(50000);
  expect(result.weeklyTokens).toBe(200000);
});

// ---------------------------------------------------------------------------
// Test 4: null is accepted for token limits (hides percentage display)
// ---------------------------------------------------------------------------

test('getLimits accepts null for sessionTokens and weeklyTokens', () => {
  __setConfig('claudeUsageMonitor', 'limits.sessionTokens', null);
  __setConfig('claudeUsageMonitor', 'limits.weeklyTokens', null);
  const result = getLimits();
  expect(result.sessionTokens).toBeNull();
  expect(result.weeklyTokens).toBeNull();
});

// ---------------------------------------------------------------------------
// Test 5: invalid integers fall back to defaults (negative / zero / string)
// ---------------------------------------------------------------------------

test('getLimits falls back to defaults for negative sessionWindowHours', () => {
  __setConfig('claudeUsageMonitor', 'limits.sessionWindowHours', -1);
  const result = getLimits();
  expect(result.sessionWindowHours).toBe(DEFAULT_LIMITS.sessionWindowHours);
});

test('getLimits falls back to defaults for zero weeklyWindowDays', () => {
  __setConfig('claudeUsageMonitor', 'limits.weeklyWindowDays', 0);
  const result = getLimits();
  expect(result.weeklyWindowDays).toBe(DEFAULT_LIMITS.weeklyWindowDays);
});

test('getLimits falls back to defaults for string session token limit', () => {
  __setConfig('claudeUsageMonitor', 'limits.sessionTokens', 'not-a-number');
  const result = getLimits();
  expect(result.sessionTokens).toBeNull();
});

// ---------------------------------------------------------------------------
// Test 8: sessionTokens=null does not break downstream usage (returns null, not 0)
// ---------------------------------------------------------------------------

test('getLimits sessionTokens null does not blow up: returns null, not a number', () => {
  const result = getLimits();
  // Callers must handle null without dividing by it
  expect(result.sessionTokens).toBeNull();
  // Simulate downstream: if null, percentage is "n/a" — no division
  const pct = result.sessionTokens !== null ? (1000 / result.sessionTokens) * 100 : null;
  expect(pct).toBeNull();
});
