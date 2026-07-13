import type { SessionTimeline } from '../transcripts/types';

export interface ModelMixItem {
  /** Raw model id (or "unknown"). */
  model: string;
  /** Human-friendly family label (e.g. "Opus", "Sonnet", "Haiku"). */
  family: string;
  tokens: number;
  pct: number;
}

/**
 * Map a raw Anthropic model id to a short friendly family label.
 * Examples:
 *   claude-opus-4-7        → Opus
 *   claude-sonnet-4-6      → Sonnet
 *   claude-haiku-4-5       → Haiku
 *   claude-3-5-sonnet-*    → Sonnet
 *   <unknown>              → Other
 */
export function friendlyFamily(model: string | undefined): string {
  if (model === undefined || model.length === 0) return 'Other';
  const m = model.toLowerCase();
  if (m.includes('opus')) return 'Opus';
  if (m.includes('sonnet')) return 'Sonnet';
  if (m.includes('haiku')) return 'Haiku';
  return 'Other';
}

/**
 * Aggregate tokens by model family across entries in the given rolling window.
 * Result is sorted by tokens desc; percentages sum to 100 (± rounding).
 * Empty result when no in-window entries carry a model tag.
 */
export function computeModelMix(
  timelines: SessionTimeline[],
  windowMs: number,
  nowMs: number,
): ModelMixItem[] {
  const windowStart = nowMs - windowMs;
  const byFamily = new Map<string, { model: string; tokens: number }>();

  let total = 0;
  for (const t of timelines) {
    for (const e of t.entries) {
      if (e.timestampMs < windowStart || e.timestampMs > nowMs) continue;
      if (e.model === undefined || e.model.length === 0) continue;
      const family = friendlyFamily(e.model);
      const existing = byFamily.get(family);
      if (existing === undefined) {
        byFamily.set(family, { model: e.model, tokens: e.total });
      } else {
        existing.tokens += e.total;
      }
      total += e.total;
    }
  }

  if (total === 0) return [];

  const items: ModelMixItem[] = [];
  for (const [family, agg] of byFamily) {
    items.push({
      model: agg.model,
      family,
      tokens: agg.tokens,
      pct: (agg.tokens / total) * 100,
    });
  }
  items.sort((a, b) => b.tokens - a.tokens);
  return items;
}

/**
 * Compact single-line label: "Opus 62% · Sonnet 31% · Haiku 7%".
 * Returns "" when the mix is empty.
 */
export function formatModelMix(items: ModelMixItem[]): string {
  if (items.length === 0) return '';
  return items
    .map((i) => `${i.family} ${Math.round(i.pct)}%`)
    .join(' · ');
}
