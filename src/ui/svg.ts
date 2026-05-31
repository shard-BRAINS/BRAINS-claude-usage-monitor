// ---------------------------------------------------------------------------
// SVG rendering helpers for progress bars and sparklines.
// Used by hoverCard.ts (via data URI) and sidebarView.ts (inline HTML).
// ---------------------------------------------------------------------------

export interface Sample {
  tMs: number;
  cumulative: number;
}

/**
 * Returns an SVG progress bar string.
 *
 * Color bands match the status bar:
 *   ratio < 0.8  => blue   #4a90e2
 *   ratio < 1.0  => orange #e0a83a
 *   ratio >= 1.0 => red    #e25656
 *
 * When used > 0 but the fill would round below MIN_FILL_PX, a MIN_FILL_PX
 * sliver is rendered instead so small percentages remain visible.
 *
 * When limit is null or <= 0, renders a diagonal-hatch pattern signalling
 * "no limit configured" (visually distinct from a 0% bar).
 */
export function renderProgressBarSvg(
  used: number,
  limit: number | null,
  width = 200,
  height = 10,
): string {
  const MIN_FILL_PX = 3;
  const rx = Math.round(height / 2);

  // --- Unconfigured (no limit) state: diagonal hatch ---
  if (limit === null || limit <= 0) {
    const patternId = `phatch-${width}-${height}`;
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
      `<defs>` +
      `<pattern id="${patternId}" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">` +
      `<rect width="3" height="6" fill="#5a5a5a"/>` +
      `<rect x="3" width="3" height="6" fill="#3c3c3c"/>` +
      `</pattern>` +
      `</defs>` +
      `<rect width="${width}" height="${height}" rx="${rx}" fill="url(#${patternId})"/>` +
      `</svg>`
    );
  }

  // --- Normal fill ---
  const ratio = used / limit;
  let fillWidth = Math.round(Math.min(1, ratio) * width);
  if (used > 0 && fillWidth < MIN_FILL_PX) fillWidth = MIN_FILL_PX;

  let fillColor = '#4a90e2';
  if (ratio >= 1.0) fillColor = '#e25656';
  else if (ratio >= 0.8) fillColor = '#e0a83a';

  const fillRect =
    fillWidth > 0
      ? `<rect width="${fillWidth}" height="${height}" rx="${rx}" fill="${fillColor}"/>`
      : '';

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="${width}" height="${height}" rx="${rx}" fill="#3c3c3c"/>` +
    fillRect +
    `</svg>`
  );
}

/**
 * Returns an SVG sparkline polyline string.
 *
 * X: index-based, evenly distributed across width.
 * Y: scaled to [2, height-2] inverted (SVG y-down). Anchored at 0 — the
 * minimum is always zero, not min(values), so empty buckets sit on a
 * visible baseline and any non-zero activity reads as a clear rise.
 *
 * A faint baseline grid line is drawn behind the polyline so the user
 * always sees the zero axis.
 *
 * Edge cases:
 *  - Empty samples: flat baseline (no activity in window).
 *  - Single sample: flat horizontal line at baseline (or top if > 0).
 *  - All-zero samples: flat baseline (no activity).
 *  - Constant non-zero samples: flat line at the top of the chart.
 */
export function renderSparklineSvg(
  samples: Sample[],
  width = 200,
  height = 24,
): string {
  const baselineY = height - 2;
  const baselineRect = `<line x1="0" y1="${baselineY}" x2="${width}" y2="${baselineY}" stroke="#3c3c3c" stroke-width="1"/>`;

  if (samples.length === 0) {
    const points = `0,${baselineY} ${width},${baselineY}`;
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
      baselineRect +
      `<polyline points="${points}" fill="none" stroke="#4a90e2" stroke-width="1.5"/>` +
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

  // For a single sample, extend to a flat line across full width.
  const points =
    n === 1
      ? maxVal === 0
        ? `0,${baselineY} ${width},${baselineY}`
        : `0,2 ${width},2`
      : coords.join(' ');

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    baselineRect +
    `<polyline points="${points}" fill="none" stroke="#4a90e2" stroke-width="1.5"/>` +
    `</svg>`
  );
}
