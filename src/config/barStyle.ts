import * as vscode from 'vscode';

export type UnconfiguredBarStyle = 'sparkline' | 'heatmap' | 'dual-band';

export const DEFAULT_UNCONFIGURED_BAR_STYLE: UnconfiguredBarStyle = 'heatmap';

const VALID: ReadonlySet<UnconfiguredBarStyle> = new Set([
  'sparkline',
  'heatmap',
  'dual-band',
]);

/**
 * How to render the Session (5h) / Weekly (7d) bars when no token limit is
 * configured (i.e. `limits.sessionTokens` / `limits.weeklyTokens` is null).
 * When a numeric limit IS configured the bar is always a standard progress
 * bar — this setting only governs the no-limit fallback.
 */
export function getUnconfiguredBarStyle(): UnconfiguredBarStyle {
  const cfg = vscode.workspace.getConfiguration('claudeUsageMonitor');
  const raw = cfg.get<unknown>('unconfiguredBarStyle');
  if (typeof raw === 'string' && VALID.has(raw as UnconfiguredBarStyle)) {
    return raw as UnconfiguredBarStyle;
  }
  return DEFAULT_UNCONFIGURED_BAR_STYLE;
}
