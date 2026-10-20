import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../src/config.js';

describe('loadConfig', () => {
  it('rejects a missing token', () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    expect(() => loadConfig({})).toThrow(/GH_TOKEN is not set/);
  });

  it('rejects a blank token', () => {
    expect(() => loadConfig({ GH_TOKEN: '   ' })).toThrow(/GH_TOKEN is not set/);
  });

  it('trims and returns a valid token', () => {
    expect(loadConfig({ GH_TOKEN: '  github_pat_example  ' })).toEqual({
      ghToken: 'github_pat_example',
    });
  });

  it('rejects an unexpanded environment placeholder', () => {
    expect(() => loadConfig({ GH_TOKEN: '{env:GH_TOKEN}' })).toThrow(
      /was not expanded/,
    );
    expect(() => loadConfig({ GH_TOKEN: '${GH_TOKEN}' })).toThrow(
      /was not expanded/,
    );
  });
});
