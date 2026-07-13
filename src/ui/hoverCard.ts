import * as vscode from 'vscode';
import type { SessionTotals } from '../transcripts/types';
import type { UnconfiguredBarStyle } from '../config/barStyle';
import type { ReferenceSource } from '../config/limits';
import type { ModelMixItem } from './modelMix';
import {
  commaFormat,
  relativeTime,
  countdownFormat,
  rollingRowLabel,
  durationLabel,
  shortTokens,
} from './formatters';
import { formatModelMix } from './modelMix';
import { renderUnconfiguredBar } from './barRenderer';
import { renderSparklineSvg } from './svg';
import type { Sample } from './svg';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Per-window auxiliary data used by the no-limit fallback renderers
 * (heatmap / sparkline / dual-band). Computed once per refresh in
 * extension.ts and attached to RollingSnapshot.
 */
export interface RollingDetail {
  /** Sparkline samples — cumulative tokens across the window, one per bucket. */
  samples: Sample[];
  /** Heatmap buckets — token total per bucket, oldest first. */
  buckets: number[];
  /** Dual-band: most-recent-bucket value vs peak bucket in window, [0, 1]. */
  intensity: number;
  /** Dual-band: fraction of window covered by activity, [0, 1]. */
  saturation: number;
}

export interface RollingSnapshot {
  windowLabel: string;
  used: number;
  /** User-configured token limit for this window, or null when unset. */
  limit: number | null;
  /**
   * Effective denominator for the progress bar. Equals `limit` when
   * configured; otherwise a soft "typical peak" default. Always populated.
   */
  reference: number;
  /** Whether `reference` came from user config or the soft default. */
  referenceSource: ReferenceSource;
  nextResetAt: number | undefined;
  /**
   * Optional per-window detail used when no token limit is configured.
   * When absent, the no-limit bar falls back to the static "no-plan rail".
   */
  detail?: RollingDetail;
  /**
   * Tokens that will fall out of the window in the next roll-off event.
   * Rendered as a "ghost" slice on the leading edge of the bar so users
   * can see relief coming. Undefined when no roll-off is imminent.
   */
  rolloffTokens?: number;
  /** Effective burn-rate tokens/min contributing to this window, or 0. */
  tokensPerMin?: number;
  /**
   * Milliseconds until `used` reaches `reference` at the current burn rate.
   * Undefined when burn is zero or reference already exceeded.
   */
  projectedExhaustMs?: number;
  /** Aggregated model mix inside the window; empty when no models known. */
  modelMix?: ModelMixItem[];
}

export interface SessionListItem {
  sessionId: string;
  label: string;
  total: number;
  lastActivityMs: number;
}

export interface HoverCardData {
  session: RollingSnapshot;
  weekly: RollingSnapshot;
  thisWindow: SessionTotals | undefined;
  allSessions: SessionListItem[];
  nowMs: number;
  sparkline?: Sample[];
  /** Style for the no-limit Session/Weekly bars. Defaults to 'heatmap'. */
  barStyle?: UnconfiguredBarStyle;
}

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf-8').toString('base64')}`;
}

function rollingBarImg(snapshot: RollingSnapshot, style: UnconfiguredBarStyle | undefined): string {
  return `<img src="${svgDataUri(renderUnconfiguredBar(snapshot, style))}">`;
}

function sparklineImg(samples: Sample[]): string {
  return `<img src="${svgDataUri(renderSparklineSvg(samples))}">`;
}

function resetLabel(snapshot: RollingSnapshot, nowMs: number): string {
  return snapshot.nextResetAt !== undefined
    ? `Oldest rolls off in ${countdownFormat(snapshot.nextResetAt - nowMs)}`
    : 'Oldest rolls off in —';
}

function burnRateLine(snapshot: RollingSnapshot): string {
  const rate = snapshot.tokensPerMin;
  if (rate === undefined || rate <= 0) return '';
  const eta =
    snapshot.projectedExhaustMs !== undefined
      ? ` · hits ${shortTokens(snapshot.reference)} in ${durationLabel(snapshot.projectedExhaustMs)}`
      : '';
  return `Burn: ${shortTokens(Math.round(rate))} tok/min${eta}`;
}

function modelMixLine(snapshot: RollingSnapshot): string {
  const mix = snapshot.modelMix;
  if (mix === undefined || mix.length === 0) return '';
  return `Models: ${formatModelMix(mix)}`;
}

// ---------------------------------------------------------------------------
// renderHoverMarkdown
// ---------------------------------------------------------------------------

export function renderHoverMarkdown(data: HoverCardData): vscode.MarkdownString {
  const { session, weekly, thisWindow, allSessions, nowMs, sparkline, barStyle } = data;

  const lines: string[] = [];

  lines.push('**Claude Usage**');
  lines.push('');

  // --- Session window row ---
  lines.push(
    `**${session.windowLabel}**: ${commaFormat(session.used)} tokens · ${rollingRowLabel(session.used, session.reference, session.referenceSource)} · ${resetLabel(session, nowMs)}`,
  );
  lines.push(rollingBarImg(session, barStyle));
  const sessionBurnLine = burnRateLine(session);
  if (sessionBurnLine !== '') lines.push(sessionBurnLine);
  const sessionMixLine = modelMixLine(session);
  if (sessionMixLine !== '') lines.push(sessionMixLine);
  lines.push('');

  // --- Weekly window row ---
  lines.push(
    `**${weekly.windowLabel}**: ${commaFormat(weekly.used)} tokens · ${rollingRowLabel(weekly.used, weekly.reference, weekly.referenceSource)} · ${resetLabel(weekly, nowMs)}`,
  );
  lines.push(rollingBarImg(weekly, barStyle));
  const weeklyBurnLine = burnRateLine(weekly);
  if (weeklyBurnLine !== '') lines.push(weeklyBurnLine);
  lines.push('');

  // --- Last hour sparkline ---
  if (sparkline !== undefined) {
    lines.push('**Last hour**');
    lines.push(sparklineImg(sparkline));
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  // --- This window ---
  lines.push('**This window**');
  if (thisWindow !== undefined) {
    const idTail = thisWindow.sessionId.length > 8
      ? thisWindow.sessionId.slice(-8)
      : thisWindow.sessionId;
    const cacheDenom = thisWindow.cacheRead + thisWindow.cacheCreate;
    const cacheRatioStr =
      cacheDenom > 0 ? `${((thisWindow.cacheRead / cacheDenom) * 100).toFixed(1)}%` : 'n/a';
    const lastActivityStr = relativeTime(nowMs, thisWindow.lastModified.getTime());

    lines.push(`Session: \`${idTail}\``);
    lines.push(`Cumulative: ${commaFormat(thisWindow.total)} tokens`);
    lines.push(
      `Current context (last turn): ${commaFormat(thisWindow.lastTurnInput)} input · ${commaFormat(thisWindow.lastTurnOutput)} output · cache hit ${cacheRatioStr}`,
    );
    lines.push(`Last activity: ${lastActivityStr}`);
  } else {
    lines.push('No session found for this workspace');
  }
  lines.push('');

  lines.push('---');
  lines.push('');

  // --- Recently active sessions ---
  lines.push('**Recently active sessions** (last 5)');
  if (allSessions.length === 0) {
    lines.push('No sessions found');
  } else {
    const top5 = allSessions.slice(0, 5);
    for (const s of top5) {
      const idTail = s.sessionId.length > 8 ? s.sessionId.slice(-8) : s.sessionId;
      const activityStr = relativeTime(nowMs, s.lastActivityMs);
      lines.push(`- \`${s.label}\` / \`${idTail}\` — ${commaFormat(s.total)} tokens · ${activityStr}`);
    }
  }

  const md = new vscode.MarkdownString(lines.join('\n'));
  md.isTrusted = false;
  md.supportHtml = true;
  return md;
}
