import * as vscode from 'vscode';
import type { TranscriptWatcher } from '../transcripts/watcher';
import type { SessionTotals } from '../transcripts/types';
import type { HoverCardData } from './hoverCard';
import { renderHoverMarkdown } from './hoverCard';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface ThresholdsGetter {
  (): { warning: number; critical: number };
}

export interface HoverDataGetter {
  (): HoverCardData;
}

// ---------------------------------------------------------------------------
// Private helpers (exported via _test for unit testing)
// ---------------------------------------------------------------------------

/** Format a token count: raw number below 10 000, "<n>k" (1 decimal) at 10 000+. */
function format(n: number): string {
  if (n >= 1000000) {
    return (n / 1000000).toFixed(1) + 'M';
  }
  if (n >= 10000) {
    return (n / 1000).toFixed(1) + 'k';
  }
  return String(n);
}

/**
 * Build a 10-segment fill indicator using Unicode block characters.
 * Full block U+2588 for filled segments, light shade U+2591 for empty.
 * Ratio = used / limit, clamped to [0, 1].
 */
function buildFillIndicator(used: number, limit: number, segments = 10): string {
  const ratio = Math.min(used / limit, 1);
  const filled = Math.round(ratio * segments);
  return '█'.repeat(filled) + '░'.repeat(segments - filled);
}

/** Apply text, color state, and tooltip to the status bar item. */
function update(
  item: vscode.StatusBarItem,
  totals: SessionTotals,
  thresholds: { warning: number; critical: number },
  hoverData?: HoverCardData,
): void {
  // Determine numerator and denominator for the fill ratio
  let used: number;
  let limit: number;

  if (hoverData !== undefined && hoverData.session.limit !== null) {
    used = hoverData.session.used;
    limit = hoverData.session.limit;
  } else {
    used = hoverData?.thisWindow?.total ?? totals.total;
    limit = thresholds.critical;
  }

  const ratio = limit > 0 ? used / limit : 0;
  // Fallback 0.625 mirrors the default 100_000/160_000 warning:critical ratio.
  const warningRatio = thresholds.critical > 0 ? thresholds.warning / thresholds.critical : 0.625;

  const fillBar = buildFillIndicator(used, limit > 0 ? limit : 1);
  item.text = `${fillBar} Claude ${format(totals.total)}`;

  if (ratio >= 1.0) {
    item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
  } else if (ratio >= warningRatio) {
    item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  } else {
    item.backgroundColor = undefined;
  }

  if (hoverData !== undefined) {
    item.tooltip = renderHoverMarkdown(hoverData);
  }
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

export function createStatusBar(
  context: vscode.ExtensionContext,
  watcher: TranscriptWatcher,
  getThresholds: ThresholdsGetter,
  getHoverData?: HoverDataGetter,
): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  item.text = '░░░░░░░░░░ Claude —';

  watcher.on('change', (totals: SessionTotals) => {
    const hoverData = getHoverData !== undefined ? getHoverData() : undefined;
    update(item, totals, getThresholds(), hoverData);
  });

  item.show();
  context.subscriptions.push(item);

  return item;
}

// ---------------------------------------------------------------------------
// Test surface — only used by statusBar.test.ts
// ---------------------------------------------------------------------------

export const _test = { format, buildFillIndicator, update };
