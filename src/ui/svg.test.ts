import { test, expect } from 'vitest';
import { renderProgressBarSvg, renderSparklineSvg } from './svg';
import type { Sample } from './svg';

// ---------------------------------------------------------------------------
// renderProgressBarSvg
// ---------------------------------------------------------------------------

test('renderProgressBarSvg returns SVG with proportional fill width for 0%', () => {
  const svg = renderProgressBarSvg(0, 100);
  expect(svg).toContain('width="200"');
  // Fill rect should be absent or have width="0"
  // No fill rect is emitted when fillWidth === 0
  expect(svg).not.toMatch(/fill="#4a90e2"/);
});

test('renderProgressBarSvg returns proportional fill width for 50%', () => {
  const svg = renderProgressBarSvg(50, 100);
  expect(svg).toContain('width="100"');
  expect(svg).toContain('#4a90e2');
});

test('renderProgressBarSvg returns full width for 100%+ (clamped)', () => {
  const svg = renderProgressBarSvg(200, 100);
  // Fill rect width clamped to 200 (the SVG width)
  expect(svg).toContain('width="200"');
  expect(svg).toContain('#e25656');
});

test('renderProgressBarSvg uses blue under warning, orange in warning, red at critical', () => {
  const blue = renderProgressBarSvg(30, 100);
  expect(blue).toContain('#4a90e2');

  const orange = renderProgressBarSvg(85, 100);
  expect(orange).toContain('#e0a83a');

  const red = renderProgressBarSvg(120, 100);
  expect(red).toContain('#e25656');
});

test('renderProgressBarSvg with null limit renders hatched "unconfigured" pattern', () => {
  const svg = renderProgressBarSvg(100, null);
  // Diagonal hatch pattern, no fill colors
  expect(svg).toContain('<pattern');
  expect(svg).toContain('patternTransform="rotate(45)"');
  expect(svg).toContain('url(#phatch-');
  expect(svg).not.toContain('#4a90e2');
  expect(svg).not.toContain('#e0a83a');
  expect(svg).not.toContain('#e25656');
});

test('renderProgressBarSvg renders min 3px sliver when fill would round below 3px', () => {
  // ratio = 0.005 → would produce fillWidth = round(0.005 * 200) = 1px without min
  const svg = renderProgressBarSvg(5, 1000);
  expect(svg).toContain('width="3"');
  expect(svg).toContain('#4a90e2');
});

test('renderProgressBarSvg does not apply min-sliver when used is exactly 0', () => {
  const svg = renderProgressBarSvg(0, 1000);
  // Fill rect should be absent entirely
  expect(svg).not.toContain('#4a90e2');
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
  const match = svg.match(/points="([^"]+)"/);
  expect(match).not.toBeNull();
  const pairs = match![1].trim().split(' ').filter((p) => p.length > 0);
  expect(pairs).toHaveLength(60);
});

test('renderSparklineSvg with empty samples renders flat baseline at bottom', () => {
  const svg = renderSparklineSvg([], 200, 24);
  expect(svg).toContain('<polyline');
  // Baseline anchored at height - 2 = 22, signalling no activity.
  expect(svg).toContain('0,22 200,22');
});

test('renderSparklineSvg with all-zero samples renders flat baseline at bottom', () => {
  const samples: Sample[] = Array.from({ length: 10 }, (_, i) => ({
    tMs: i * 60_000,
    cumulative: 0,
  }));
  const svg = renderSparklineSvg(samples, 200, 24);
  const match = svg.match(/<polyline points="([^"]+)"/);
  expect(match).not.toBeNull();
  const pairs = match![1].trim().split(' ').filter((p) => p.length > 0);
  // All y values pinned to baseline (height - 2 = 22).
  for (const pair of pairs) {
    const [, y] = pair.split(',');
    expect(parseFloat(y)).toBe(22);
  }
});

test('renderSparklineSvg with constant non-zero samples renders flat line at top', () => {
  const samples: Sample[] = Array.from({ length: 10 }, (_, i) => ({
    tMs: i * 60_000,
    cumulative: 500,
  }));
  const svg = renderSparklineSvg(samples, 200, 24);
  const match = svg.match(/<polyline points="([^"]+)"/);
  expect(match).not.toBeNull();
  const pairs = match![1].trim().split(' ').filter((p) => p.length > 0);
  // Constant max => line pegged to top (y=2).
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
  const match = svg.match(/<polyline points="([^"]+)"/);
  expect(match).not.toBeNull();
  const pairs = match![1].trim().split(' ').filter((p) => p.length > 0);
  const ys = pairs.map((p) => parseFloat(p.split(',')[1]));
  // First sample is cumulative=0 → pinned to baseline (22).
  expect(ys[0]).toBe(22);
  // Last sample is the max → pinned to top (2).
  expect(ys[ys.length - 1]).toBe(2);
  // Strictly descending y values (== ascending visual line).
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
