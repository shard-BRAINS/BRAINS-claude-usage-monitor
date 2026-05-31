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
