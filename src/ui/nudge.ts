import * as vscode from 'vscode';
import type { SessionTotals } from '../transcripts/types';
import type { Thresholds } from '../config/thresholds';
import type { NudgeConfig } from '../config/nudge';

// ---------------------------------------------------------------------------
// NudgeState interface
// ---------------------------------------------------------------------------

export interface NudgeState {
  /** Legacy: was the once-per-session nudge fired for this session? */
  hasNudged(sessionId: string): boolean;
  /** Legacy: mark once-per-session nudge as fired. */
  markNudged(sessionId: string): void;
  /** Last observed total for this session (updated every maybeNudge call). */
  observation(sessionId: string): number | undefined;
  /** Record the latest observed total (called every invocation). */
  recordObservation(sessionId: string, total: number): void;
  /** Timestamp (ms) of the last time a nudge was actually shown. */
  lastFiredAt(sessionId: string): number | undefined;
  /** Record that a nudge fired at the given timestamp. */
  recordFire(sessionId: string, atMs: number): void;
}

// ---------------------------------------------------------------------------
// In-memory implementation (used in tests and as a fallback)
// ---------------------------------------------------------------------------

interface MemRecord {
  nudged: boolean;
  observation: number | undefined;
  lastFiredAt: number | undefined;
}

export function makeMemoryNudgeState(): NudgeState {
  const records = new Map<string, MemRecord>();

  function getOrCreate(sessionId: string): MemRecord {
    let r = records.get(sessionId);
    if (!r) {
      r = { nudged: false, observation: undefined, lastFiredAt: undefined };
      records.set(sessionId, r);
    }
    return r;
  }

  return {
    hasNudged(sessionId: string): boolean {
      return records.get(sessionId)?.nudged === true;
    },
    markNudged(sessionId: string): void {
      getOrCreate(sessionId).nudged = true;
    },
    observation(sessionId: string): number | undefined {
      return records.get(sessionId)?.observation;
    },
    recordObservation(sessionId: string, total: number): void {
      getOrCreate(sessionId).observation = total;
    },
    lastFiredAt(sessionId: string): number | undefined {
      return records.get(sessionId)?.lastFiredAt;
    },
    recordFire(sessionId: string, atMs: number): void {
      getOrCreate(sessionId).lastFiredAt = atMs;
    },
  };
}

// ---------------------------------------------------------------------------
// Memento-backed implementation (production)
// ---------------------------------------------------------------------------

// Memento key for per-session nudge bookkeeping.
// Changed from the legacy 'nudgedSessions' string-array shape on the v0.0.2
// upgrade; old data is abandoned silently. Users mid-session may see one
// extra once-per-session nudge after upgrade; acceptable v1 cost.
const MEMENTO_KEY = 'nudgeRecords';

interface MementoRecord {
  fired: boolean;
  observation: number | undefined;
  lastFiredAt: number | undefined;
}

type MementoStore = Record<string, MementoRecord>;

export function makeWorkspaceStateNudgeState(workspaceState: vscode.Memento): NudgeState {
  function getStore(): MementoStore {
    return workspaceState.get<MementoStore>(MEMENTO_KEY, {});
  }

  function saveStore(store: MementoStore): void {
    workspaceState.update(MEMENTO_KEY, store).then(undefined, (e) => {
      console.warn('[claude-usage-monitor] nudge state write failed', e);
    });
  }

  function getRecord(sessionId: string): MementoRecord {
    const store = getStore();
    return store[sessionId] ?? { fired: false, observation: undefined, lastFiredAt: undefined };
  }

  function mutateRecord(sessionId: string, fn: (r: MementoRecord) => MementoRecord): void {
    const store = getStore();
    store[sessionId] = fn(getRecord(sessionId));
    saveStore(store);
  }

  return {
    hasNudged(sessionId: string): boolean {
      return getRecord(sessionId).fired === true;
    },
    markNudged(sessionId: string): void {
      mutateRecord(sessionId, (r) => ({ ...r, fired: true }));
    },
    observation(sessionId: string): number | undefined {
      return getRecord(sessionId).observation;
    },
    recordObservation(sessionId: string, total: number): void {
      mutateRecord(sessionId, (r) => ({ ...r, observation: total }));
    },
    lastFiredAt(sessionId: string): number | undefined {
      return getRecord(sessionId).lastFiredAt;
    },
    recordFire(sessionId: string, atMs: number): void {
      mutateRecord(sessionId, (r) => ({ ...r, lastFiredAt: atMs }));
    },
  };
}

// ---------------------------------------------------------------------------
// maybeNudge
// ---------------------------------------------------------------------------

function comma(n: number): string {
  return n.toLocaleString('en-US');
}

export interface MaybeNudgeArgs {
  totals: SessionTotals;
  thresholds: { warning: number; critical: number };
  config: NudgeConfig;
  state: NudgeState;
  /** From vscode.workspace.workspaceFolders[0].name, or undefined if no workspace is open. */
  workspaceName: string | undefined;
  showInfo: (msg: string, ...actions: string[]) => Thenable<string | undefined>;
  onSnooze: (sessionId: string) => Promise<void>;
  /** Injected clock for tests; defaults to Date.now. */
  clock?: () => number;
}

export function maybeNudge(args: MaybeNudgeArgs): boolean {
  const { totals, thresholds, config, state, workspaceName, showInfo, onSnooze } = args;
  const clock = args.clock ?? Date.now;
  const now = clock();
  const { sessionId } = totals;

  // Always record the current observation so mode logic can detect upward crossings.
  const prevTotal = state.observation(sessionId);
  state.recordObservation(sessionId, totals.total);

  // 1. Off mode — never fire.
  if (config.mode === 'off') {
    return false;
  }

  // 2. Suppressed session.
  if (config.suppressedSessions.includes(sessionId)) {
    return false;
  }

  // 3 & 4. Mode-specific gate.
  const lastAt = state.lastFiredAt(sessionId);
  const intervalMs = config.minIntervalMinutes * 60_000;
  const intervalPassed = lastAt === undefined || now - lastAt >= intervalMs;

  let shouldFire = false;

  switch (config.mode) {
    case 'once-per-session':
      shouldFire = totals.total >= thresholds.critical && !state.hasNudged(sessionId);
      break;

    case 'on-warning':
      shouldFire =
        totals.total >= thresholds.warning &&
        (prevTotal === undefined || prevTotal < thresholds.warning) &&
        intervalPassed;
      break;

    case 'on-critical':
      shouldFire =
        totals.total >= thresholds.critical &&
        (prevTotal === undefined || prevTotal < thresholds.critical) &&
        intervalPassed;
      break;

    case 'on-each':
      shouldFire = totals.total >= thresholds.warning && intervalPassed;
      break;
  }

  if (!shouldFire) {
    return false;
  }

  // 5. Build message and fire (fire-and-forget).
  const label =
    workspaceName !== undefined
      ? workspaceName
      : sessionId.slice(-8);
  const pct = ((totals.total / thresholds.critical) * 100).toFixed(1);
  const msg = `[${label}] Claude conversation at ${comma(totals.total)} tokens (${pct}% of critical). Consider starting a fresh chat.`;

  void showInfo(msg, 'Start fresh chat', 'Snooze this session').then((choice) => {
    if (choice === 'Snooze this session') {
      void onSnooze(sessionId);
    }
  });

  // 6. Mark state. markNudged is only meaningful for once-per-session; calling
  // it in other modes would silently break a later switch back to once-per-session.
  state.recordFire(sessionId, now);
  if (config.mode === 'once-per-session') {
    state.markNudged(sessionId);
  }

  return true;
}

// ---------------------------------------------------------------------------
// Thresholds re-export (kept so callers that imported Thresholds from here still compile)
// ---------------------------------------------------------------------------

export type { Thresholds };
