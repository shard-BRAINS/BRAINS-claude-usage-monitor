import * as vscode from 'vscode';

export type UnconfiguredBarStyle =
  | 'progress'
  | 'sparkline'
  | 'heatmap'
  | 'dual-band';

export const DEFAULT_UNCONFIGURED_BAR_STYLE: UnconfiguredBarStyle = 'progress';

const VALID: ReadonlySet<UnconfiguredBarStyle> = new Set([
  'progress',
  'sparkline',
  'heatmap',
  'dual-band',
]);

/**
 * How to render the Session (5h) / Weekly (7d) bars when no token limit is
 * configured (i.e. `limits.sessionTokens` / `limits.weeklyTokens` is null).
 *
 *  - progress  (default): treat a soft "typical peak" as the denominator and
 *                         draw a normal progress bar with a dashed outline.
 *  - sparkline / heatmap / dual-band: legacy no-denominator visualisations
 *                                     retained for users who prefer them.
 */
export function getUnconfiguredBarStyle(): UnconfiguredBarStyle {
  const cfg = vscode.workspace.getConfiguration('claudeUsageMonitor');
  const raw = cfg.get<unknown>('unconfiguredBarStyle');
  if (typeof raw === 'string' && VALID.has(raw as UnconfiguredBarStyle)) {
    return raw as UnconfiguredBarStyle;
  }
  return DEFAULT_UNCONFIGURED_BAR_STYLE;
}
