/**
 * RecordingClient — test-only fixture capture.
 *
 * ⚠️  THIS MODULE EXISTS OUTSIDE src/ AND IS NOT PART OF THE PRODUCTION BUILD.
 * ⚠️  It is structurally unreachable from the CLI entry point (NF-6).
 * ⚠️  tsconfig.json compiles src/** only; this directory is excluded.
 *
 * The RecordingClient wraps a real ModelClient and captures every
 * request/response pair to disk as a JSON fixture. Fixtures are labelled
 * as offline test data only (NF-3).
 *
 * It exists so that §10 (corpus proof) can record live model responses
 * for use as deterministic regression fixtures in the offline test suite.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { ModelClient } from '../src/provider.js';

const FIXTURES_DIR = 'test-support/fixtures';

/**
 * A recorded request/response pair.
 * The _offlineTestOnly label is the NF-3 requirement:
 * fixtures are labelled as offline test data only.
 */
export interface RecordedFixture {
  /** This fixture is for the offline test suite only. It must not be used
   *  to simulate functionality at runtime. Presenting recorded output as
   *  live model output is a disqualification matter (NF-3, NF-6). */
  _offlineTestOnly: true;
  timestamp: string;
  prompt: string;
  response: string;
  model: string;
}

/**
 * Wraps a real ModelClient and records every call to disk.
 *
 * Usage (test suite only):
 *   const real = createRealClient(key);
 *   const recording = new RecordingClient(real, 'claude-sonnet-4-20250514');
 *   const response = await recording.complete(prompt);
 *   // fixture is now on disk
 */
export class RecordingClient implements ModelClient {
  private readonly inner: ModelClient;
  private readonly model: string;
  private callIndex = 0;

  constructor(inner: ModelClient, model: string) {
    this.inner = inner;
    this.model = model;
  }

  async complete(prompt: string): Promise<string> {
    const response = await this.inner.complete(prompt);

    const fixture: RecordedFixture = {
      _offlineTestOnly: true,
      timestamp: new Date().toISOString(),
      prompt,
      response,
      model: this.model,
    };

    await mkdir(FIXTURES_DIR, { recursive: true });
    const fileName = `fixture-${String(this.callIndex).padStart(4, '0')}.json`;
    await writeFile(
      join(FIXTURES_DIR, fileName),
      JSON.stringify(fixture, null, 2) + '\n',
      'utf-8',
    );

    this.callIndex++;
    return response;
  }
}
