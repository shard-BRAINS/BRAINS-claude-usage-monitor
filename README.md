# BRAINS Claude Usage Monitor

A VSCode extension that shows how many tokens your Claude Code chat has used, so you know when to start a fresh session before you hit a context or plan limit. Published by **BRAINS Certified**.

[![CI](https://github.com/shard-BRAINS/BRAINS-claude-usage-monitor/actions/workflows/ci.yml/badge.svg)](https://github.com/shard-BRAINS/BRAINS-claude-usage-monitor/actions/workflows/ci.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/shard-BRAINS/BRAINS-claude-usage-monitor/badge)](https://scorecard.dev/viewer/?uri=github.com/shard-BRAINS/BRAINS-claude-usage-monitor)
[![License: MIT](https://img.shields.io/badge/License-MIT-D99518.svg)](LICENSE)

---

## TL;DR

- Reads Claude Code's local transcript files (`~/.claude/projects/**/*.jsonl`) — no network calls, no telemetry, no data leaves your machine.
- Shows a **status bar fill bar** for the rolling 5-hour session window, a **rich hover card**, and an **activity-bar sidebar** with last-hour usage, weekly totals, and per-session breakdowns.
- Counts tokens the way Anthropic bills them (input + output + cache-create × 1.25 + cache-read × 0.10) and dedupes Claude Code's streamed-then-finalised duplicate writes, so the totals line up with the Claude.ai usage meter.
- Optional **nudge** notification when you cross a configurable threshold, with snooze and "start fresh chat" actions.

---

## What it does

- **Status bar fill bar** — a block-character indicator (`██████░░░░ Claude 720k`) that tracks your rolling 5-hour session usage against a configurable plan limit. Colour shifts from blue to amber to red as you approach the cap.
- **Hover card** — appears when you mouse over the status bar. Shows the rolling 5-hour and 7-day windows with their own progress bars and reset countdowns, a last-hour cumulative sparkline, a breakdown of the current chat (cumulative tokens, last-turn input/output, cache hit rate), and your five most recently active sessions across all workspaces.
- **Sidebar view** — the same panel rendered as a VSCode activity-bar webview, so you can keep usage visible permanently instead of having to hover.
- **Configurable nudge** — a non-modal notification when the critical threshold is crossed, with **Start fresh chat** and **Snooze this session** actions. Five modes: `off`, `once-per-session`, `on-warning`, `on-critical`, `on-each`.

## Install

**From the VSCode Marketplace** (once live):

```bash
code --install-extension BRAINS-Certified.BRAINS-claude-usage-monitor
```

Or search **"BRAINS Claude Usage Monitor"** in the VSCode Extensions sidebar.

**From the GitHub release** (always available): download the latest `.vsix` from [Releases](https://github.com/shard-BRAINS/BRAINS-claude-usage-monitor/releases) and run:

```bash
code --install-extension BRAINS-claude-usage-monitor-0.1.0.vsix
```

Reload the VSCode window to activate. The extension lights up on startup and watches `~/.claude/projects/` automatically.

**From source:**

```bash
npm install
npm run package
code --install-extension BRAINS-claude-usage-monitor-0.1.0.vsix --force
```

## Settings

All settings live under `claudeUsageMonitor.*` and can be edited in VSCode Settings or `settings.json`.

| Setting | Default | What it does |
|---|---|---|
| `limits.sessionTokens` | `null` | Plan cap for the rolling session window. When set, the status bar fill bar and "Session" hover row show a percentage. Set this to your Claude.ai plan's 5-hour quota (e.g. `15000000` for Max). |
| `limits.weeklyTokens` | `null` | Plan cap for the rolling weekly window. Same idea — set to your plan's weekly Opus quota. |
| `limits.sessionWindowHours` | `5` | Length of the rolling session window in hours. Claude.ai uses 5. |
| `limits.weeklyWindowDays` | `7` | Length of the rolling weekly window in days. |
| `warningTokens` | `100000` | Legacy fallback. Status bar turns amber when cumulative cross this value (only used if `limits.sessionTokens` is null). |
| `criticalTokens` | `160000` | Legacy fallback. Status bar turns red when cumulative crosses this value. |
| `nudge.mode` | `once-per-session` | One of `off`, `once-per-session`, `on-warning`, `on-critical`, `on-each`. Controls when the nudge notification fires. |
| `nudge.minIntervalMinutes` | `30` | Minimum gap between repeat nudges for the same session in `on-*` modes. |
| `nudge.suppressedSessions` | `[]` | Session ids you have asked not to be nudged about again. Add via the **Snooze this session** action. |
| `refreshIntervalSeconds` | `30` | How often the hover card and sidebar refresh wall-clock fields (reset countdowns, "X ago" strings). Minimum 5. |

**Suggested values for Claude Code Max on Opus with the 1M context window:**

```jsonc
{
  "claudeUsageMonitor.limits.sessionTokens": 15000000,
  "claudeUsageMonitor.limits.weeklyTokens": 480000000,
  "claudeUsageMonitor.nudge.mode": "on-critical",
  "claudeUsageMonitor.nudge.minIntervalMinutes": 60
}
```

Adjust the weekly figure to whatever your plan's Opus weekly quota is in raw tokens (visible on the Claude.ai usage page).

## How it works

The extension watches `~/.claude/projects/` — the directory where Claude Code writes per-session JSONL transcripts. Every record contains a `message.usage` block, and the extension:

1. **Parses each line tolerantly.** Malformed lines and records without a `usage` field are skipped.
2. **Dedupes by `message.id`.** Claude Code streams assistant responses and writes the same message to the transcript multiple times as it updates. The aggregator keeps each `message.id` only once.
3. **Computes Anthropic-billable totals.** Raw `input + output + cache_create + cache_read` heavily over-counts long-context sessions because cache reads dominate. Headline totals use Anthropic's standard cache-price weights — `input × 1.00 + output × 1.00 + cache_create × 1.25 + cache_read × 0.10` — so the numbers match the Claude.ai usage meter.
4. **Aggregates across rolling windows.** Tokens in the last 5 hours and 7 days are summed across every transcript on disk. Reset countdowns are computed as `oldest_in_window + window_length`.
5. **Refreshes opportunistically.** The watcher fires on transcript changes (~500 ms debounced) and a timer ticks every 30 seconds so countdowns and "X ago" strings stay live even when no chat is active.

Raw component totals (input, output, cache-create, cache-read) are preserved on every record, so the cache-hit percentage and last-turn input/output figures shown in the hover card stay accurate.

## Privacy and safety

- The extension opens transcript files **read-only** and never writes to `~/.claude/projects/`.
- **No network calls of any kind.** Nothing is sent to Anthropic, BRAINS, or any analytics endpoint.
- **No telemetry.** VSCode's own telemetry is unaffected; the extension itself emits none.

## Development

```
npm install
npm run watch      # esbuild in watch mode
```

Press **F5** in VSCode to open the Extension Development Host with the extension loaded.

```
npm test                # Vitest unit tests (135 tests)
npm run lint            # ESLint
npm run package         # build + vsce package → .vsix
npm run package:check   # fails if .vsix exceeds 1 MB
```

For manual verification steps, see [test/e2e/MANUAL_CHECKS.md](test/e2e/MANUAL_CHECKS.md). An automated end-to-end smoke (local only): `npm run test:e2e`.

The `assets/icon.png` shipped with this version is a 1×1 placeholder. A proper 128×128 icon will land before any VSCode Marketplace publish.

## Security

Vulnerabilities should be reported via GitHub Security Advisories on this repo, or to **security@brainscertified.com**. See [SECURITY.md](SECURITY.md) for the full policy.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md). The repo runs OpenSSF Scorecard, CodeQL, Trivy, Gitleaks, Dependabot, Vale (BRAINS prose rules), and a readability gate on every pull request — these are the BRAINS standard floor for any BRAINS-branded repository.

## About this project

BRAINS Claude Usage Monitor is a [BRAINS Incubator](https://brainscertified.com) project — one of the tools BRAINS uses internally to keep our own Claude Code work observable and accountable. It was the first end-to-end build run through the [BRAINS Build Platform](https://github.com/shard-BRAINS/BRAINS-build-platform), so the seventeen work packages, decisions log, and persona dispatch trail that produced it are part of the platform's dogfood history.

BRAINS is the global benchmark for neuro-affirming AI. We publish tools, research, and certifications under the principle that AI should work for every mind — including the engineers who build it. Issues, suggestions, and pull requests are welcome.

Reliable, affirming, inclusive.

— Built by neurodivergent minds, for neurodivergent people.

## License

[MIT](LICENSE)
