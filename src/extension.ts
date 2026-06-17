import * as vscode from 'vscode';
import * as path from 'path';
import { TranscriptWatcher } from './transcripts/watcher';
import { pathToProjectSlug } from './transcripts/slug';
import { createStatusBar } from './ui/statusBar';
import { UsageSidebarProvider } from './ui/sidebarView';
import { getThresholds } from './config/thresholds';
import { getLimits } from './config/limits';
import { getRefreshIntervalSeconds } from './config/refresh';
import { getNudgeConfig, addSuppressedSession } from './config/nudge';
import { getUnconfiguredBarStyle } from './config/barStyle';
import { maybeNudge, makeWorkspaceStateNudgeState } from './ui/nudge';
import { listAllSessions, tokensInWindow, nextResetAt } from './transcripts/rolling';
import { defaultProjectsDir } from './transcripts/paths';
import type { HoverCardData, RollingDetail, SessionListItem } from './ui/hoverCard';
import type { Sample } from './ui/svg';
import type { SessionTotals, SessionTimeline } from './transcripts/types';

let watcher: TranscriptWatcher | undefined;

/** Derive a display label from a session file path (parent dir = project slug). */
function deriveLabel(filePath: string): string {
  return path.basename(path.dirname(filePath));
}

/**
 * Bucket the per-entry token totals across [nowMs - windowMs, nowMs] into
 * `bucketCount` evenly-spaced bins, oldest-first. Each bin holds the sum of
 * `entry.total` for entries that landed in its time slice.
 *
 * Used as the raw input for the heatmap / sparkline / dual-band renderers.
 */
function bucketTokensInWindow(
  timelines: SessionTimeline[],
  windowMs: number,
  bucketCount: number,
  nowMs: number,
): number[] {
  const bucketMs = windowMs / bucketCount;
  const windowStart = nowMs - windowMs;
  const buckets = new Array<number>(bucketCount).fill(0);
  for (const t of timelines) {
    for (const e of t.entries) {
      if (e.timestampMs < windowStart || e.timestampMs > nowMs) continue;
      const idx = Math.min(
        bucketCount - 1,
        Math.floor((e.timestampMs - windowStart) / bucketMs),
      );
      buckets[idx] += e.total;
    }
  }
  return buckets;
}

/**
 * Convert a delta-per-bucket array into a cumulative-sample series.
 * If every bucket is zero, returns [] so the sparkline renderer can draw
 * a flat baseline.
 */
function bucketsToCumulativeSamples(
  buckets: number[],
  windowMs: number,
  nowMs: number,
): Sample[] {
  const bucketMs = windowMs / buckets.length;
  const windowStart = nowMs - windowMs;
  let any = false;
  let running = 0;
  const samples = buckets.map((delta, i) => {
    if (delta > 0) any = true;
    running += delta;
    return {
      tMs: windowStart + i * bucketMs,
      cumulative: running,
    };
  });
  return any ? samples : [];
}

/**
 * Build a 60-point per-minute sparkline of running cumulative tokens
 * consumed within the last hour, summed across all timelines.
 *
 * Each Sample.cumulative is the total tokens charged from the start of the
 * window up to and including that minute bucket — so the line climbs as the
 * hour progresses and stays at its max once activity stops, giving a real
 * "tokens consumed this hour" trend rather than a sparse delta histogram.
 *
 * Returns [] when no entries in the window.
 */
function buildSparkline(timelines: SessionTimeline[], nowMs: number): Sample[] {
  const WINDOW_MS = 60 * 60 * 1000;
  const BUCKETS = 60;
  return bucketsToCumulativeSamples(
    bucketTokensInWindow(timelines, WINDOW_MS, BUCKETS, nowMs),
    WINDOW_MS,
    nowMs,
  );
}

/**
 * Compute the per-window detail used by the no-limit fallback renderers:
 *
 *  - `buckets`: oldest-first bucketed token totals for the heatmap tiles.
 *  - `samples`: same buckets reduced to a cumulative-over-time series for
 *    the sparkline.
 *  - `intensity`: latest non-empty bucket's value relative to the peak
 *    bucket in the window, clamped to [0, 1]. ~1 means the most recent
 *    activity was as heavy as the heaviest moment in the window.
 *  - `saturation`: fraction of the window covered by activity, computed as
 *    `(nowMs - oldestEntryInWindow) / windowMs`. Approaches 1 as the
 *    rolling window fills up with entries.
 */
function buildWindowDetail(
  timelines: SessionTimeline[],
  windowMs: number,
  bucketCount: number,
  nowMs: number,
): RollingDetail {
  const buckets = bucketTokensInWindow(timelines, windowMs, bucketCount, nowMs);
  const samples = bucketsToCumulativeSamples(buckets, windowMs, nowMs);

  const peak = Math.max(...buckets, 0);

  // intensity = latest bucket with activity, divided by peak.
  let lastWithActivity = 0;
  for (let i = buckets.length - 1; i >= 0; i--) {
    if (buckets[i] > 0) {
      lastWithActivity = buckets[i];
      break;
    }
  }
  const intensity = peak > 0 ? Math.min(1, lastWithActivity / peak) : 0;

  // saturation = (now - oldestEntryInWindow) / windowMs
  const windowStart = nowMs - windowMs;
  let oldest: number | undefined;
  for (const t of timelines) {
    for (const e of t.entries) {
      if (e.timestampMs < windowStart || e.timestampMs > nowMs) continue;
      if (oldest === undefined || e.timestampMs < oldest) oldest = e.timestampMs;
    }
  }
  const saturation = oldest === undefined
    ? 0
    : Math.min(1, Math.max(0, (nowMs - oldest) / windowMs));

  return { samples, buckets, intensity, saturation };
}

export function activate(context: vscode.ExtensionContext): void {
  watcher = new TranscriptWatcher();

  const projectsDir = defaultProjectsDir();
  let latestScopedTotals: SessionTotals | undefined;

  async function buildHoverData(): Promise<HoverCardData> {
    const now = Date.now();
    const limits = getLimits();
    const timelines = await listAllSessions(projectsDir);
    const sessionMs = limits.sessionWindowHours * 3_600_000;
    const weeklyMs = limits.weeklyWindowDays * 86_400_000;

    const allSessions: SessionListItem[] = timelines
      .map((t) => ({
        sessionId: t.sessionId,
        label: deriveLabel(t.filePath),
        total: t.cumulative.total,
        lastActivityMs:
          t.entries.length > 0 ? t.entries[t.entries.length - 1].timestampMs : 0,
      }))
      .sort((a, b) => b.lastActivityMs - a.lastActivityMs)
      .slice(0, 5);

    // Bucket counts tuned for tile readability at the sidebar's 220px width:
    //   Session (5h)  → 20 tiles (15min each, ~11px wide)
    //   Weekly (7d)   → 7  tiles (1 day each,  ~31px wide)
    const sessionBuckets = Math.max(1, limits.sessionWindowHours * 4);
    const weeklyBuckets = Math.max(1, limits.weeklyWindowDays);

    return {
      nowMs: now,
      session: {
        windowLabel: `Session (${limits.sessionWindowHours}h)`,
        used: tokensInWindow(timelines, sessionMs, now),
        limit: limits.sessionTokens,
        nextResetAt: nextResetAt(timelines, sessionMs, now),
        detail: buildWindowDetail(timelines, sessionMs, sessionBuckets, now),
      },
      weekly: {
        windowLabel: `Weekly (${limits.weeklyWindowDays}d)`,
        used: tokensInWindow(timelines, weeklyMs, now),
        limit: limits.weeklyTokens,
        nextResetAt: nextResetAt(timelines, weeklyMs, now),
        detail: buildWindowDetail(timelines, weeklyMs, weeklyBuckets, now),
      },
      thisWindow: latestScopedTotals,
      allSessions,
      sparkline: buildSparkline(timelines, now),
      barStyle: getUnconfiguredBarStyle(),
    };
  }

  // Synchronous getter that returns latest cached data for the status bar tooltip.
  // We maintain a cached snapshot and refresh it on each watcher change.
  let cachedHoverData: HoverCardData = {
    nowMs: Date.now(),
    session: { windowLabel: 'Session (5h)', used: 0, limit: null, nextResetAt: undefined },
    weekly: { windowLabel: 'Weekly (7d)', used: 0, limit: null, nextResetAt: undefined },
    thisWindow: undefined,
    allSessions: [],
  };

  function getHoverData(): HoverCardData {
    return cachedHoverData;
  }

  createStatusBar(context, watcher, () => getThresholds(), getHoverData);

  const sidebar = new UsageSidebarProvider(
    context.extensionUri,
    watcher,
    getHoverData,
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('claudeUsageMonitor.view', sidebar),
  );

  const refreshMs = getRefreshIntervalSeconds() * 1000;
  const refreshTimer = setInterval(() => {
    void buildHoverData().then((data) => {
      cachedHoverData = data;
      sidebar.refresh();
    });
  }, refreshMs);
  context.subscriptions.push({ dispose: () => clearInterval(refreshTimer) });

  // Fire one build immediately so the first sidebar paint has real data
  // (including the sparkline) instead of waiting for the first refresh tick.
  void buildHoverData().then((data) => {
    cachedHoverData = data;
    sidebar.refresh();
  });

  watcher.on('error', (err) => console.warn('[claude-usage-monitor] watcher error', err));

  const folder = vscode.workspace.workspaceFolders?.[0];
  const projectSlug = folder ? pathToProjectSlug(folder.uri.fsPath) : undefined;
  void watcher.start(undefined, projectSlug);

  const nudgeState = makeWorkspaceStateNudgeState(context.workspaceState);
  const showInfo = vscode.window.showInformationMessage.bind(vscode.window) as (
    msg: string,
    ...actions: string[]
  ) => Thenable<string | undefined>;

  watcher.on('change', (totals: SessionTotals) => {
    latestScopedTotals = totals;

    // Refresh cached hover data asynchronously; then push fresh panel to sidebar.
    void buildHoverData().then((data) => {
      cachedHoverData = data;
      sidebar.refresh();
    });

    maybeNudge({
      totals,
      thresholds: getThresholds(),
      config: getNudgeConfig(),
      state: nudgeState,
      workspaceName: vscode.workspace.workspaceFolders?.[0]?.name,
      showInfo,
      onSnooze: addSuppressedSession,
    });
  });
}

export function deactivate(): void {
  watcher?.stop();
  watcher = undefined;
}

// Exported for unit testing only.
export const _test = {
  buildSparkline,
  bucketTokensInWindow,
  buildWindowDetail,
};
