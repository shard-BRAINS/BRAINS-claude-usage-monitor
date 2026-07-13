import * as fs from 'fs';
import * as readline from 'readline';
import * as path from 'path';
import { parseTranscriptLine } from './parser';
import type { SessionTotals, SessionTimeline, TimelineEntry, UsageRecord } from './types';

/**
 * Hard cap on a single transcript file we'll read. Real Claude Code transcripts
 * top out in the low single-digit MB; anything larger is either corrupted or a
 * tool that wrote binary into the JSONL. Skipping protects the extension host.
 */
export const MAX_FILE_BYTES = 256 * 1024 * 1024;

/**
 * Effective "billable" tokens, matching Anthropic's standard prompt-caching
 * price weights (input=1.00, output=1.00, cacheCreate=1.25, cacheRead=0.10).
 *
 * Raw input+output+cache_create+cache_read overcounts dramatically when
 * cache reads dominate long-context sessions — the user-facing totals here
 * track Anthropic's session/weekly quota meters instead.
 */
export function computeBillable(
  input: number,
  output: number,
  cacheCreate: number,
  cacheRead: number,
): number {
  return Math.round(input + output + cacheCreate * 1.25 + cacheRead * 0.1);
}

interface AggregateOptions {
  collectEntries: boolean;
}

interface AggregateResult {
  totals: SessionTotals;
  entries: TimelineEntry[];
}

async function aggregateFile(filePath: string, opts: AggregateOptions): Promise<AggregateResult | null> {
  const stat = await fs.promises.stat(filePath);
  if (stat.size > MAX_FILE_BYTES) {
    console.warn(
      `[claude-usage-monitor] skipping oversized transcript (${stat.size} bytes): ${filePath}`,
    );
    return null;
  }

  let input = 0;
  let output = 0;
  let cacheCreate = 0;
  let cacheRead = 0;
  let last: UsageRecord = { input: 0, output: 0, cacheCreate: 0, cacheRead: 0 };
  const entries: TimelineEntry[] = [];
  const seenIds = new Set<string>();

  const stream = fs.createReadStream(filePath, { flags: 'r' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    const record = parseTranscriptLine(line);
    if (record === null) continue;
    if (record.messageId !== undefined) {
      if (seenIds.has(record.messageId)) continue;
      seenIds.add(record.messageId);
    }
    input += record.input;
    output += record.output;
    cacheCreate += record.cacheCreate;
    cacheRead += record.cacheRead;
    last = record;

    if (opts.collectEntries && record.timestampMs !== undefined) {
      const entry: TimelineEntry = {
        timestampMs: record.timestampMs,
        input: record.input,
        output: record.output,
        cacheCreate: record.cacheCreate,
        cacheRead: record.cacheRead,
        total: computeBillable(record.input, record.output, record.cacheCreate, record.cacheRead),
      };
      if (record.model !== undefined) {
        entry.model = record.model;
      }
      entries.push(entry);
    }
  }

  const sessionId = path.basename(filePath, '.jsonl');
  const total = computeBillable(input, output, cacheCreate, cacheRead);

  return {
    totals: {
      sessionId,
      filePath,
      input,
      output,
      cacheCreate,
      cacheRead,
      total,
      lastModified: stat.mtime,
      lastTurnInput: last.input,
      lastTurnOutput: last.output,
    },
    entries,
  };
}

// ---------------------------------------------------------------------------
// Per-file aggregation cache
//
// listAllSessions runs every 30s by default, and Claude transcripts only ever
// grow, so re-streaming every file each tick was the dominant runtime cost for
// users with many sessions. Cache by (mtimeMs, size); evict when either
// changes. Exposed for tests via clearAggregationCache().
// ---------------------------------------------------------------------------

interface CacheEntry {
  mtimeMs: number;
  size: number;
  timeline: SessionTimeline;
}

const timelineCache = new Map<string, CacheEntry>();

export function clearAggregationCache(): void {
  timelineCache.clear();
}

export async function aggregateSession(filePath: string): Promise<SessionTotals> {
  const result = await aggregateFile(filePath, { collectEntries: false });
  if (result === null) {
    const stat = await fs.promises.stat(filePath);
    const sessionId = path.basename(filePath, '.jsonl');
    return {
      sessionId,
      filePath,
      input: 0,
      output: 0,
      cacheCreate: 0,
      cacheRead: 0,
      total: 0,
      lastModified: stat.mtime,
      lastTurnInput: 0,
      lastTurnOutput: 0,
    };
  }
  return result.totals;
}

export async function aggregateSessionTimeline(filePath: string): Promise<SessionTimeline> {
  const stat = await fs.promises.stat(filePath);
  const cached = timelineCache.get(filePath);
  if (cached !== undefined && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached.timeline;
  }

  const result = await aggregateFile(filePath, { collectEntries: true });
  if (result === null) {
    const sessionId = path.basename(filePath, '.jsonl');
    const empty: SessionTimeline = {
      sessionId,
      filePath,
      entries: [],
      cumulative: {
        sessionId,
        filePath,
        input: 0,
        output: 0,
        cacheCreate: 0,
        cacheRead: 0,
        total: 0,
        lastModified: stat.mtime,
        lastTurnInput: 0,
        lastTurnOutput: 0,
      },
    };
    return empty;
  }

  const timeline: SessionTimeline = {
    sessionId: result.totals.sessionId,
    filePath,
    entries: result.entries,
    cumulative: result.totals,
  };
  timelineCache.set(filePath, { mtimeMs: stat.mtimeMs, size: stat.size, timeline });
  return timeline;
}
