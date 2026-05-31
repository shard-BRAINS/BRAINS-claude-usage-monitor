import { describe, test, expect } from 'vitest';
import { pathToProjectSlug } from './slug';

describe('pathToProjectSlug', () => {
  test('forward slash + colon + underscore all become dashes', () => {
    expect(pathToProjectSlug('c:/BRAINS_Build_Platform')).toBe('c--BRAINS-Build-Platform');
  });

  test('backslash same as forward slash', () => {
    expect(pathToProjectSlug('c:\\BRAINS_Build_Platform')).toBe('c--BRAINS-Build-Platform');
  });

  test('trailing slash is trimmed before replacement', () => {
    expect(pathToProjectSlug('/Users/foo/bar_baz/')).toBe('-Users-foo-bar-baz');
  });

  test('trailing backslash is trimmed, drive case preserved', () => {
    expect(pathToProjectSlug('C:\\Claude_Usage_Monitor\\')).toBe('C--Claude-Usage-Monitor');
  });

  test('empty string returns empty string', () => {
    expect(pathToProjectSlug('')).toBe('');
  });
});
