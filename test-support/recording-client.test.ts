import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rm, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { RecordingClient } from './recording-client.js';
import type { ModelClient } from '../src/provider.js';
import type { RecordedFixture } from './recording-client.js';

const FIXTURES_DIR = 'test-support/fixtures-test-temp';

/**
 * A fake model client for testing RecordingClient.
 * This is NOT a stub reachable from the CLI — it exists only in test-support/.
 */
class FakeModelClient implements ModelClient {
  private readonly responses: string[];
  private callIndex = 0;

  constructor(responses: string[]) {
    this.responses = responses;
  }

  async complete(_prompt: string): Promise<string> {
    const response = this.responses[this.callIndex] ?? 'default response';
    this.callIndex++;
    return response;
  }
}

describe('RecordingClient — §4.3 (NF-3)', () => {
  beforeEach(async () => {
    await rm(FIXTURES_DIR, { recursive: true, force: true });
  });

  afterEach(async () => {
    await rm(FIXTURES_DIR, { recursive: true, force: true });
  });

  it('writes a fixture file to disk', async () => {
    const fake = new FakeModelClient(['This is the model response.']);
    const recorder = new RecordingClient(fake, 'test-model', FIXTURES_DIR);

    await recorder.complete('Test prompt');

    const files = await readdir(FIXTURES_DIR);
    expect(files).toHaveLength(1);
    expect(files[0]).toBe('fixture-0000.json');
  });

  it('fixture contains the prompt and response', async () => {
    const fake = new FakeModelClient(['Response text']);
    const recorder = new RecordingClient(fake, 'test-model', FIXTURES_DIR);

    await recorder.complete('Prompt text');

    const raw = await readFile(join(FIXTURES_DIR, 'fixture-0000.json'), 'utf-8');
    const fixture = JSON.parse(raw) as RecordedFixture;
    expect(fixture.prompt).toBe('Prompt text');
    expect(fixture.response).toBe('Response text');
  });

  it('fixture carries the _offlineTestOnly label (NF-3)', async () => {
    const fake = new FakeModelClient(['response']);
    const recorder = new RecordingClient(fake, 'test-model', FIXTURES_DIR);

    await recorder.complete('prompt');

    const raw = await readFile(join(FIXTURES_DIR, 'fixture-0000.json'), 'utf-8');
    const fixture = JSON.parse(raw) as RecordedFixture;
    expect(fixture._offlineTestOnly).toBe(true);
  });

  it('fixture records the model identifier', async () => {
    const fake = new FakeModelClient(['response']);
    const recorder = new RecordingClient(fake, 'claude-sonnet-4-20250514', FIXTURES_DIR);

    await recorder.complete('prompt');

    const raw = await readFile(join(FIXTURES_DIR, 'fixture-0000.json'), 'utf-8');
    const fixture = JSON.parse(raw) as RecordedFixture;
    expect(fixture.model).toBe('claude-sonnet-4-20250514');
  });

  it('fixture has an ISO 8601 timestamp', async () => {
    const fake = new FakeModelClient(['response']);
    const recorder = new RecordingClient(fake, 'test-model', FIXTURES_DIR);

    await recorder.complete('prompt');

    const raw = await readFile(join(FIXTURES_DIR, 'fixture-0000.json'), 'utf-8');
    const fixture = JSON.parse(raw) as RecordedFixture;
    // ISO 8601 format check
    expect(new Date(fixture.timestamp).toISOString()).toBe(fixture.timestamp);
  });

  it('numbers fixture files sequentially across multiple calls', async () => {
    const fake = new FakeModelClient(['r1', 'r2', 'r3']);
    const recorder = new RecordingClient(fake, 'test-model', FIXTURES_DIR);

    await recorder.complete('p1');
    await recorder.complete('p2');
    await recorder.complete('p3');

    const files = (await readdir(FIXTURES_DIR)).sort();
    expect(files).toEqual([
      'fixture-0000.json',
      'fixture-0001.json',
      'fixture-0002.json',
    ]);
  });

  it('passes the prompt through to the inner client and returns the response', async () => {
    const fake = new FakeModelClient(['expected response']);
    const recorder = new RecordingClient(fake, 'test-model', FIXTURES_DIR);

    const result = await recorder.complete('test prompt');
    expect(result).toBe('expected response');
  });
});
