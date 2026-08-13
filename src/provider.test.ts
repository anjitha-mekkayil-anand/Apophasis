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

    it('error message does not suggest a way to proceed without a key', () => {
      try {
        requireApiKey();
        expect.fail('should have thrown');
      } catch (err) {
        const msg = (err as Error).message.toLowerCase();
        // Must not suggest demo mode, offline mode, or any workaround
        expect(msg).not.toContain('demo');
        expect(msg).not.toContain('skip');
        expect(msg).not.toContain('continue without');
        expect(msg).not.toContain('mock');
        expect(msg).not.toContain('stub');
      }
    });

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
