/**
 * Real Anthropic client — §10
 *
 * Implements the ModelClient interface against the Anthropic Messages API.
 * The interface is one method: complete(prompt) → string.
 * Everything the SDK needs (messages array, system prompt, max_tokens)
 * is hidden inside this implementation.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { ModelClient } from './provider.js';
import { getModelId } from './provider.js';

/**
 * Create a real Anthropic client that implements ModelClient.
 */
export function createAnthropicClient(apiKey: string): ModelClient {
  const anthropic = new Anthropic({ apiKey });
  const model = getModelId();

  return {
    async complete(prompt: string): Promise<string> {
      const response = await anthropic.messages.create({
        model,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      });

      // Extract text from the response
      const textBlock = response.content.find(block => block.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('Model response contained no text block.');
      }
      return textBlock.text;
    },
  };
}
