import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { aggregateSession } from './aggregator';
import { defaultProjectsDir } from './paths';
import type { SessionTotals } from './types';

// ---------------------------------------------------------------------------
// Typed event emitter wrapper
// ---------------------------------------------------------------------------

export interface TranscriptWatcherEvents {
  change: (totals: SessionTotals) => void;
  error: (err: unknown) => void;
}

/**
 * Thin typed wrapper so callers get full type-safety without casting through `any`.
 */
interface TypedEmitter {
  on<K extends keyof TranscriptWatcherEvents>(event: K, listener: TranscriptWatcherEvents[K]): this;
  off<K extends keyof TranscriptWatcherEvents>(event: K, listener: TranscriptWatcherEvents[K]): this;
  once<K extends keyof TranscriptWatcherEvents>(event: K, listener: TranscriptWatcherEvents[K]): this;
  emit<K extends keyof TranscriptWatcherEvents>(event: K, ...args: Parameters<TranscriptWatcherEvents[K]>): boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 500;

/**
 * Collect *.jsonl paths from dir.
 * When recursive is false (slug-scoped mode), only the top level is scanned.
 * When recursive is true (default), subdirectories are traversed, skipping dot-dirs and symlinks.
 */
async function collectJsonlFiles(dir: string, recursive = true): Promise<string[]> {
  let results: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (!recursive) continue;
      if (entry.name.startsWith('.')) continue;
      const sub = await collectJsonlFiles(path.join(dir, entry.name), recursive);
      results = results.concat(sub);
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      results.push(path.join(dir, entry.name));
    }
  }
  return results;
}

/** Pick the file with the most recent mtime. Returns null for empty arrays or when all stats fail. */
async function mostRecentFile(files: string[]): Promise<string | null> {
  if (files.length === 0) return null;
  let winner: string | null = null;
  let winnerMtime = -Infinity;
  for (const f of files) {
    try {
      const s = await fs.promises.stat(f);
      if (s.mtimeMs > winnerMtime) {
        winnerMtime = s.mtimeMs;
        winner = f;
      }
    } catch {
      // file may have been deleted between listing and stat — skip it
    }
  }
  return winner;
}

// ---------------------------------------------------------------------------
// TranscriptWatcher
// ---------------------------------------------------------------------------

export class TranscriptWatcher extends (EventEmitter as new () => EventEmitter & TypedEmitter) {
  private _watcher: fs.FSWatcher | null = null;
  private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _projectsDir: string | null = null;
  private _recursive = true;
  private _started = false;
  private _stopped = false;

  /** True only after a successful start() and after stop() has been called. */
  get closed(): boolean {
    return this._started && this._watcher === null;
  }

  async start(projectsDir?: string, projectSlug?: string): Promise<void> {
    // Idempotent: do not stack watchers
    if (this._watcher !== null) return;

    this._stopped = false;

    const baseDir = projectsDir ?? defaultProjectsDir();

    // When a slug is provided, scope the watched directory to that slug's subdirectory.
    // fs.watch is non-recursive because the slug dir contains only flat JSONL files.
    const dir = projectSlug ? path.join(baseDir, projectSlug) : baseDir;
    const recursive = !projectSlug;

    this._projectsDir = dir;
    this._recursive = recursive;

    // Gracefully handle a not-yet-existing directory (normal for new users / fresh workspaces)
    try {
      await fs.promises.access(dir);
    } catch {
      console.warn(`[TranscriptWatcher] projects dir does not exist, skipping watch: ${dir}`);
      return;
    }

    this._watcher = fs.watch(dir, { recursive }, (_eventType, _filename) => {
      this._scheduleRescan();
    });

    this._started = true;

    // Trigger an immediate rescan so the initial state is emitted shortly after start
    this._scheduleRescan();
  }

  stop(): void {
    if (this._debounceTimer !== null) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
    if (this._watcher !== null) {
      this._watcher.close();
      this._watcher = null;
    }
    this._stopped = true;
  }

  private _scheduleRescan(): void {
    if (this._debounceTimer !== null) {
      clearTimeout(this._debounceTimer);
    }
    this._debounceTimer = setTimeout(() => {
      this._debounceTimer = null;
      this._rescan().catch(() => {
        // _rescan handles its own error emission; this catch prevents unhandled rejections
      });
    }, DEBOUNCE_MS);
  }

  private async _rescan(): Promise<void> {
    if (this._projectsDir === null) return;
    const files = await collectJsonlFiles(this._projectsDir, this._recursive);
    const active = await mostRecentFile(files);
    if (active === null) return;
    try {
      const totals = await aggregateSession(active);
      if (this._stopped) return;
      this.emit('change', totals);
    } catch (err) {
      this.emit('error', err);
    }
  }
}
