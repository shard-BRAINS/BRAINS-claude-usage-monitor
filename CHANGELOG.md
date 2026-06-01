# Changelog

All notable changes to **BRAINS Claude Usage Monitor** are recorded here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [Semantic Versioning](https://semver.org/).

## [0.2.3] — 2026-06-02

Hotfix for the Marketplace README rendering. No functional change.

### Fixed

- README hero used a `<picture>` element with a `<source>` for dark mode.
  GitHub renders this correctly, but the VS Code Marketplace overview
  renderer does not support `<picture>` or `<source>` and was echoing the
  raw tags as literal text above and below the brand mark. Replaced with
  a single `<img>` (light-background variant) — renders cleanly on the
  Marketplace, GitHub, and the in-editor extension panel.

## [0.2.2] — 2026-06-01

VS Code Marketplace and Open VSX listings are retired. The extension now ships
exclusively via GitHub Releases as a signed `.vsix`. No functional change.

### Changed

- README: removed Marketplace version / installs / rating badges (dead
  endpoints) and the "Install from Marketplace" block. The four remaining
  badges — MIT licence, Discord, Bluesky, BRAINS Incubator — represent the
  channels that are still live.
- README: removed dead Marketplace Changelog link; release notes are now
  authoritatively in `CHANGELOG.md` and on the GitHub Releases page.
- README: screenshot alt text no longer references the Marketplace listing.

## [0.2.1] — 2026-06-01

- Added a hero screenshot (`assets/screenshot.png`) to the README and the
  Marketplace listing for visual context on the status-bar fill bar.
- Packaging hygiene: `.vscodeignore` and `package.json` field touch-ups for
  the (then-live) Marketplace submission.

## [0.2.0] — 2026-06-01

First Marketplace release. Internals cleanup, security hardening, dependency
refresh — no breaking changes for users of `0.1.1`.

### Added

- Per-file aggregation cache keyed by `(filePath, mtimeMs, size)`. The
  30-second refresh tick no longer re-streams every transcript on disk;
  only files whose mtime/size changed are re-parsed.
- Hard cap on transcript line length (4 MB) and file size (256 MB) in the
  parser and aggregator. Pathological or corrupted JSONL can no longer
  OOM the extension host.
- `bugs`, `homepage`, and `galleryBanner` fields in `package.json` for the
  Marketplace listing.
- `npm run build:prod` script; `npm run package` now uses it so the
  locally-built VSIX matches what Marketplace receives (no sourcemap,
  minified bundle).

### Changed

- Tightened the sidebar webview Content Security Policy: removed `https:`
  and `data:` from `img-src` (SVGs are inlined, not loaded), kept
  `style-src 'unsafe-inline'` only at attribute scope.
- Unified the two aggregation paths (`aggregateSession` /
  `aggregateSessionTimeline`) behind a single internal helper. Behaviour
  is unchanged; the duplicated stream-and-dedup loop is gone.
- Removed the legacy "5-row" sidebar layout (input / output / cache-read /
  cache-create / total), its CSS, and the `'totals'` / `'hoverData'`
  webview message branches. The rolling-window panel renders server-side
  and the webview script is now a 12-line message swap.
- `relativeTime` clamps negative diffs to `0s ago` instead of returning
  the raw negative value (defensive against system clock skew).
- Rewrote `.vscodeignore` so `dist/*.map` and other dev-only artefacts
  can never leak into the VSIX, even if a developer runs `npm run package`
  immediately after a non-production build.

### Security

- Webview CSP: deny-by-default with no permissive image sources. The
  final policy is `default-src 'none'; style-src {webview} 'unsafe-inline';
  script-src {webview}`.
- Parser and aggregator now defend against denial-of-memory from unbounded
  JSONL input.
- `npm audit` is clean (was 7 dev-only findings carried from `0.1.0`).
  vitest jumped to `^3.2`; transitive `diff` and `serialize-javascript`
  inside `mocha` are pinned to safe ranges via `overrides`.

## [0.1.1] — 2026-05-31

- Sidebar / hover card: relabel "Reset in" → "Oldest rolls off in"
  (more accurate for rolling-window quotas).
- Sidebar / hover card: relabel "All sessions (last 5 by activity)" →
  "Recently active sessions (last 5)".
- Progress bar SVG: render a diagonal-hatch pattern when no plan limit
  is configured (visually distinct from an empty 0% bar).
- Progress bar SVG: guarantee a 3px minimum fill so small percentages
  remain visible.

## [0.1.0] — 2026-05-31

- Rebrand to **BRAINS Certified** publisher and final BRAINS visual identity.
- Status bar fill-bar indicator with theme-coloured warning/critical bands.
- Rich hover card with rolling 5-hour and 7-day windows, reset countdowns,
  last-hour sparkline, current-chat breakdown, and last-5-sessions list.
- Activity-bar sidebar webview mirroring the hover card.
- Configurable nudge notification (`off` / `once-per-session` /
  `on-warning` / `on-critical` / `on-each`) with snooze.

## [0.0.7] — 2026-05-28

- Initial public release.
