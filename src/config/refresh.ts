import * as vscode from 'vscode';

export const DEFAULT_REFRESH_SECONDS = 30;
export const MIN_REFRESH_SECONDS = 5;

export function getRefreshIntervalSeconds(): number {
  const cfg = vscode.workspace.getConfiguration('claudeUsageMonitor');
  const raw = cfg.get<unknown>('refreshIntervalSeconds');

  if (Number.isInteger(raw) && (raw as number) >= MIN_REFRESH_SECONDS) {
    return raw as number;
  }

  return DEFAULT_REFRESH_SECONDS;
}
