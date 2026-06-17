import type { RollingSnapshot } from './hoverCard';
import type { UnconfiguredBarStyle } from '../config/barStyle';
import { DEFAULT_UNCONFIGURED_BAR_STYLE } from '../config/barStyle';
import {
  renderProgressBarSvg,
  renderHeatmapSvg,
  renderSparklineSvg,
  renderDualBandSvg,
} from './svg';

/**
 * Render the appropriate SVG for the Session/Weekly bar:
 *
 *  - If a positive numeric token limit is configured for the snapshot,
 *    always render a standard progress bar (used / limit).
 *  - Otherwise, pick the no-limit visualisation from the user's
 *    `unconfiguredBarStyle` setting. When the per-window detail is
 *    missing (e.g. test fixtures, first paint), fall back to the
 *    static "no-plan rail" that renderProgressBarSvg emits for null
 *    limits — the existing behaviour.
 */
export function renderUnconfiguredBar(
  snapshot: RollingSnapshot,
  style: UnconfiguredBarStyle | undefined,
  width = 220,
  height = 14,
): string {
  if (snapshot.limit !== null && snapshot.limit > 0) {
    return renderProgressBarSvg(snapshot.used, snapshot.limit, width, height);
  }

  if (snapshot.detail === undefined) {
    return renderProgressBarSvg(snapshot.used, null, width, height);
  }

  const effective = style ?? DEFAULT_UNCONFIGURED_BAR_STYLE;
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
