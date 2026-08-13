/**
 * Criteria model — §2
 *
 * Parses criteria.yaml, validates it, computes the version hash.
 * The version is SHA-256 of the file's raw bytes (not the parsed object),
 * so whitespace or comment changes produce a new version.
 */

import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parse as parseYaml } from 'yaml';
import type { Criterion, CriteriaFile, Kind } from './types.js';

const VALID_KINDS: readonly Kind[] = ['disqualifying', 'preference'];

/**
 * Phrases that suggest an exception clause in a criterion statement.
 * Used for the non-blocking advisory in `criteria validate` (AC-1.5).
 * Case-insensitive match against the statement text.
 */
const EXCEPTION_CLAUSE_PATTERNS: readonly string[] = [
  'unless',
  'except where',
  'except when',
  'except if',
  'other than',
];

export interface CriteriaLoadResult {
  criteria: Criterion[];
  version: string;          // hex-encoded SHA-256 of the file's raw bytes
  advisories: Advisory[];   // non-blocking warnings (exit 0)
}

export interface Advisory {
  criterionId: string;
  message: string;
}

export class CriteriaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CriteriaValidationError';
  }
}

/**
 * Load criteria from a file path.
 *
 * Reads the file once as a Buffer, hashes the raw bytes, then parses the
 * same bytes as YAML. This guarantees the hash matches what's on disk.
 *
 * @throws CriteriaValidationError on any validation failure
 */
export async function loadCriteria(filePath: string): Promise<CriteriaLoadResult> {
  const rawBytes = await readFile(filePath);
  return loadCriteriaFromBuffer(rawBytes);
}

/**
 * Load and validate criteria from a raw buffer.
 * Exported for testing without filesystem access.
 *
 * @throws CriteriaValidationError on any validation failure
 */
export function loadCriteriaFromBuffer(rawBytes: Buffer): CriteriaLoadResult {
  // Hash the raw bytes — AC-3.6
  const version = createHash('sha256').update(rawBytes).digest('hex');

  // Parse YAML
  const content = rawBytes.toString('utf-8');
  const parsed = parseYaml(content) as CriteriaFile;

  if (!parsed || !Array.isArray(parsed.criteria)) {
    throw new CriteriaValidationError(
      'Invalid criteria file: expected a top-level "criteria" array.'
    );
  }

  const criteria: Criterion[] = [];
  const advisories: Advisory[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < parsed.criteria.length; i++) {
    const raw = parsed.criteria[i];

    // Validate required fields exist
    if (!raw.id || typeof raw.id !== 'string') {
      throw new CriteriaValidationError(
        `Criterion at index ${i}: missing or invalid "id".`
      );
    }

    // Check for duplicate ids
    if (seenIds.has(raw.id)) {
      throw new CriteriaValidationError(
        `Duplicate criterion id: "${raw.id}" (index ${i}). Each criterion must have a unique id.`
      );
    }
    seenIds.add(raw.id);

    // Validate kind — AC-1.1, AC-1.3
    if (!VALID_KINDS.includes(raw.kind as Kind)) {
      throw new CriteriaValidationError(
        `Criterion "${raw.id}": invalid kind "${raw.kind}". Must be one of: ${VALID_KINDS.join(', ')}.`
      );
    }

    // Validate rationale — AC-1.2
    if (!raw.rationale || typeof raw.rationale !== 'string' || raw.rationale.trim() === '') {
      throw new CriteriaValidationError(
        `Criterion "${raw.id}": missing or empty "rationale". A rule with no stated reason cannot be re-examined later.`
      );
    }

    // Validate statement exists
    if (!raw.statement || typeof raw.statement !== 'string' || raw.statement.trim() === '') {
      throw new CriteriaValidationError(
        `Criterion "${raw.id}": missing or empty "statement".`
      );
    }

    // Build the validated criterion
    const criterion: Criterion = {
      id: raw.id,
      kind: raw.kind as Kind,
      statement: raw.statement,
      rationale: raw.rationale,
      addedOn: raw.addedOn ?? '',
      ...(raw.source !== undefined && { source: raw.source }),
      ...(raw.hasException !== undefined && { hasException: Boolean(raw.hasException) }),
    };

    criteria.push(criterion);

    // Advisory check — AC-1.5: non-blocking, does not fail validation
    if (!criterion.hasException) {
      const statementLower = criterion.statement.toLowerCase();
      for (const pattern of EXCEPTION_CLAUSE_PATTERNS) {
        if (statementLower.includes(pattern)) {
          advisories.push({
            criterionId: criterion.id,
            message:
              `Statement contains "${pattern}" but hasException is not set. ` +
              `If this is an exception clause, set hasException: true so that ` +
              `exceptionEvidence will be required when the criterion holds.`,
          });
          break; // One advisory per criterion is enough
        }
      }
    }
  }

  return { criteria, version, advisories };
}
