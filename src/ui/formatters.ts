// Shared formatting helpers used by both the status-bar hover card (markdown)
// and the sidebar webview server-side renderer (HTML).
// The webview client-side script in src/ui/webview/main.js re-implements
// equivalents in vanilla JS because it cannot import from this module —
// keep the three implementations in sync.

export function commaFormat(n: number): string {
  return n.toLocaleString('en-US');
}

/** Relative time formatter: < 60s => "Ns ago"; < 60m => "Nm ago"; < 24h => "Nh ago"; else "Nd ago".
 *  Negative diffs (clock skew, or a timestamp in the future) are clamped to "0s ago". */
export function relativeTime(nowMs: number, thenMs: number): string {
  const diffMs = Math.max(0, nowMs - thenMs);
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

/**
 * Human-readable duration in ms → "42m", "3h 12m", "1d 4h".
 * Values under a minute round up to "1m" so we never show "0m".
 * Returns "—" for undefined/non-positive input.
 */
export function durationLabel(ms: number | undefined): string {
  if (ms === undefined || !isFinite(ms) || ms <= 0) return '—';
  const totalMin = Math.max(1, Math.round(ms / 60_000));
  if (totalMin < 60) return `${totalMin}m`;
  const totalHr = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (totalHr < 24) return mins === 0 ? `${totalHr}h` : `${totalHr}h ${mins}m`;
  const days = Math.floor(totalHr / 24);
  const hrs = totalHr % 24;
  return hrs === 0 ? `${days}d` : `${days}d ${hrs}h`;
}

/**
 * Short token count: "12.4k" / "1.2M" for large values, raw comma-formatted
 * below 10 000. Used where space is tight (e.g. burn-rate line).
 */
export function shortTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString('en-US');
}

/**
 * Row header for a Session/Weekly rolling-window bar. Shows the percentage
 * against the effective reference. When the reference is a soft default
 * ("typical peak") rather than a user-configured limit, appends " typical"
 * so the user reads the bar honestly.
 */
export function rollingRowLabel(
  used: number,
  reference: number,
  source: 'configured' | 'default',
): string {
  if (reference <= 0) return 'n/a';
  const pct = (used / reference) * 100;
  const pctStr = used > reference ? '>100%' : `${pct.toFixed(1)}%`;
  const refStr = shortTokens(reference);
  const suffix = source === 'default' ? 'typical' : '';
  return suffix.length > 0
    ? `${pctStr} of ${refStr} ${suffix}`
    : `${pctStr} of ${refStr}`;
}
