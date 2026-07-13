import type { RollingSnapshot } from './hoverCard';
import type { UnconfiguredBarStyle } from '../config/barStyle';
import { DEFAULT_UNCONFIGURED_BAR_STYLE } from '../config/barStyle';
import {
  renderProgressBarSvg,
  renderHeatmapSvg,
  renderSparklineSvg,
  renderDualBandSvg,
} from './svg';

// Warning-tick position on the bar. Matches the yellow-band threshold used
// in renderProgressBarSvg (ratio >= 0.8 turns the fill BRAINS Gold).
const WARNING_TICK_RATIO = 0.8;

function rolloffRatioOf(snapshot: RollingSnapshot): number | undefined {
  if (
    snapshot.rolloffTokens === undefined ||
    snapshot.rolloffTokens <= 0 ||
    snapshot.used <= 0
  ) {
    return undefined;
  }
  const r = snapshot.rolloffTokens / snapshot.used;
  return Math.min(0.99, Math.max(0, r));
}

/**
 * Render the appropriate SVG for the Session/Weekly bar:
 *
 *  - If a positive numeric token limit is configured for the snapshot,
 *    always render a standard progress bar (used / limit) with a
 *    warning tick and optional roll-off ghost.
 *  - Otherwise, pick the no-limit visualisation from the user's
 *    `unconfiguredBarStyle` setting. The default 'progress' style draws
 *    a normal bar against the soft "typical peak" reference, dashed
 *    outline to signal the denominator is not a hard cap. Legacy
 *    sparkline / heatmap / dual-band styles remain for users who
 *    prefer them.
 */
export function renderUnconfiguredBar(
  snapshot: RollingSnapshot,
  style: UnconfiguredBarStyle | undefined,
  width = 220,
  height = 14,
): string {
  const rolloffRatio = rolloffRatioOf(snapshot);

  // Case 1: user-configured limit → normal progress bar with warning tick.
  if (snapshot.limit !== null && snapshot.limit > 0) {
    return renderProgressBarSvg(snapshot.used, snapshot.limit, width, height, {
      warningRatio: WARNING_TICK_RATIO,
      rolloffRatio,
    });
  }

  const effective = style ?? DEFAULT_UNCONFIGURED_BAR_STYLE;

  // Case 2: 'progress' style with no configured limit → use the soft
  // reference as the denominator so the bar is still meaningful.
  if (effective === 'progress') {
    return renderProgressBarSvg(snapshot.used, snapshot.reference, width, height, {
      warningRatio: WARNING_TICK_RATIO,
      softReference: true,
      rolloffRatio,
    });
  }

  // Case 3: legacy no-denominator styles — need per-window detail.
  if (snapshot.detail === undefined) {
    return renderProgressBarSvg(snapshot.used, null, width, height);
  }

  switch (effective) {
    case 'sparkline':
      return renderSparklineSvg(snapshot.detail.samples, width, height);
    case 'dual-band':
      return renderDualBandSvg(
        snapshot.detail.intensity,
        snapshot.detail.saturation,
        width,
        height,
      );
    case 'heatmap':
    default:
      return renderHeatmapSvg(snapshot.detail.buckets, width, height);
  }
}
