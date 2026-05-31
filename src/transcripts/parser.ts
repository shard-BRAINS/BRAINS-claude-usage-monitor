import type { UsageRecord } from './types';

function clamp(n: number): number {
  return Math.max(0, Math.trunc(n));
}

function extractNumber(value: unknown): number {
  if (typeof value !== 'number' || !isFinite(value)) return 0;
  return clamp(value);
}

export function parseTranscriptLine(line: string): UsageRecord | null {
  try {
    const trimmed = line.trim();
    if (trimmed.length === 0) return null;

    const parsed: unknown = JSON.parse(trimmed);

    if (typeof parsed !== 'object' || parsed === null) return null;

    const record = parsed as Record<string, unknown>;
    const message = record['message'];
    if (typeof message !== 'object' || message === null) return null;

    const msg = message as Record<string, unknown>;
    const usage = msg['usage'];
    if (typeof usage !== 'object' || usage === null) return null;

    const u = usage as Record<string, unknown>;

    const tsRaw = record['timestamp'];
    let timestampMs: number | undefined;
    if (typeof tsRaw === 'string') {
      const parsed = Date.parse(tsRaw);
      if (!isNaN(parsed)) {
        timestampMs = parsed;
      }
    }

    const messageId =
      typeof msg['id'] === 'string' && msg['id'].length > 0
        ? (msg['id'] as string)
        : undefined;

    const result: UsageRecord = {
      input: extractNumber(u['input_tokens']),
      output: extractNumber(u['output_tokens']),
      cacheCreate: extractNumber(u['cache_creation_input_tokens']),
      cacheRead: extractNumber(u['cache_read_input_tokens']),
    };

    if (timestampMs !== undefined) {
      result.timestampMs = timestampMs;
    }
    if (messageId !== undefined) {
      result.messageId = messageId;
    }

    return result;
  } catch {
    return null;
  }
}
