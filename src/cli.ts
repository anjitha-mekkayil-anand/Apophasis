#!/usr/bin/env node

/**
 * Apophasis CLI entry point.
 *
 * Subcommands:
 *   screen             — screen a candidate against criteria
 *   history            — list or read past screens
 *   criteria validate  — validate the criteria file
 */

import { loadCriteria, CriteriaValidationError } from './criteria.js';
import { CandidateAcceptError } from './errors.js';
import { requireApiKey, MissingApiKeyError } from './provider.js';
import { listScreens, readScreen } from './history.js';
import { runPipeline } from './pipeline.js';
import { createAnthropicClient } from './anthropic-client.js';
import { ParseError } from './parser.js';

function usage(): never {
  console.error(
    `Usage: apophasis <command>\n\n` +
    `Commands:\n` +
    `  screen              Screen a candidate against criteria\n` +
    `  history             List or read past screens\n` +
    `  criteria validate   Validate the criteria file\n`
  );
  process.exit(1);
}

/**
 * criteria validate — the first subcommand that does real work.
 *
 * Loads and validates criteria.yaml, prints the result to stdout on success.
 * Validation errors go to stderr and exit non-zero.
 * Advisories go to stderr and exit zero (they are not failures).
 */
async function criteriaValidate(filePath: string): Promise<void> {
  try {
    const result = await loadCriteria(filePath);

    // Print advisories to stderr — they are non-blocking (AC-1.5)
    for (const advisory of result.advisories) {
      console.error(`[ADVISORY] ${advisory.criterionId}: ${advisory.message}`);
    }

    // Success output to stdout
    console.log(`Criteria file is valid.`);
    console.log(`  Criteria count: ${result.criteria.length}`);
    console.log(`  Version (SHA-256): ${result.version}`);
    console.log(`  Disqualifying: ${result.criteria.filter(c => c.kind === 'disqualifying').length}`);
    console.log(`  Preference: ${result.criteria.filter(c => c.kind === 'preference').length}`);
  } catch (err: unknown) {
    if (err instanceof CriteriaValidationError) {
      console.error(`Validation failed: ${err.message}`);
      process.exit(1);
    }
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.error(`File not found: ${filePath}`);
      process.exit(1);
    }
    throw err;
  }
}

/**
 * screen — runs the full screening pipeline.
 *
 * Fail-clean: the API key is checked BEFORE any work.
 * On success: rendered screen on stdout, record path stated, exit 0.
 * On error: reason on stderr, exit non-zero. Nothing resembling a verdict.
 */
async function screenCommand(filePath: string, label: string): Promise<void> {
  try {
    // Fail clean BEFORE any work — NF-3
    const apiKey = requireApiKey();
    const client = createAnthropicClient(apiKey);

    const result = await runPipeline(client, filePath, label);

    // Success: rendered screen on stdout
    console.log(result.renderedOutput);
    console.log(`\nRecord saved: ${result.filePath}`);
  } catch (err: unknown) {
    if (err instanceof MissingApiKeyError) {
      console.error(err.message);
      process.exit(1);
    }
    if (err instanceof CandidateAcceptError) {
      console.error(err.message);
      process.exit(1);
    }
    if (err instanceof CriteriaValidationError) {
      console.error(`Criteria validation failed: ${err.message}`);
      process.exit(1);
    }
    if (err instanceof ParseError) {
      console.error(`Model response could not be parsed: ${err.message}`);
      process.exit(1);
    }
    if (err instanceof Error) {
      console.error(`Screen failed: ${err.message}`);
      process.exit(1);
    }
    throw err;
  }
}

/**
 * history — list past screens or read a specific one by id.
 *
 * Lists from the index for speed. The markdown files are authoritative —
 * if the index were corrupted, rebuildIndex recreates it from files.
 * The history command trusts the index for listing (it is a convenience)
 * and reads from the file for detail (it is the record).
 */
async function historyCommand(screenId?: string): Promise<void> {
  try {
    if (screenId) {
      // Read a specific screen
      const { raw } = await readScreen(screenId);
      console.log(raw);
    } else {
      // List all screens from index
      const screens = await listScreens();
      if (screens.length === 0) {
        console.log('No screens recorded yet.');
        return;
      }
      console.log(`Screens (${screens.length}):\n`);
      for (const entry of screens) {
        console.log(`  ${entry.id}  ${entry.verdict}  ${entry.label}  ${entry.screenedAt.slice(0, 10)}`);
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.error(`Screen not found: ${screenId ?? '(none)'}`);
      process.exit(1);
    }
    if (err instanceof Error) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    usage();
  }

  const command = args[0];

  switch (command) {
    case 'screen': {
      const filePath = args[1];
      const label = args[2];
      if (!filePath || !label) {
        console.error('Usage: apophasis screen <file> <label>');
        console.error('  <file>   Path to a .txt or .md candidate file');
        console.error('  <label>  A short label for this candidate (e.g. "senior-engineer-acme")');
        process.exit(1);
      }
      await screenCommand(filePath, label);
      break;
    }
    case 'history': {
      const screenId = args[1];
      await historyCommand(screenId);
      break;
    }
    case 'criteria':
      if (args[1] === 'validate') {
        const filePath = args[2] ?? 'criteria.yaml';
        await criteriaValidate(filePath);
      } else {
        console.error(`Unknown criteria subcommand: ${args[1] ?? '(none)'}`);
        usage();
      }
      break;
    default:
      console.error(`Unknown command: ${command}`);
      usage();
  }
}

main();
