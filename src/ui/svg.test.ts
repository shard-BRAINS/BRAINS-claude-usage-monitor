import { test, expect } from 'vitest';
import { renderProgressBarSvg, renderSparklineSvg } from './svg';
import type { Sample } from './svg';

// BRAINS palette tokens used in the SVG renderers.
const COLOR_LOW = '#FCD17A';
const COLOR_WARN = '#FCC14D';
const COLOR_CRIT = '#E26B5A';
const COLOR_SPARK = '#FCC14D';

// ---------------------------------------------------------------------------
// renderProgressBarSvg
// ---------------------------------------------------------------------------

test('renderProgressBarSvg returns SVG with no fill rect at 0%', () => {
  const svg = renderProgressBarSvg(0, 100);
  expect(svg).toContain('width="200"');
  // No fill rect is emitted when used === 0.
  expect(svg).not.toContain(COLOR_LOW);
  expect(svg).not.toContain(COLOR_WARN);
  expect(svg).not.toContain(COLOR_CRIT);
});

test('renderProgressBarSvg returns proportional fill width for 50%', () => {
  const svg = renderProgressBarSvg(50, 100);
  expect(svg).toContain('width="100"');
  expect(svg).toContain(COLOR_LOW);
});

test('renderProgressBarSvg returns full width for 100%+ (clamped)', () => {
  const svg = renderProgressBarSvg(200, 100);
  expect(svg).toContain('width="200"');
  expect(svg).toContain(COLOR_CRIT);
});

test('renderProgressBarSvg colour bands: low → warn → critical', () => {
  const low = renderProgressBarSvg(30, 100);
  expect(low).toContain(COLOR_LOW);
  expect(low).not.toContain(COLOR_CRIT);

  const warn = renderProgressBarSvg(85, 100);
  expect(warn).toContain(COLOR_WARN);
  expect(warn).not.toContain(COLOR_CRIT);

  const crit = renderProgressBarSvg(120, 100);
  expect(crit).toContain(COLOR_CRIT);
});

test('renderProgressBarSvg with null limit renders a no-plan rail (no pattern, no url-ref)', () => {
  const svg = renderProgressBarSvg(100, null);
  // No <defs>/<pattern>/url(#…) — these break inside webviews with strict CSP.
  expect(svg).not.toContain('<pattern');
  expect(svg).not.toContain('<defs');
  expect(svg).not.toContain('url(#');
  // Dark track is present.
  expect(svg).toContain('#252a31');
  // Decorative gold accent stripe is present (BRAINS Gold at reduced opacity).
  expect(svg).toContain(COLOR_WARN);
  expect(svg).toContain('opacity="0.35"');
  // No fill-colour bands should be used in the unconfigured state.
  expect(svg).not.toContain(COLOR_CRIT);
});

test('renderProgressBarSvg renders min 3px sliver when fill would round below 3px', () => {
  // ratio = 0.005 → would produce fillWidth = round(0.005 * 200) = 1px without min
  const svg = renderProgressBarSvg(5, 1000);
  expect(svg).toContain('width="3"');
  expect(svg).toContain(COLOR_LOW);
});

test('renderProgressBarSvg does not apply min-sliver when used is exactly 0', () => {
  const svg = renderProgressBarSvg(0, 1000);
  expect(svg).not.toContain(COLOR_LOW);
  expect(svg).not.toContain(COLOR_WARN);
  expect(svg).not.toContain(COLOR_CRIT);
});

test('renderProgressBarSvg adds a subtle highlight on filled bars', () => {
  const svg = renderProgressBarSvg(50, 100);
  // The white-sheen highlight sits on top of the fill at low opacity.
  expect(svg).toContain('#FFFFFF');
  expect(svg).toContain('opacity="0.22"');
});

// ---------------------------------------------------------------------------
// renderSparklineSvg
// ---------------------------------------------------------------------------

test('renderSparklineSvg produces polyline with N points', () => {
  const samples: Sample[] = Array.from({ length: 60 }, (_, i) => ({
    tMs: i * 60_000,
    cumulative: i * 100,
  }));
  const svg = renderSparklineSvg(samples);
  const polylineMatch = svg.match(/<polyline[^>]*points="([^"]+)"/);
  expect(polylineMatch).not.toBeNull();
  const pairs = polylineMatch![1].trim().split(' ').filter((p) => p.length > 0);
  expect(pairs).toHaveLength(60);
});

test('renderSparklineSvg with empty samples renders flat baseline at bottom (no area fill)', () => {
  const svg = renderSparklineSvg([], 200, 24);
  expect(svg).toContain('<polyline');
  // Baseline anchored at height - 2 = 22, signalling no activity.
  expect(svg).toContain('0,22 200,22');
  // No area polygon when there's nothing to fill.
  expect(svg).not.toContain('<polygon');
});

test('renderSparklineSvg with all-zero samples renders flat baseline at bottom', () => {
  const samples: Sample[] = Array.from({ length: 10 }, (_, i) => ({
    tMs: i * 60_000,
    cumulative: 0,
  }));
  const svg = renderSparklineSvg(samples, 200, 24);
  const match = svg.match(/<polyline[^>]*points="([^"]+)"/);
  expect(match).not.toBeNull();
  const pairs = match![1].trim().split(' ').filter((p) => p.length > 0);
  for (const pair of pairs) {
    const [, y] = pair.split(',');
    expect(parseFloat(y)).toBe(22);
  }
  // No area fill when all samples are zero.
  expect(svg).not.toContain('<polygon');
});

test('renderSparklineSvg with constant non-zero samples renders flat line at top', () => {
  const samples: Sample[] = Array.from({ length: 10 }, (_, i) => ({
    tMs: i * 60_000,
    cumulative: 500,
  }));
  const svg = renderSparklineSvg(samples, 200, 24);
  const match = svg.match(/<polyline[^>]*points="([^"]+)"/);
  expect(match).not.toBeNull();
  const pairs = match![1].trim().split(' ').filter((p) => p.length > 0);
  for (const pair of pairs) {
    const [, y] = pair.split(',');
    expect(parseFloat(y)).toBe(2);
  }
});

test('renderSparklineSvg with monotonically rising samples climbs from baseline to top', () => {
  const samples: Sample[] = Array.from({ length: 5 }, (_, i) => ({
    tMs: i * 60_000,
    cumulative: i * 100,
  }));
  const svg = renderSparklineSvg(samples, 200, 24);
  const match = svg.match(/<polyline[^>]*points="([^"]+)"/);
  expect(match).not.toBeNull();
  const pairs = match![1].trim().split(' ').filter((p) => p.length > 0);
  const ys = pairs.map((p) => parseFloat(p.split(',')[1]));
  expect(ys[0]).toBe(22);
  expect(ys[ys.length - 1]).toBe(2);
  for (let i = 1; i < ys.length; i++) {
    expect(ys[i]).toBeLessThan(ys[i - 1]);
  }
});

test('renderSparklineSvg includes a faint baseline guide line', () => {
  const svg = renderSparklineSvg([], 200, 24);
  expect(svg).toContain('<line');
  expect(svg).toContain('y1="22"');
  expect(svg).toContain('y2="22"');
});

test('renderSparklineSvg adds a translucent BRAINS-gold area fill under non-zero activity', () => {
  const samples: Sample[] = Array.from({ length: 5 }, (_, i) => ({
    tMs: i * 60_000,
    cumulative: i * 100,
  }));
  const svg = renderSparklineSvg(samples, 200, 24);
  expect(svg).toContain('<polygon');
  expect(svg).toContain(COLOR_SPARK);
  expect(svg).toContain('opacity="0.14"');
});

test('renderSparklineSvg uses BRAINS Gold for the polyline stroke', () => {
  const samples: Sample[] = [{ tMs: 0, cumulative: 100 }, { tMs: 60_000, cumulative: 200 }];
  const svg = renderSparklineSvg(samples);
  expect(svg).toMatch(/<polyline[^>]*stroke="#FCC14D"/);
});
