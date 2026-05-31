import * as fs from 'fs';
import * as path from 'path';
import { aggregateSessionTimeline } from './aggregator';
import type { SessionTimeline } from './types';

/**
 * Walk <projectsDir>/<slug>/*.jsonl and return a SessionTimeline for each file.
 * Skips dot-dirs, symlinks, and files that fail to parse.
 */
export async function listAllSessions(projectsDir: string): Promise<SessionTimeline[]> {
  const timelines: SessionTimeline[] = [];

  let slugEntries: fs.Dirent[];
  try {
    slugEntries = await fs.promises.readdir(projectsDir, { withFileTypes: true });
  } catch {
    return timelines;
  }

  for (const slugEntry of slugEntries) {
    if (slugEntry.isSymbolicLink()) continue;
    if (!slugEntry.isDirectory()) continue;
    if (slugEntry.name.startsWith('.')) continue;

    const slugDir = path.join(projectsDir, slugEntry.name);

    let fileEntries: fs.Dirent[];
    try {
      fileEntries = await fs.promises.readdir(slugDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const fileEntry of fileEntries) {
      if (fileEntry.isSymbolicLink()) continue;
      if (!fileEntry.isFile()) continue;
      if (!fileEntry.name.endsWith('.jsonl')) continue;

      const filePath = path.join(slugDir, fileEntry.name);
      try {
        const timeline = await aggregateSessionTimeline(filePath);
        timelines.push(timeline);
      } catch {
        // Race-deleted or unreadable — skip silently
      }
    }
  }

  return timelines;
}

/**
 * Sum entry.total for every TimelineEntry across all timelines where
 * the entry falls within [nowMs - windowMs, nowMs].
 */
export function tokensInWindow(
  timelines: SessionTimeline[],
  windowMs: number,
  nowMs: number,
): number {
  let total = 0;
  for (const timeline of timelines) {
    for (const entry of timeline.entries) {
      const age = nowMs - entry.timestampMs;
      if (age >= 0 && age <= windowMs) {
        total += entry.total;
      }
    }
  }
  return total;
}

/**
 * Return the moment the oldest in-window entry will fall out of the window,
 * or undefined if no entries are currently in the window.
 */
export function nextResetAt(
  timelines: SessionTimeline[],
  windowMs: number,
  nowMs: number,
): number | undefined {
  let oldest: number | undefined;

  for (const timeline of timelines) {
    for (const entry of timeline.entries) {
      const age = nowMs - entry.timestampMs;
      if (age >= 0 && age <= windowMs) {
        if (oldest === undefined || entry.timestampMs < oldest) {
          oldest = entry.timestampMs;
        }
      }
    }
  }

  if (oldest === undefined) return undefined;
  return oldest + windowMs;
}
