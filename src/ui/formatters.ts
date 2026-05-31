// Shared formatting helpers used by both the status-bar hover card (markdown)
// and the sidebar webview server-side renderer (HTML).
// The webview client-side script in src/ui/webview/main.js re-implements
// equivalents in vanilla JS because it cannot import from this module —
// keep the three implementations in sync.

export function commaFormat(n: number): string {
  return n.toLocaleString('en-US');
}

/** Relative time formatter: < 60s => "Ns ago"; < 60m => "Nm ago"; < 24h => "Nh ago"; else "Nd ago" */
export function relativeTime(nowMs: number, thenMs: number): string {
  const diffMs = nowMs - thenMs;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

/**
 * Countdown formatter for reset time.
 * Positive ms: > 1h => "Xh Ym"; else "Ym"
 * Zero or negative: "Reset due"
 */
export function countdownFormat(remainingMs: number): string {
  if (remainingMs <= 0) return 'Reset due';
  const totalMin = Math.floor(remainingMs / 60000);
  if (totalMin < 60) return `${totalMin}m`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return `${hours}h ${mins}m`;
}

export function percentageLabel(used: number, limit: number | null): string {
  if (limit === null) return 'n/a';
  if (used > limit) return '>100%';
  return `${((used / limit) * 100).toFixed(1)}%`;
}
