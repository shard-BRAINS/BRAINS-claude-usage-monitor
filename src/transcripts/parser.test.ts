import { test, expect } from 'vitest';
import { parseTranscriptLine } from './parser';

test('returns null for empty string', () => {
  expect(parseTranscriptLine('')).toBeNull();
});

test('returns null for broken JSON opening brace', () => {
  expect(parseTranscriptLine('{')).toBeNull();
});

test('returns null for a bare JSON string value', () => {
  expect(parseTranscriptLine('"text"')).toBeNull();
});

test('returns null for valid JSON missing message.usage', () => {
  const line = JSON.stringify({ role: 'user', content: 'hi' });
  expect(parseTranscriptLine(line)).toBeNull();
});

test('returns null for valid JSON with message but no usage field', () => {
  const line = JSON.stringify({ type: 'user', message: { role: 'user', content: 'hi' } });
  expect(parseTranscriptLine(line)).toBeNull();
});

test('returns correct UsageRecord for a well-formed assistant line', () => {
  const line = JSON.stringify({
    type: 'assistant',
    message: {
      role: 'assistant',
      content: 'Hello',
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 20,
        cache_read_input_tokens: 30,
      },
    },
  });
  expect(parseTranscriptLine(line)).toEqual({
    input: 100,
    output: 50,
    cacheCreate: 20,
    cacheRead: 30,
  });
});

test('extracts message.id into messageId when present', () => {
  const line = JSON.stringify({
    type: 'assistant',
    message: {
      id: 'msg_01ABC',
      role: 'assistant',
      content: 'Hi',
      usage: { input_tokens: 1, output_tokens: 2 },
    },
  });
  const result = parseTranscriptLine(line);
  expect(result).not.toBeNull();
  expect(result!.messageId).toBe('msg_01ABC');
});

test('omits messageId when message.id is missing or empty', () => {
  const noId = JSON.stringify({
    type: 'assistant',
    message: { role: 'assistant', usage: { input_tokens: 1 } },
  });
  expect(parseTranscriptLine(noId)?.messageId).toBeUndefined();

  const emptyId = JSON.stringify({
    type: 'assistant',
    message: { id: '', role: 'assistant', usage: { input_tokens: 1 } },
  });
  expect(parseTranscriptLine(emptyId)?.messageId).toBeUndefined();
});

test('treats missing usage subfields as 0', () => {
  const line = JSON.stringify({
    type: 'assistant',
    message: {
      role: 'assistant',
      usage: {
        input_tokens: 42,
      },
    },
  });
  expect(parseTranscriptLine(line)).toEqual({
    input: 42,
    output: 0,
    cacheCreate: 0,
    cacheRead: 0,
  });
});

test('clamps negative numbers to 0', () => {
  const line = JSON.stringify({
    type: 'assistant',
    message: {
      usage: {
        input_tokens: -5,
        output_tokens: 10,
        cache_creation_input_tokens: -1,
        cache_read_input_tokens: 0,
      },
    },
  });
  expect(parseTranscriptLine(line)).toEqual({
    input: 0,
    output: 10,
    cacheCreate: 0,
    cacheRead: 0,
  });
});

test('truncates fractional numbers to integers', () => {
  const line = JSON.stringify({
    type: 'assistant',
    message: {
      usage: {
        input_tokens: 9.9,
        output_tokens: 3.1,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    },
  });
  expect(parseTranscriptLine(line)).toEqual({
    input: 9,
    output: 3,
    cacheCreate: 0,
    cacheRead: 0,
  });
});

test('returns null and does not throw for deeply nested malformed object', () => {
  // Provide a line that is valid JSON but where property traversal could throw
  // in a naive getter-based implementation (e.g. a getter that throws).
  // We craft an ordinary bad-shape object here and confirm no throw.
  const line = JSON.stringify({ message: { usage: 'not-an-object' } });
  let threw = false;
  let result = null;
  try {
    result = parseTranscriptLine(line);
  } catch {
    threw = true;
  }
  expect(threw).toBe(false);
  expect(result).toBeNull();
});

test('parses timestampMs from a valid ISO 8601 line', () => {
  const ts = '2026-05-29T05:30:00.123Z';
  const line = JSON.stringify({
    type: 'assistant',
    timestamp: ts,
    message: {
      role: 'assistant',
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    },
  });
  const result = parseTranscriptLine(line);
  expect(result).not.toBeNull();
  expect(result!.timestampMs).toBe(Date.parse(ts));
});

test('timestampMs is undefined when timestamp field missing', () => {
  const line = JSON.stringify({
    type: 'assistant',
    message: {
      role: 'assistant',
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 20,
        cache_read_input_tokens: 30,
      },
    },
  });
  const result = parseTranscriptLine(line);
  expect(result).not.toBeNull();
  expect(result!.timestampMs).toBeUndefined();
});

test('does not throw on malformed timestamp', () => {
  const line = JSON.stringify({
    type: 'assistant',
    timestamp: 'not a date',
    message: {
      role: 'assistant',
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    },
  });
  let threw = false;
  let result: ReturnType<typeof parseTranscriptLine> = null;
  try {
    result = parseTranscriptLine(line);
  } catch {
    threw = true;
  }
  expect(threw).toBe(false);
  expect(result).not.toBeNull();
  expect(result!.timestampMs).toBeUndefined();
});
