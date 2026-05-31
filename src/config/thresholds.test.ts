import { test, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => import('../ui/__mocks__/vscode'));

import {
  getThresholds,
  onDidChangeThresholds,
  DEFAULT_THRESHOLDS,
  __resetWarnFlag,
} from './thresholds';
import {
  __setConfig,
  __clearConfig,
  __clearListeners,
  workspace,
} from '../ui/__mocks__/vscode';

beforeEach(() => {
  __clearConfig();
  __clearListeners();
  __resetWarnFlag();
});

// ---------------------------------------------------------------------------
// Test 1: returns DEFAULT_THRESHOLDS when configuration is empty
// ---------------------------------------------------------------------------

test('returns DEFAULT_THRESHOLDS when configuration is empty', () => {
  const result = getThresholds();
  expect(result).toEqual(DEFAULT_THRESHOLDS);
});

// ---------------------------------------------------------------------------
// Test 2: returns user values when both are set and valid
// ---------------------------------------------------------------------------

test('returns user values when both warningTokens and criticalTokens are valid', () => {
  __setConfig('claudeUsageMonitor', 'warningTokens', 200000);
  __setConfig('claudeUsageMonitor', 'criticalTokens', 300000);

  const result = getThresholds();
  expect(result).toEqual({ warning: 200000, critical: 300000 });
});

// ---------------------------------------------------------------------------
// Test 3: falls back to default for an invalid value
// ---------------------------------------------------------------------------

test('falls back to DEFAULT.warning when warningTokens is -1', () => {
  __setConfig('claudeUsageMonitor', 'warningTokens', -1);
  __setConfig('claudeUsageMonitor', 'criticalTokens', 300000);

  const result = getThresholds();
  expect(result.warning).toBe(DEFAULT_THRESHOLDS.warning);
  expect(result.critical).toBe(300000);
});

// ---------------------------------------------------------------------------
// Test 4: clamps warning when warning > critical and emits exactly one console.warn
// ---------------------------------------------------------------------------

test('clamps warning to critical when warning > critical and emits exactly one console.warn', () => {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

  __setConfig('claudeUsageMonitor', 'warningTokens', 500000);
  __setConfig('claudeUsageMonitor', 'criticalTokens', 100000);

  const result1 = getThresholds();
  expect(result1).toEqual({ warning: 100000, critical: 100000 });
  expect(warnSpy).toHaveBeenCalledTimes(1);

  // Second call with same misconfiguration — warn should NOT fire again
  const result2 = getThresholds();
  expect(result2).toEqual({ warning: 100000, critical: 100000 });
  expect(warnSpy).toHaveBeenCalledTimes(1);

  warnSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// Test 5: onDidChangeThresholds listener fires for relevant keys, not others
// ---------------------------------------------------------------------------

test('onDidChangeThresholds fires listener for warningTokens change', () => {
  const listener = vi.fn();
  const disposable = onDidChangeThresholds(listener);

  workspace.__fireConfigChange('claudeUsageMonitor.warningTokens');
  expect(listener).toHaveBeenCalledTimes(1);

  disposable.dispose();
});

test('onDidChangeThresholds fires listener for criticalTokens change', () => {
  const listener = vi.fn();
  const disposable = onDidChangeThresholds(listener);

  workspace.__fireConfigChange('claudeUsageMonitor.criticalTokens');
  expect(listener).toHaveBeenCalledTimes(1);

  disposable.dispose();
});

test('onDidChangeThresholds does NOT fire listener for unrelated key change', () => {
  const listener = vi.fn();
  const disposable = onDidChangeThresholds(listener);

  workspace.__fireConfigChange('someOther.setting');
  expect(listener).not.toHaveBeenCalled();

  disposable.dispose();
});
