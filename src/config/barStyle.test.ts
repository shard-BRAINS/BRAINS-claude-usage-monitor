import { test, expect, beforeEach } from 'vitest';

vi.mock('vscode', () => import('../ui/__mocks__/vscode'));

import { vi } from 'vitest';
import { getUnconfiguredBarStyle, DEFAULT_UNCONFIGURED_BAR_STYLE } from './barStyle';
import { __setConfig, __clearConfig } from '../ui/__mocks__/vscode';

beforeEach(() => {
  __clearConfig();
});

test('returns default when config is empty', () => {
  expect(getUnconfiguredBarStyle()).toBe(DEFAULT_UNCONFIGURED_BAR_STYLE);
});

test('returns "sparkline" when user set it', () => {
  __setConfig('claudeUsageMonitor', 'unconfiguredBarStyle', 'sparkline');
  expect(getUnconfiguredBarStyle()).toBe('sparkline');
});

test('returns "dual-band" when user set it', () => {
  __setConfig('claudeUsageMonitor', 'unconfiguredBarStyle', 'dual-band');
  expect(getUnconfiguredBarStyle()).toBe('dual-band');
});

test('returns "heatmap" when user set it', () => {
  __setConfig('claudeUsageMonitor', 'unconfiguredBarStyle', 'heatmap');
  expect(getUnconfiguredBarStyle()).toBe('heatmap');
});

test('returns default when user set an unknown value', () => {
  __setConfig('claudeUsageMonitor', 'unconfiguredBarStyle', 'fancy');
  expect(getUnconfiguredBarStyle()).toBe(DEFAULT_UNCONFIGURED_BAR_STYLE);
});

test('returns default when user set a non-string value', () => {
  __setConfig('claudeUsageMonitor', 'unconfiguredBarStyle', 42);
  expect(getUnconfiguredBarStyle()).toBe(DEFAULT_UNCONFIGURED_BAR_STYLE);
});
