// ---------------------------------------------------------------------------
// SVG rendering helpers for progress bars and sparklines.
// Used by hoverCard.ts (via data URI) and sidebarView.ts (inline HTML).
//
// IMPORTANT — webview compatibility:
// These SVGs are inlined into the sidebar webview HTML. Webview CSP and
// base-URL handling can break `url(#id)` fragment references in inline SVG
// (and duplicate ids across multiple inlined SVGs collide). All effects are
// therefore composed from plain <rect>/<line>/<polyline>/<polygon> elements
// — no <defs>, <pattern>, or url(#…) references. The hover-card path encodes
// SVG as a data URI (separate document context) and would be safe either
// way, so the constraint is set by the sidebar.
// ---------------------------------------------------------------------------

export interface Sample {
  tMs: number;
  cumulative: number;
}

// BRAINS-aligned palette (Brand Guidelines v1.0 §5 — parent brand only;
// Trust Teal and Incubator Blue are sub-brand markers and must not appear
// on the parent BRAINS lockup or its extensions). The escalation stays
// inside the gold family — Gold Light → BRAINS Gold → Gold Deep — because
// the brand has no primary red/alarm token; a hotter, denser gold reads
// as "past the threshold" without violating palette compliance.
const COLOR_TRACK = '#1A1A1A';      // Grey 900 — dark track ground
const COLOR_LOW = '#FCD17A';        // Gold Light — soft fill, low usage
const COLOR_WARN = '#FCC14D';       // BRAINS Gold — caution, near reference
const COLOR_CRIT = '#D99518';       // Gold Deep — past reference (≥ 100%)
const COLOR_HIGHLIGHT = '#FFFFFF';  // Pure White — top sheen, low opacity
const COLOR_SHADOW = '#0A0A0A';     // Deep Black — bottom shadow, depth cue
const COLOR_SPARK = '#FCC14D';      // BRAINS Gold — sparkline stroke
const COLOR_BASELINE = '#3A3A3A';   // Grey 700 — baseline guide

export interface ProgressBarOptions {
  /**
   * Optional warning tick position along the track, expressed as a ratio in
   * (0, 1). Rendered as a thin vertical line so the user can see how close
   * they are to the yellow band without a legend.
   */
  warningRatio?: number;
  /**
   * When true, the track is drawn with a subtle dashed outline to signal
   * "this reference isn't a hard cap you configured". Used for the
   * default-reference variant of the bar.
   */
  softReference?: boolean;
  /**
   * Optional ghost segment at the leading edge showing how many tokens are
   * about to roll off (rolloffRatio in (0, 1] of the fill width). Rendered
   * as a slightly darker slice at the *front* of the fill — visually reads
   * as "this much of your usage will free up soon".
   */
  rolloffRatio?: number;
}

/**
 * Returns an SVG progress bar string.
 *
 * Color bands (BRAINS palette — parent brand, gold family only):
 *   ratio < 0.8  => Gold Light  #FCD17A
 *   ratio < 1.0  => BRAINS Gold #FCC14D
 *   ratio >= 1.0 => Gold Deep   #D99518 (past-reference escalation)
 *
 * When used > 0 but the fill would round below MIN_FILL_PX, a MIN_FILL_PX
 * sliver is rendered instead so small percentages remain visible.
 *
 * When limit is null or <= 0, renders a "no plan limit configured" rail:
 * a dark track with a thin Gold accent stripe through the middle. This is
 * visually distinct from any data-bearing state and reads as intentional
 * rather than broken (which the previous hatched-pattern fallback did not,
 * since inline-SVG <pattern>+url(#) refs are unreliable inside webviews).
 *
 * When `options.warningRatio` is set, a thin tick mark is drawn on the
 * track at that ratio so the yellow-threshold boundary is visible even
 * before the fill reaches it.
 *
 * When `options.softReference` is true the track carries a subtle dashed
 * outline — used to differentiate "typical peak" (default) from a limit
 * the user actually set.
 */
export function renderProgressBarSvg(
  used: number,
  limit: number | null,
  width = 200,
  height = 10,
  options: ProgressBarOptions = {},
): string {
  const MIN_FILL_PX = 3;
  const rx = Math.round(height / 2);
  const trackRect = `<rect width="${width}" height="${height}" rx="${rx}" fill="${COLOR_TRACK}"/>`;

  // --- Unconfigured (no limit) state: dark track + thin gold accent stripe ---
  if (limit === null || limit <= 0) {
    const stripeY = Math.max(1, Math.round(height / 2) - 1);
    const stripeH = Math.max(1, Math.round(height / 6));
    const stripeInset = Math.round(width * 0.03);
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
      trackRect +
      `<rect x="${stripeInset}" y="${stripeY}" width="${width - stripeInset * 2}" height="${stripeH}" rx="${Math.round(stripeH / 2)}" fill="${COLOR_WARN}" opacity="0.35"/>` +
      `</svg>`
    );
  }

  // --- Normal fill ---
  const ratio = used / limit;
  let fillWidth = Math.round(Math.min(1, ratio) * width);
  if (used > 0 && fillWidth < MIN_FILL_PX) fillWidth = MIN_FILL_PX;

  let fillColor = COLOR_LOW;
  if (ratio >= 1.0) fillColor = COLOR_CRIT;
  else if (ratio >= 0.8) fillColor = COLOR_WARN;

  let fillRect = '';
  let highlightRect = '';
  let shadowRect = '';
  let edgeCapRect = '';
  let rolloffRect = '';
  let overshootRefTick = '';
  let overshootOverlay = '';
  if (fillWidth > 0) {
    fillRect = `<rect width="${fillWidth}" height="${height}" rx="${rx}" fill="${fillColor}"/>`;
    // Depth cues — top sheen + bottom shadow give the bar dimensionality
    // without needing SVG gradients (which are unreliable inside webviews).
    if (fillWidth >= 4 && height >= 6) {
      const hlInset = 2;
      const hlH = Math.max(1, Math.round(height / 6));
      const hlW = Math.max(1, fillWidth - hlInset * 2);
      highlightRect =
        `<rect x="${hlInset}" y="1" width="${hlW}" height="${hlH}" ` +
        `rx="${Math.round(hlH / 2)}" fill="${COLOR_HIGHLIGHT}" opacity="0.22"/>`;
      const shH = Math.max(1, Math.round(height / 7));
      shadowRect =
        `<rect x="${hlInset}" y="${height - shH - 1}" width="${hlW}" height="${shH}" ` +
        `rx="${Math.round(shH / 2)}" fill="${COLOR_SHADOW}" opacity="0.18"/>`;
    }
    // Leading-edge cap — a slim bright vertical accent at the fill's right
    // edge so a fully-filled bar still reads as a shape with an end, not a
    // flat block. Skipped for very short fills where it would dominate.
    if (fillWidth >= 12 && height >= 6) {
      const capW = 2;
      edgeCapRect =
        `<rect x="${fillWidth - capW}" y="1" width="${capW}" height="${height - 2}" ` +
        `rx="1" fill="${COLOR_LOW}" opacity="0.7"/>`;
    }
    // Roll-off ghost — a darker slice at the leading edge of the fill.
    if (
      options.rolloffRatio !== undefined &&
      options.rolloffRatio > 0 &&
      options.rolloffRatio < 1
    ) {
      const ghostW = Math.max(2, Math.round(options.rolloffRatio * fillWidth));
      rolloffRect =
        `<rect x="0" y="0" width="${ghostW}" height="${height}" rx="${rx}" ` +
        `fill="${COLOR_SHADOW}" opacity="0.32"/>`;
    }
    // Overshoot indicator — at ratio >= 1.0, the fill is clamped to the
    // full width and the reference line would sit at the right edge, which
    // is uninformative. Instead, place a Deep Black tick where the
    // reference *would* sit on a log-scaled bar (1× at 1/(1+log10(ratio))
    // of the width), and darken everything to the right of it. Result: the
    // user sees "the light region is what would count as 100%; everything
    // past the tick is how far you've overshot." Bar never saturates
    // visually, even at 30–40× reference.
    if (ratio >= 1.0) {
      const scale = 1 + Math.log10(ratio);
      const refX = Math.round(fillWidth / scale);
      if (refX >= 4 && refX <= fillWidth - 4) {
        overshootOverlay =
          `<rect x="${refX}" y="0" width="${fillWidth - refX}" height="${height}" ` +
          `rx="0" fill="${COLOR_SHADOW}" opacity="0.22"/>`;
        overshootRefTick =
          `<line x1="${refX}" y1="1" x2="${refX}" y2="${height - 1}" ` +
          `stroke="${COLOR_SHADOW}" stroke-width="2" opacity="0.85"/>`;
      }
    }
  }

  // --- Warning tick ---
  // Suppressed at ratio >= 1.0: the coral fill already reads as "past the
  // warning threshold", so the tick just clutters the bar.
  let warningTick = '';
  const wr = options.warningRatio;
  if (wr !== undefined && wr > 0 && wr < 1 && ratio < 1.0) {
    const x = Math.round(wr * width);
    warningTick =
      `<line x1="${x}" y1="0" x2="${x}" y2="${height}" ` +
      `stroke="${COLOR_HIGHLIGHT}" stroke-width="1" opacity="0.55"/>`;
  }

  // --- Soft-reference dashed outline ---
  // Suppressed at ratio >= 1.0 for the same reason: with the bar fully
  // saturated in coral, the dashed rim reads as noise, not signal.
  let softOutline = '';
  if (options.softReference === true && ratio < 1.0) {
    softOutline =
      `<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" ` +
      `rx="${rx}" fill="none" stroke="${COLOR_HIGHLIGHT}" stroke-width="1" ` +
      `stroke-dasharray="2 3" opacity="0.35"/>`;
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    trackRect +
    fillRect +
    overshootOverlay +
    rolloffRect +
    shadowRect +
    highlightRect +
    edgeCapRect +
    overshootRefTick +
    warningTick +
    softOutline +
    `</svg>`
  );
}

/**
 * Returns an SVG sparkline string with a soft area fill under the polyline.
 *
 * X: index-based, evenly distributed across width.
 * Y: scaled to [2, height-2] inverted (SVG y-down). Anchored at 0 — the
 * minimum is always zero, not min(values), so empty buckets sit on a
 * visible baseline and any non-zero activity reads as a clear rise.
 *
 * A faint baseline grid line is drawn behind the polyline so the user
 * always sees the zero axis. A translucent gold area is drawn under the
 * line for additional visual weight on BRAINS brand.
 *
 * Edge cases:
 *  - Empty samples: flat baseline (no activity in window), no area fill.
 *  - Single sample: flat horizontal line at baseline (or top if > 0).
 *  - All-zero samples: flat baseline (no activity), no area fill.
 *  - Constant non-zero samples: flat line at the top of the chart.
 */
export function renderSparklineSvg(
  samples: Sample[],
  width = 200,
  height = 24,
): string {
  const baselineY = height - 2;
  const baselineRect = `<line x1="0" y1="${baselineY}" x2="${width}" y2="${baselineY}" stroke="${COLOR_BASELINE}" stroke-width="1"/>`;

  if (samples.length === 0) {
    const points = `0,${baselineY} ${width},${baselineY}`;
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
      baselineRect +
      `<polyline points="${points}" fill="none" stroke="${COLOR_SPARK}" stroke-width="1.5"/>` +
      `</svg>`
    );
  }

  const values = samples.map((s) => s.cumulative);
  const maxVal = Math.max(...values, 0);
  const n = samples.length;

  const coords = samples.map((s, i) => {
    const x = n === 1 ? 0 : Math.round((i / (n - 1)) * width);
    const y =
      maxVal === 0
        ? baselineY
        : 2 + (1 - s.cumulative / maxVal) * (height - 4);
    return `${x},${Math.round(y * 100) / 100}`;
  });

  const points =
    n === 1
      ? maxVal === 0
        ? `0,${baselineY} ${width},${baselineY}`
        : `0,2 ${width},2`
      : coords.join(' ');

  // Area fill: close the polyline down to the baseline at both ends.
  // Skipped when there's no activity to draw.
  let areaPolygon = '';
  if (maxVal > 0) {
    const firstX = n === 1 ? 0 : coords[0].split(',')[0];
    const lastX = n === 1 ? width : coords[coords.length - 1].split(',')[0];
    areaPolygon =
      `<polygon points="${firstX},${baselineY} ${points} ${lastX},${baselineY}" ` +
      `fill="${COLOR_SPARK}" opacity="0.14"/>`;
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    baselineRect +
    areaPolygon +
    `<polyline points="${points}" fill="none" stroke="${COLOR_SPARK}" stroke-width="1.5"/>` +
    `</svg>`
  );
}

// ---------------------------------------------------------------------------
// Heatmap (no-limit fallback)
// ---------------------------------------------------------------------------

// Token thresholds (in the peak bucket) used to escalate the heatmap and
// dual-band colour. Tuned around heavy-usage Claude conversations — a
// per-hour bucket sustaining >200k tokens is "warn"; >1M is "critical".
const PEAK_WARN_TOKENS = 200_000;
const PEAK_CRIT_TOKENS = 1_000_000;

function escalatedFillColor(peak: number): string {
  if (peak >= PEAK_CRIT_TOKENS) return COLOR_CRIT;
  if (peak >= PEAK_WARN_TOKENS) return COLOR_WARN;
  return COLOR_LOW;
}

/**
 * Returns an SVG heatmap row — one tile per bucket. Tile opacity scales
 * linearly with that bucket's value relative to the peak bucket in the
 * window (so the busiest tile sits at opacity 1.0 and zero-activity tiles
 * fade to ~0.06). Empty tiles are still emitted as faint outlines so the
 * grid structure is visible.
 *
 * Used when no token limit is configured — gives a "where in the window
 * did activity happen" read at a glance, without needing a denominator.
 */
export function renderHeatmapSvg(
  buckets: number[],
  width = 200,
  height = 14,
): string {
  const rx = Math.round(height / 2);
  const trackRect = `<rect width="${width}" height="${height}" rx="${rx}" fill="${COLOR_TRACK}"/>`;

  if (buckets.length === 0) {
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
      trackRect +
      `</svg>`
    );
  }

  const peak = Math.max(...buckets, 0);

  // No activity in the window: leave the bar as a clean dark track so the
  // user can tell at a glance there's nothing to plot. Tiles are only
  // emitted when at least one bucket has data.
  if (peak === 0) {
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
      trackRect +
      `</svg>`
    );
  }

  const fill = escalatedFillColor(peak);

  // Lay out tiles with a 1px gap, inset 1px from track edges so corners breathe.
  const inset = 1;
  const gap = 1;
  const n = buckets.length;
  const usable = width - inset * 2 - gap * (n - 1);
  const tileW = Math.max(1, Math.floor(usable / n));
  const tileH = height - inset * 2;
  const tileRx = Math.min(2, Math.round(tileH / 4));

  // Distribute leftover pixels across the leading tiles to avoid drift.
  const leftover = usable - tileW * n;

  let tiles = '';
  let x = inset;
  for (let i = 0; i < n; i++) {
    const w = tileW + (i < leftover ? 1 : 0);
    const value = buckets[i];
    const opacity = value === 0
      ? 0.08
      // Floor at 0.18 so any non-zero activity is faintly visible.
      : 0.18 + 0.82 * (value / peak);
    // Trim trailing zeros for opacity="1" rather than "1.00".
    const opacityStr = Number.isInteger(opacity)
      ? String(opacity)
      : opacity.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
    tiles +=
      `<rect class="tile" x="${x}" y="${inset}" width="${w}" height="${tileH}" ` +
      `rx="${tileRx}" fill="${fill}" opacity="${opacityStr}"/>`;
    x += w + gap;
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    trackRect +
    tiles +
    `</svg>`
  );
}

// ---------------------------------------------------------------------------
// Dual-band (no-limit fallback)
// ---------------------------------------------------------------------------

/**
 * Returns an SVG with two thin stacked horizontal bands:
 *
 *  - Top band (intensity): width = intensity * total width. Colour escalates
 *    gold-light → BRAINS gold → coral as intensity rises through 0.6 / 0.9.
 *    Intensity is a [0, 1] value the caller computes — typically the most
 *    recent bucket's value divided by the peak bucket in the window.
 *
 *  - Bottom band (saturation): width = saturation * total width, rendered
 *    in muted gold. Saturation is the [0, 1] fraction of the window that
 *    contains activity — approaches 1 as the rolling window fills up.
 *
 * Both inputs are clamped to [0, 1]. The two bands share the same dark
 * track so the visual is still bar-shaped and fits the existing footprint.
 */
export function renderDualBandSvg(
  intensity: number,
  saturation: number,
  width = 200,
  height = 14,
): string {
  const rx = Math.round(height / 2);
  const trackRect = `<rect width="${width}" height="${height}" rx="${rx}" fill="${COLOR_TRACK}"/>`;

  const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
  const iN = clamp01(intensity);
  const sN = clamp01(saturation);

  // Two thin bands stacked vertically inside the track.
  const bandH = Math.max(2, Math.round((height - 4) / 2));
  const bandRx = Math.round(bandH / 2);
  const topY = Math.max(1, Math.round(height / 2) - bandH - 1);
  const botY = topY + bandH + 2;

  let intensityFillColor = COLOR_LOW;
  if (iN >= 0.9) intensityFillColor = COLOR_CRIT;
  else if (iN >= 0.6) intensityFillColor = COLOR_WARN;

  const iWidth = Math.round(iN * width);
  const sWidth = Math.round(sN * width);

  const intensityBand =
    `<rect class="band-fill band-intensity" x="0" y="${topY}" ` +
    `width="${iWidth}" height="${bandH}" rx="${bandRx}" ` +
    `fill="${intensityFillColor}" opacity="0.92"/>`;

  // Saturation rendered in muted gold so it reads as secondary signal.
  const saturationBand =
    `<rect class="band-fill band-saturation" x="0" y="${botY}" ` +
    `width="${sWidth}" height="${bandH}" rx="${bandRx}" ` +
    `fill="${COLOR_WARN}" opacity="0.45"/>`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    trackRect +
    intensityBand +
    saturationBand +
    `</svg>`
  );
}
