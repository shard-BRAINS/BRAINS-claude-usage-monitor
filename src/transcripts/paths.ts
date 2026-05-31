import * as os from 'os';
import * as path from 'path';

/**
 * Returns the default Claude Code projects directory.
 * Pure function — no I/O, safe to override in tests by passing a custom path to start().
 */
export function defaultProjectsDir(): string {
  return path.join(os.homedir(), '.claude', 'projects');
}
