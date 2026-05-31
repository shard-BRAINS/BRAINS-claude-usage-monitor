/**
 * Converts an absolute workspace path to the slug Claude Code uses as the
 * project directory name inside ~/.claude/projects/.
 *
 * Transformation:
 *   1. Trim any trailing slashes or backslashes.
 *   2. Replace every char in [/ \\ : _] with a dash.
 *
 * Case is preserved as-is — Claude Code keeps whatever case the path had.
 */
export function pathToProjectSlug(cwd: string): string {
  if (cwd === '') return '';
  const trimmed = cwd.replace(/[/\\]+$/, '');
  return trimmed.replace(/[/\\:_]/g, '-');
}
