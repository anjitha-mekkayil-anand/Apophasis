/**
 * Corpus proof runner — §10
 *
 * Runs the full pipeline against both corpus candidates, captures fixtures,
 * and reports results. This is the first live model call in the project.
 *
 * Usage: npx tsx test-support/run-corpus.ts
 */

import { runPipeline } from '../src/pipeline.js';
import { createAnthropicClient } from '../src/anthropic-client.js';
import { requireApiKey } from '../src/provider.js';
import { RecordingClient } from './recording-client.js';
import { writeFile, mkdir, rm } from 'node:fs/promises';

async function main() {
  const apiKey = requireApiKey();
  const realClient = createAnthropicClient(apiKey);
  const recordingClient = new RecordingClient(realClient, 'claude-sonnet-4-6');

  // Clean up previous runs
  await rm('candidates', { recursive: true, force: true });
  await rm('screens', { recursive: true, force: true });
  await rm('test-support/fixtures', { recursive: true, force: true });

  console.log('=== CORPUS PROOF: Live Pipeline Run ===\n');

  // --- Run 1: The refusal candidate ---
  console.log('--- Run 1: Refusal candidate ---');
  try {
    const refusedResult = await runPipeline(
      recordingClient,
      'examples/senior-platform-reliability-role.txt',
      'senior-platform-reliability-finserv',
    );
    console.log(`Screen ID: ${refusedResult.screenId}`);
    console.log(`File: ${refusedResult.filePath}`);
    console.log(`Verdict: ${refusedResult.verdict.outcome}`);
    console.log(`Deciding index: ${refusedResult.verdict.decidingCriterionIndex}`);
    console.log(`Failed indexes: ${JSON.stringify(refusedResult.verdict.failedIndexes)}`);
    console.log(`Unevaluated: ${JSON.stringify(refusedResult.verdict.unevaluatedIndexes)}`);
    console.log(`Incomplete: ${refusedResult.verdict.incomplete}`);
    console.log(`\nDemotions:`);
    const demoted = refusedResult.findings.filter(f => f.demotedFrom);
    if (demoted.length === 0) console.log('  (none)');
    for (const d of demoted) {
      console.log(`  Index ${d.criterionIndex}: demoted from ${d.demotedFrom} — ${d.demotionReason}`);
    }
    console.log(`\n--- Rendered output ---\n${refusedResult.renderedOutput}\n`);
  } catch (err) {
    console.error('Run 1 FAILED:', err);
  }

  // --- Run 2: The clean candidate (hasException met) ---
  console.log('\n--- Run 2: Clean candidate (exception applies) ---');
  try {
    const cleanResult = await runPipeline(
      recordingClient,
      'examples/staff-architect-distributed-role.txt',
      'staff-architect-distributed',
    );
    console.log(`Screen ID: ${cleanResult.screenId}`);
    console.log(`File: ${cleanResult.filePath}`);
    console.log(`Verdict: ${cleanResult.verdict.outcome}`);
    console.log(`Failed indexes: ${JSON.stringify(cleanResult.verdict.failedIndexes)}`);
    console.log(`Unevaluated: ${JSON.stringify(cleanResult.verdict.unevaluatedIndexes)}`);
    console.log(`Incomplete: ${cleanResult.verdict.incomplete}`);
    console.log(`\nDemotions:`);
    const demoted = cleanResult.findings.filter(f => f.demotedFrom);
    if (demoted.length === 0) console.log('  (none)');
    for (const d of demoted) {
      console.log(`  Index ${d.criterionIndex}: demoted from ${d.demotedFrom} — ${d.demotionReason}`);
    }
    console.log(`\nholdsReason values:`);
    for (const f of cleanResult.findings) {
      if (f.holdsReason) {
        console.log(`  Index ${f.criterionIndex}: holdsReason=${f.holdsReason}${f.exceptionEvidence ? ` evidence="${f.exceptionEvidence.slice(0, 80)}..."` : ''}`);
      }
    }
    console.log(`\n--- Rendered output ---\n${cleanResult.renderedOutput}\n`);
  } catch (err) {
    console.error('Run 2 FAILED:', err);
  }

  console.log('\n=== Corpus proof complete. Fixtures written to test-support/fixtures/ ===');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
