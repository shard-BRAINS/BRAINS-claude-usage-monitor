import type { SessionTimeline } from '../transcripts/types';

export interface BurnRate {
  /** Average billable tokens per minute across the lookback window. */
  tokensPerMin: number;
  /** Milliseconds actually covered by activity in the lookback (≤ lookbackMs). */
  activeMs: number;
}

/**
 * Compute burn rate over the last `lookbackMs` of activity across every
 * timeline. Sum of entry.total in the window divided by minutes elapsed.
 *
 * Returned rate is 0 when there is no activity in the lookback window.
 */
export function computeBurnRate(
  timelines: SessionTimeline[],
  nowMs: number,
  lookbackMs = 10 * 60 * 1000,
): BurnRate {
  const windowStart = nowMs - lookbackMs;
  let tokens = 0;
  let oldest: number | undefined;
  let newest: number | undefined;

  for (const t of timelines) {
    for (const e of t.entries) {
      if (e.timestampMs < windowStart || e.timestampMs > nowMs) continue;
      tokens += e.total;
      if (oldest === undefined || e.timestampMs < oldest) oldest = e.timestampMs;
      if (newest === undefined || e.timestampMs > newest) newest = e.timestampMs;
    }
  }

  if (tokens === 0 || oldest === undefined || newest === undefined) {
    return { tokensPerMin: 0, activeMs: 0 };
  }

  // Use the full lookback as the denominator once activity is settled, so
  // the rate reflects sustained burn rather than a brief spike. If activity
  // only covers a small slice (e.g. first tick after a fresh conversation),
  // divide by that slice so the rate isn't artificially low.
  const activeMs = newest - oldest;
  const denomMs = Math.max(activeMs, lookbackMs);
  const tokensPerMin = tokens / (denomMs / 60_000);
  return { tokensPerMin, activeMs };
}

/**
 * Milliseconds until `used` reaches `reference` at the current burn rate.
 *
 * Returns:
 *  - undefined  → no burn (rate=0), or already past reference
 *  - number ms  → time until reference is hit
 */
export function projectExhaustMs(
  used: number,
  reference: number,
  tokensPerMin: number,
): number | undefined {
  if (tokensPerMin <= 0) return undefined;
  if (reference <= 0) return undefined;
  const remaining = reference - used;
  if (remaining <= 0) return undefined;
  return (remaining / tokensPerMin) * 60_000;
}
