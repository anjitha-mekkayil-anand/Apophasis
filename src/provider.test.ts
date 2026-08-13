import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { requireApiKey, MissingApiKeyError, API_KEY_ENV_VAR, getModelId, DEFAULT_MODEL, MODEL_ENV_VAR } from './provider.js';

describe('provider — §4', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env[API_KEY_ENV_VAR];
    delete process.env[MODEL_ENV_VAR];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('4.2 — fail clean with no key (NF-3)', () => {
    it('throws MissingApiKeyError when API key is not set', () => {
      expect(() => requireApiKey()).toThrow(MissingApiKeyError);
    });

    it('throws MissingApiKeyError when API key is empty string', () => {
      process.env[API_KEY_ENV_VAR] = '';
      expect(() => requireApiKey()).toThrow(MissingApiKeyError);
    });

    it('throws MissingApiKeyError when API key is whitespace only', () => {
      process.env[API_KEY_ENV_VAR] = '   ';
      expect(() => requireApiKey()).toThrow(MissingApiKeyError);
    });

    it('error message names the environment variable', () => {
      try {
        requireApiKey();
        expect.fail('should have thrown');
      } catch (err) {
        expect((err as Error).message).toContain(API_KEY_ENV_VAR);
      }
    });

    it('error message references .env.example', () => {
      try {
        requireApiKey();
        expect.fail('should have thrown');
      } catch (err) {
        expect((err as Error).message).toContain('.env.example');
      }
    });

    // NOTE: A previous version of this test asserted the message did not contain
    // words like 'demo', 'mock', 'stub'. That was removed because a substring
    // check cannot distinguish affirming a concept from denying it — the correct
    // sentence "there is no demo mode" would fail. "Suggests no way to proceed
    // without a key" is a semantic property that is not substring-testable.
    // What IS testable: the error is typed, it names the variable, it points at
    // .env.example, and the CLI exits non-zero. Those are asserted above and
    // in the CLI integration tests.

    it('returns the key when it is present and non-empty', () => {
      process.env[API_KEY_ENV_VAR] = 'sk-ant-test-key-123';
      const key = requireApiKey();
      expect(key).toBe('sk-ant-test-key-123');
    });
  });

  describe('model configuration', () => {
    it('returns the default model when env var is not set', () => {
      expect(getModelId()).toBe(DEFAULT_MODEL);
    });

    it('returns the env var value when set', () => {
      process.env[MODEL_ENV_VAR] = 'claude-3-haiku-20240307';
      expect(getModelId()).toBe('claude-3-haiku-20240307');
    });
  });
});
