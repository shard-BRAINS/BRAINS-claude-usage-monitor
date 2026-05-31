export interface UsageRecord {
  input: number;
  output: number;
  cacheCreate: number;
  cacheRead: number;
  timestampMs?: number;
  /** Stable id from `message.id` — used to dedupe streamed-then-finalized rows. */
  messageId?: string;
}

export interface SessionTotals {
  sessionId: string;
  filePath: string;
  input: number;
  output: number;
  cacheCreate: number;
  cacheRead: number;
  total: number;
  lastModified: Date;
  lastTurnInput: number;
  lastTurnOutput: number;
}

export interface TimelineEntry {
  timestampMs: number;
  input: number;
  output: number;
  cacheCreate: number;
  cacheRead: number;
  total: number;
}

export interface SessionTimeline {
  sessionId: string;
  filePath: string;
  entries: TimelineEntry[];
  cumulative: SessionTotals;
}
