import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NudgeMode = 'off' | 'once-per-session' | 'on-warning' | 'on-critical' | 'on-each';

export interface NudgeConfig {
  mode: NudgeMode;
  minIntervalMinutes: number;
  suppressedSessions: string[];
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_NUDGE_CONFIG: NudgeConfig = {
  mode: 'once-per-session',
  minIntervalMinutes: 30,
  suppressedSessions: [],
};

const VALID_MODES: NudgeMode[] = ['off', 'once-per-session', 'on-warning', 'on-critical', 'on-each'];

// ---------------------------------------------------------------------------
// Reader
// ---------------------------------------------------------------------------

export function getNudgeConfig(): NudgeConfig {
  const cfg = vscode.workspace.getConfiguration('claudeUsageMonitor');

  const rawMode = cfg.get<unknown>('nudge.mode');
  const mode: NudgeMode =
    typeof rawMode === 'string' && (VALID_MODES as string[]).includes(rawMode)
      ? (rawMode as NudgeMode)
      : DEFAULT_NUDGE_CONFIG.mode;

  const rawInterval = cfg.get<unknown>('nudge.minIntervalMinutes');
  const minIntervalMinutes: number =
    Number.isInteger(rawInterval) && (rawInterval as number) >= 0
      ? (rawInterval as number)
      : DEFAULT_NUDGE_CONFIG.minIntervalMinutes;

  const rawSuppressed = cfg.get<unknown>('nudge.suppressedSessions');
  const suppressedSessions: string[] =
    Array.isArray(rawSuppressed) && rawSuppressed.every((x) => typeof x === 'string')
      ? (rawSuppressed as string[])
      : DEFAULT_NUDGE_CONFIG.suppressedSessions;

  return { mode, minIntervalMinutes, suppressedSessions };
}

// ---------------------------------------------------------------------------
// Snooze helper — persists globally so suppression follows the user across workspaces
// ---------------------------------------------------------------------------

export async function addSuppressedSession(sessionId: string): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('claudeUsageMonitor');
  const rawSuppressed = cfg.get<unknown>('nudge.suppressedSessions');
  const current: string[] =
    Array.isArray(rawSuppressed) && rawSuppressed.every((x) => typeof x === 'string')
      ? (rawSuppressed as string[])
      : [];
  if (!current.includes(sessionId)) {
    await cfg.update(
      'nudge.suppressedSessions',
      [...current, sessionId],
      vscode.ConfigurationTarget.Global,
    );
  }
}
