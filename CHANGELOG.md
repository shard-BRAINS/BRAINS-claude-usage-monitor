# Changelog

All notable changes to **BRAINS Claude Usage Monitor** are recorded here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [Semantic Versioning](https://semver.org/).

## [0.3.0] — 2026-07-13

Burn rate, model mix, log-scale overshoot indicator, brand-palette overhaul.

### Added

- **Burn-rate row** on the Session and Weekly windows in both the hover card
  and the sidebar — shows current tokens/min and, when known, a projected
  ETA until usage hits the reference (e.g. `Burn: 28.3k tok/min · hits
  220.0k in 10m`).
- **Model-mix row** on the Session window — aggregated share of tokens by
  model family in the current 5-hour window (e.g. `Models: Opus 100% ·
  Other 0%`). Uses friendly family names, not raw Anthropic model ids.
- **Log-scale overshoot indicator** on the progress bar — when usage is past
  100% of the reference, the bar no longer clamps to a saturated block;
  instead a Deep Black reference tick is drawn inside the fill at
  `1 / (1 + log10(ratio))` of the width, and the region past it is subtly
  darkened. Result: at 30–40× reference the bar still communicates how far
  past you are.
- **Depth cues on the progress bar** — bottom shadow strip and a bright
  Gold Light leading-edge cap so the fill reads as a shape with an end,
  not a flat rectangle. Existing top sheen retained.

### Changed

- **Brand-consistent palette.** The critical-fill colour moved from an
  off-brand coral (`#E26B5A`) to Gold Deep (`#D99518`), keeping the whole
  escalation inside the BRAINS gold family (Gold Light → BRAINS Gold →
  Gold Deep). The bar track and sparkline baseline moved to official
  scale tokens Grey 900 (`#1A1A1A`) and Grey 700 (`#3A3A3A`) — see
  BRAINS Brand Guidelines v1.0 §5.
- **Cleaner rendering at scale.** Sidebar bars are rendered at 640×18
  native so the sidebar CSS scales the SVG close to 1:1 in typical widths
  — 1-pixel dashes and ticks no longer blow up to chunky 3-pixel strokes.
- **Warning tick and soft-reference outline are suppressed at ratio ≥ 1.0.**
  At that state the escalated fill IS the "past threshold" signal and the
  overlays just added noise.
- **Roll-off ghost** now uses Deep Black at 32% opacity (was pure black at
  28%) for better contrast against the darker Gold Deep base.

### Fixed

- README settings-table alignment row now uses space-padded pipes
  (`| --- | --- | --- |`) so markdownlint MD060 (`table-column-style:
  compact`) no longer fails on `main` — unblocks all Dependabot PR CI runs.
- Test mocks (`src/ui/__mocks__/vscode.ts`) now include the newer
  `@types/vscode` shape: `Memento.keys()` and full `Uri` field surface
  (`scheme` / `authority` / `path` / `query` / `fragment` / `with()` /
  `toJSON()`). `npx tsc --noEmit` is clean again.

## [0.2.7] — 2026-06-08

Certification mark.

### Added

- The **BRAINS Certified · Gold** badge and the Gold Standard mark in the README, with a section explaining the standard floor the repo meets.

## [0.2.6] — 2026-06-08

Documentation refresh.

### Changed

- Updated the README screenshot to a current capture showing the activity-bar
  sidebar, the rich hover card, and the live status-bar fill bar together.
- README install snippets and the test-count note now match the shipped
  version and the 135-test suite.

## [0.2.5] — 2026-06-03

Sidebar visual refresh and progress-bar fix.

### Fixed

- Sidebar progress bars rendered as empty/dark rectangles when no plan limit
  was configured. Root cause: the diagonal-hatch fallback used
  `<defs><pattern>` with `url(#…)` fragment references inlined into the
  webview, where strict CSP and base-URL handling can break fragment
  resolution; both bars also shared the same pattern id, compounding the
  failure. The renderer no longer uses `<defs>`/`<pattern>`/`url(#…)` for
  any state — all visuals are composed from plain `<rect>` / `<polyline>` /
  `<polygon>` elements that render reliably in webview contexts.

### Changed

- Progress bar palette aligned to BRAINS Brand Guidelines v1.0 (parent
  brand). Fill bands are Gold Light `#FCD17A` (< 80%), BRAINS Gold
  `#FCC14D` (80–99%), Coral `#E26B5A` (≥ 100%). A subtle white sheen sits
  on top of the fill for depth.
- "No plan limit configured" state now renders a dark capsule with a thin
  BRAINS Gold accent stripe through the middle, reading as intentional
  rather than broken.
- Sparkline switched from blue to BRAINS Gold with a translucent gold area
  fill under the polyline for additional visual weight.
- Sidebar panel title gained a BRAINS Gold left-border accent with a
  fading gold tint, and muted rows no longer use italic (brand standard:
  italics impair readability for many neurodivergent readers).

## [0.2.4] — 2026-06-02

Supply-chain hardening release. No functional change to the extension itself
— same parser, same UI, same behaviour as 0.2.3. The whole delta is in how
the artifact is built, scanned, and shipped.

### Security

- CI workflows now pin every third-party GitHub Action to a full commit SHA
  (with a trailing version comment so Dependabot can still bump them),
  closing the OpenSSF Scorecard Pinned-Dependencies gap.
- Every workflow ships with a top-level `permissions: read-all` and
  least-privilege per-job permissions; `ci.yml` previously inherited
  `write-all`, which closed the Token-Permissions gap.
- Every workflow starts with `step-security/harden-runner` (audit mode) so
  runner egress is baselined.
- `aquasecurity/trivy-action` bumped 0.20.0 → 0.36.0.
- Added a tag-triggered release workflow that builds the `.vsix`, generates
  an SLSA build provenance attestation (Sigstore-signed via GitHub OIDC, no
  long-lived secrets), produces a `SHA256SUMS.txt`, and creates the GitHub
  Release. Consumers can verify with
  `gh attestation verify <vsix> --repo shard-BRAINS/BRAINS-claude-usage-monitor`.
- Added `.github/CODEOWNERS` so pull requests trigger code-owner review.
- Added opt-in accessibility workflow (axe-core + Pa11y) for the webview
  surface; enable with the repo variable `HAS_WEB_UI=true`.

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
