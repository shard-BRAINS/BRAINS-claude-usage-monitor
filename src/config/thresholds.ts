import * as vscode from 'vscode';

export interface Thresholds {
  warning: number;
  critical: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = { warning: 100000, critical: 160000 };

let _warnedMisconfigured = false;

export function getThresholds(): Thresholds {
  const cfg = vscode.workspace.getConfiguration('claudeUsageMonitor');

  const rawWarning = cfg.get<unknown>('warningTokens');
  const rawCritical = cfg.get<unknown>('criticalTokens');

  const warning =
    Number.isInteger(rawWarning) && (rawWarning as number) > 0
      ? (rawWarning as number)
      : DEFAULT_THRESHOLDS.warning;

  const critical =
    Number.isInteger(rawCritical) && (rawCritical as number) > 0
      ? (rawCritical as number)
      : DEFAULT_THRESHOLDS.critical;

  if (warning > critical) {
    if (!_warnedMisconfigured) {
      console.warn(
        '[claude-usage-monitor] warningTokens > criticalTokens; clamping warning to critical.',
      );
      _warnedMisconfigured = true;
    }
    return { warning: critical, critical };
  }

  _warnedMisconfigured = false;
  return { warning, critical };
}

// Test-only: reset module-level warn flag. Do not call from production code.
export function __resetWarnFlag(): void {
  _warnedMisconfigured = false;
}

export function onDidChangeThresholds(
  listener: (t: Thresholds) => void,
): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((e) => {
    if (
      e.affectsConfiguration('claudeUsageMonitor.warningTokens') ||
      e.affectsConfiguration('claudeUsageMonitor.criticalTokens')
    ) {
      listener(getThresholds());
    }
  });
}
