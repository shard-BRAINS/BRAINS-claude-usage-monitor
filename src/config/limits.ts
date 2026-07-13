import * as vscode from 'vscode';

export interface Limits {
  sessionTokens: number | null;
  weeklyTokens: number | null;
  sessionWindowHours: number;
  weeklyWindowDays: number;
}

export const DEFAULT_LIMITS: Limits = {
  sessionTokens: null,
  weeklyTokens: null,
  sessionWindowHours: 5,
  weeklyWindowDays: 7,
};

/**
 * Soft "typical peak" references used to give the Session/Weekly progress
 * bars a meaningful denominator when the user has not configured a hard
 * limit. Chosen to line up with Anthropic's public guidance on Pro-plan
 * usage; they read as "this is how full the window usually gets", not as a
 * hard cap. Users who consistently exceed them can set their own limits
 * via `claudeUsageMonitor.limits.sessionTokens` / `weeklyTokens`.
 */
export const DEFAULT_REFERENCE_SESSION_TOKENS = 220_000;
export const DEFAULT_REFERENCE_WEEKLY_TOKENS = 1_540_000;

export type ReferenceSource = 'configured' | 'default';

export interface ResolvedReference {
  value: number;
  source: ReferenceSource;
}

/**
 * Resolve the denominator for a rolling-window progress bar.
 *  - If a positive numeric limit is configured, use it (source='configured').
 *  - Otherwise use the soft default reference (source='default').
 */
export function resolveReference(
  configured: number | null,
  fallback: number,
): ResolvedReference {
  if (configured !== null && configured > 0) {
    return { value: configured, source: 'configured' };
  }
  return { value: fallback, source: 'default' };
}

export function getLimits(): Limits {
  const cfg = vscode.workspace.getConfiguration('claudeUsageMonitor');

  const rawSessionTokens = cfg.get<unknown>('limits.sessionTokens');
  const rawWeeklyTokens = cfg.get<unknown>('limits.weeklyTokens');
  const rawSessionWindowHours = cfg.get<unknown>('limits.sessionWindowHours');
  const rawWeeklyWindowDays = cfg.get<unknown>('limits.weeklyWindowDays');

  // Token limits accept null or a positive integer
  const sessionTokens: number | null =
    rawSessionTokens === null || rawSessionTokens === undefined
      ? DEFAULT_LIMITS.sessionTokens
      : Number.isInteger(rawSessionTokens) && (rawSessionTokens as number) > 0
        ? (rawSessionTokens as number)
        : DEFAULT_LIMITS.sessionTokens;

  const weeklyTokens: number | null =
    rawWeeklyTokens === null || rawWeeklyTokens === undefined
      ? DEFAULT_LIMITS.weeklyTokens
      : Number.isInteger(rawWeeklyTokens) && (rawWeeklyTokens as number) > 0
        ? (rawWeeklyTokens as number)
        : DEFAULT_LIMITS.weeklyTokens;

  // Window values must be positive integers
  const sessionWindowHours: number =
    Number.isInteger(rawSessionWindowHours) && (rawSessionWindowHours as number) >= 1
      ? (rawSessionWindowHours as number)
      : DEFAULT_LIMITS.sessionWindowHours;

  const weeklyWindowDays: number =
    Number.isInteger(rawWeeklyWindowDays) && (rawWeeklyWindowDays as number) >= 1
      ? (rawWeeklyWindowDays as number)
      : DEFAULT_LIMITS.weeklyWindowDays;

  return { sessionTokens, weeklyTokens, sessionWindowHours, weeklyWindowDays };
}
