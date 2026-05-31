import * as fs from 'fs';
import * as readline from 'readline';
import * as path from 'path';
import { parseTranscriptLine } from './parser';
import type { SessionTotals, SessionTimeline, TimelineEntry, UsageRecord } from './types';

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

export async function aggregateSession(filePath: string): Promise<SessionTotals> {
  const stat = await fs.promises.stat(filePath);

  let input = 0;
  let output = 0;
  let cacheCreate = 0;
  let cacheRead = 0;
  let last: UsageRecord = { input: 0, output: 0, cacheCreate: 0, cacheRead: 0 };
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
  }

  const sessionId = path.basename(filePath, '.jsonl');
  const total = computeBillable(input, output, cacheCreate, cacheRead);

  return {
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
  };
}

export async function aggregateSessionTimeline(filePath: string): Promise<SessionTimeline> {
  const stat = await fs.promises.stat(filePath);

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

    if (record.timestampMs !== undefined) {
      entries.push({
        timestampMs: record.timestampMs,
        input: record.input,
        output: record.output,
        cacheCreate: record.cacheCreate,
        cacheRead: record.cacheRead,
        total: computeBillable(record.input, record.output, record.cacheCreate, record.cacheRead),
      });
    }
  }

  const sessionId = path.basename(filePath, '.jsonl');
  const total = computeBillable(input, output, cacheCreate, cacheRead);

  const cumulative: SessionTotals = {
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
  };

  return { sessionId, filePath, entries, cumulative };
}
