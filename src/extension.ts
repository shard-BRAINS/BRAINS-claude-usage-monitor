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
import { maybeNudge, makeWorkspaceStateNudgeState } from './ui/nudge';
import { listAllSessions, tokensInWindow, nextResetAt } from './transcripts/rolling';
import { defaultProjectsDir } from './transcripts/paths';
import type { HoverCardData, SessionListItem } from './ui/hoverCard';
import type { Sample } from './ui/svg';
import type { SessionTotals, SessionTimeline } from './transcripts/types';

let watcher: TranscriptWatcher | undefined;

/** Derive a display label from a session file path (parent dir = project slug). */
function deriveLabel(filePath: string): string {
  return path.basename(path.dirname(filePath));
}

/**
 * Build a 60-point per-minute sparkline of the running cumulative tokens
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
  const BUCKET_MS = 60 * 1000;
  const BUCKETS = 60;
  const windowStart = nowMs - WINDOW_MS;
  const deltas = new Array<number>(BUCKETS).fill(0);
  let any = false;
  for (const t of timelines) {
    for (const e of t.entries) {
      if (e.timestampMs < windowStart || e.timestampMs > nowMs) continue;
      const idx = Math.min(BUCKETS - 1, Math.floor((e.timestampMs - windowStart) / BUCKET_MS));
      deltas[idx] += e.total;
      any = true;
    }
  }
  if (!any) return [];
  let running = 0;
  return deltas.map((delta, i) => {
    running += delta;
    return {
      tMs: windowStart + i * BUCKET_MS,
      cumulative: running,
    };
  });
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

    return {
      nowMs: now,
      session: {
        windowLabel: `Session (${limits.sessionWindowHours}h)`,
        used: tokensInWindow(timelines, sessionMs, now),
        limit: limits.sessionTokens,
        nextResetAt: nextResetAt(timelines, sessionMs, now),
      },
      weekly: {
        windowLabel: `Weekly (${limits.weeklyWindowDays}d)`,
        used: tokensInWindow(timelines, weeklyMs, now),
        limit: limits.weeklyTokens,
        nextResetAt: nextResetAt(timelines, weeklyMs, now),
      },
      thisWindow: latestScopedTotals,
      allSessions,
      sparkline: buildSparkline(timelines, now),
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

  const folder = vscode.workspace.workspaceFolders?.[0];
  const projectSlug = folder ? pathToProjectSlug(folder.uri.fsPath) : undefined;

  // Periodic tick has three jobs, all guarding against the same failure
  // mode: a silent fs.watch death (Windows buffer overflow, AV/indexer
  // contention, network share hiccups). When the watcher dies it stops
  // emitting 'change', and since the status bar is wired only to 'change',
  // its text freezes. So the timer:
  //   1. revives the watcher if it's closed,
  //   2. forces a rescan that re-emits 'change' (status bar gets fresh totals),
  //   3. rebuilds the sidebar's cached hover data.
  const refreshMs = getRefreshIntervalSeconds() * 1000;
  async function refreshTick(): Promise<void> {
    try {
      const w = watcher;
      if (w !== undefined) {
        if (w.closed) {
          console.warn('[claude-usage-monitor] watcher had stopped — restarting');
          await w.start(undefined, projectSlug);
        } else {
          await w.rescanNow();
        }
      }
      cachedHoverData = await buildHoverData();
      sidebar.refresh();
    } catch (err) {
      console.warn('[claude-usage-monitor] refresh tick failed', err);
    }
  }
  const refreshTimer = setInterval(() => {
    void refreshTick();
  }, refreshMs);
  context.subscriptions.push({ dispose: () => clearInterval(refreshTimer) });

  // Fire one build immediately so the first sidebar paint has real data
  // (including the sparkline) instead of waiting for the first refresh tick.
  void buildHoverData().then((data) => {
    cachedHoverData = data;
    sidebar.refresh();
  });

  watcher.on('error', (err) => console.warn('[claude-usage-monitor] watcher error', err));

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
export const _test = { buildSparkline };
