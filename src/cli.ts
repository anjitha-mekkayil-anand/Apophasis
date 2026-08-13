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
import { acceptCandidate } from './candidate.js';

const NOT_IMPLEMENTED_PREFIX = '[NOT IMPLEMENTED]';

function notImplemented(command: string): never {
  console.error(
    `${NOT_IMPLEMENTED_PREFIX} The "${command}" command is not yet implemented. ` +
    `This is a skeleton — no screening, history, or validation logic exists yet.`
  );
  process.exit(1);
}

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
 * screen — accepts a candidate file and stores it, then stops.
 *
 * The rest of the pipeline (model call, verification, verdict, render, record)
 * is not yet implemented. The output clearly states this so nothing it prints
 * can be mistaken for a verdict.
 */
async function screenAccept(filePath: string, label: string): Promise<void> {
  try {
    const result = await acceptCandidate(filePath, label);
    console.log(`Candidate accepted.`);
    console.log(`  ID: ${result.id}`);
    console.log(`  Stored: ${result.candidateFile}`);
    console.log(`  Label: ${result.metadata.label}`);
    console.log(`  Ingested at: ${result.metadata.ingestedAt}`);
    console.log(`  Byte length: ${result.metadata.byteLength}`);
    console.error(
      `\n${NOT_IMPLEMENTED_PREFIX} Screening pipeline is not yet implemented. ` +
      `The candidate has been stored but no criteria evaluation, verification, ` +
      `verdict, or record has been produced. This is not a result.`
    );
    process.exit(1);
  } catch (err: unknown) {
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
      await screenAccept(filePath, label);
      break;
    }
    case 'history':
      notImplemented('history');
      break;
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
