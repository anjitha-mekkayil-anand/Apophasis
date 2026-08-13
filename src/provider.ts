/**
 * Model provider — §4
 *
 * Defines the interface for model interaction and provides the API key check.
 * The actual model call arrives in §5. This section builds the seam only.
 *
 * The Anthropic SDK is NOT installed in §4 because nothing here makes a call.
 * The dependency belongs in §5 when the call is first made. Installing it now
 * would violate the rule: "no section adds a dependency it does not use in
 * that section."
 */

/**
 * The model client interface. One method: take a prompt, return raw text.
 * §5 implements this against the Anthropic API.
 * §4 defines the shape only.
 */
export interface ModelClient {
  /**
   * Send a prompt to the model and return the raw text response.
   * The caller (§5) decides what goes in the prompt.
   * The implementor decides how to send it.
   */
  complete(prompt: string): Promise<string>;
}

/**
 * Environment variable name for the API key.
 * Named once, used everywhere. Not hardcoded in multiple places.
 */
export const API_KEY_ENV_VAR = 'ANTHROPIC_API_KEY';

/**
 * Default model identifier. Configurable via ANTHROPIC_MODEL env var.
 * Documented here so §5 can read it without hardcoding a second copy.
 */
export const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
export const MODEL_ENV_VAR = 'ANTHROPIC_MODEL';

/**
 * Read the configured model identifier.
 */
export function getModelId(): string {
  return process.env[MODEL_ENV_VAR] ?? DEFAULT_MODEL;
}

/**
 * Error thrown when the API key is missing.
 * Typed so tests can assert on the class, not just the message.
 */
export class MissingApiKeyError extends Error {
  constructor() {
    super(
      `No API key configured.\n\n` +
      `Set the ${API_KEY_ENV_VAR} environment variable before running this command.\n` +
      `See .env.example for the expected format.\n\n` +
      `There is no fallback or offline operation for commands that require a ` +
      `model call. The key is the only way to proceed.`
    );
    this.name = 'MissingApiKeyError';
  }
}

/**
 * Require the API key to be present. Call this BEFORE any work is attempted
 * (before candidate is written, before any partial state exists).
 *
 * @throws MissingApiKeyError if the key is absent or empty
 * @returns the API key string (non-empty)
 */
export function requireApiKey(): string {
  const key = process.env[API_KEY_ENV_VAR];
  if (!key || key.trim() === '') {
    throw new MissingApiKeyError();
  }
  return key;
}
