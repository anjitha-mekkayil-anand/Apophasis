#!/usr/bin/env node

/**
 * Apophasis CLI entry point.
 *
 * Subcommands:
 *   screen             — screen a candidate against criteria
 *   history            — list or read past screens
 *   criteria validate  — validate the criteria file
 *
 * All subcommands are stubs in §1. They exit with a clear "not implemented"
 * message that cannot be mistaken for a real result.
 */

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

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    usage();
  }

  const command = args[0];

  switch (command) {
    case 'screen':
      notImplemented('screen');
      break;
    case 'history':
      notImplemented('history');
      break;
    case 'criteria':
      if (args[1] === 'validate') {
        notImplemented('criteria validate');
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
