import { test, expect, beforeEach } from 'vitest';

vi.mock('vscode', () => import('../ui/__mocks__/vscode'));

import { vi } from 'vitest';
import { getRefreshIntervalSeconds, DEFAULT_REFRESH_SECONDS } from './refresh';
import { __setConfig, __clearConfig } from '../ui/__mocks__/vscode';

beforeEach(() => {
  __clearConfig();
});

test('returns DEFAULT_REFRESH_SECONDS when config is empty', () => {
  expect(getRefreshIntervalSeconds()).toBe(DEFAULT_REFRESH_SECONDS);
});

test('returns 60 when user set refreshIntervalSeconds to 60', () => {
  __setConfig('claudeUsageMonitor', 'refreshIntervalSeconds', 60);
  expect(getRefreshIntervalSeconds()).toBe(60);
});

test('returns DEFAULT_REFRESH_SECONDS when user set refreshIntervalSeconds to 2 (below minimum)', () => {
  __setConfig('claudeUsageMonitor', 'refreshIntervalSeconds', 2);
  expect(getRefreshIntervalSeconds()).toBe(DEFAULT_REFRESH_SECONDS);
});

test('returns DEFAULT_REFRESH_SECONDS when user set refreshIntervalSeconds to "fast" (non-integer)', () => {
  __setConfig('claudeUsageMonitor', 'refreshIntervalSeconds', 'fast');
  expect(getRefreshIntervalSeconds()).toBe(DEFAULT_REFRESH_SECONDS);
});

test('returns DEFAULT_REFRESH_SECONDS when user set refreshIntervalSeconds to 0', () => {
  __setConfig('claudeUsageMonitor', 'refreshIntervalSeconds', 0);
  expect(getRefreshIntervalSeconds()).toBe(DEFAULT_REFRESH_SECONDS);
});
