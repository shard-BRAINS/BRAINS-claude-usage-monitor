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

// BRAINS-aligned palette.
// Parent brand only — Trust Teal and Incubator Blue are sub-brand markers
// and must not appear on the parent BRAINS lockup or its extensions.
const COLOR_TRACK = '#252a31';
const COLOR_LOW = '#FCD17A';        // Gold Light — soft fill, low usage
const COLOR_WARN = '#FCC14D';       // BRAINS Gold — caution, near limit
const COLOR_CRIT = '#E26B5A';       // Warm coral — alarm (≥ 100%)
const COLOR_HIGHLIGHT = '#FFFFFF';  // Top sheen on the fill, low opacity
const COLOR_SPARK = '#FCC14D';      // BRAINS Gold sparkline stroke
const COLOR_BASELINE = '#3c3c3c';   // Subtle baseline guide

/**
 * Returns an SVG progress bar string.
 *
 * Color bands (BRAINS palette):
 *   ratio < 0.8  => Gold Light  #FCD17A
 *   ratio < 1.0  => BRAINS Gold #FCC14D
 *   ratio >= 1.0 => Coral       #E26B5A
 *
 * When used > 0 but the fill would round below MIN_FILL_PX, a MIN_FILL_PX
 * sliver is rendered instead so small percentages remain visible.
 *
 * When limit is null or <= 0, renders a "no plan limit configured" rail:
 * a dark track with a thin Gold accent stripe through the middle. This is
 * visually distinct from any data-bearing state and reads as intentional
 * rather than broken (which the previous hatched-pattern fallback did not,
 * since inline-SVG <pattern>+url(#) refs are unreliable inside webviews).
 */
export function renderProgressBarSvg(
  used: number,
  limit: number | null,
  width = 200,
  height = 10,
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
  if (fillWidth > 0) {
    fillRect = `<rect width="${fillWidth}" height="${height}" rx="${rx}" fill="${fillColor}"/>`;
    // Subtle top sheen — gives the bar a little depth without needing gradients.
    if (fillWidth >= 4 && height >= 6) {
      const hlInset = 2;
      const hlY = 1;
      const hlH = Math.max(1, Math.round(height / 6));
      const hlW = Math.max(1, fillWidth - hlInset * 2);
      highlightRect = `<rect x="${hlInset}" y="${hlY}" width="${hlW}" height="${hlH}" rx="${Math.round(hlH / 2)}" fill="${COLOR_HIGHLIGHT}" opacity="0.22"/>`;
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    trackRect +
    fillRect +
    highlightRect +
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
