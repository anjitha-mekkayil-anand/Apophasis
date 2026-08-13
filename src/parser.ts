/**
 * Response parser — §5.4
 *
 * Parses the model's raw text response into Finding[].
 * Model output is UNTRUSTED INPUT. Every failure mode is handled explicitly:
 *
 * - Unparseable JSON → throws ParseError
 * - Not an array → throws ParseError
 * - Wrong array length (not exactly one per criterion) → throws ParseError
 * - Missing or out-of-range index → throws ParseError
 * - Duplicate index → throws ParseError
 * - Invalid status (not fails/holds/indeterminate) → throws ParseError
 * - 'fails' without evidence → throws ParseError
 * - Extra fields beyond the schema → silently ignored (model verbosity)
 *
 * CRITICAL: silently dropping any finding would produce a short array,
 * and §7 assumes one finding per criterion. A quietly short array would
 * produce a clean verdict from an incomplete screen. Every deviation
 * from the expected shape is a hard error.
 */

import type { Finding, Status } from './types.js';

const VALID_STATUSES: readonly Status[] = ['fails', 'holds', 'indeterminate'];

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}

interface RawFinding {
  index?: unknown;
  status?: unknown;
  evidence?: unknown;
  exceptionEvidence?: unknown;
}

/**
 * Parse model response text into an array of findings.
 *
 * @param responseText - raw text from the model (expected: JSON array)
 * @param criteriaCount - the number of criteria that were sent
 * @returns Finding[] with exactly one entry per criterion, ordered by index
 * @throws ParseError on any malformed response
 */
export function parseModelResponse(responseText: string, criteriaCount: number): Finding[] {
  // Strip markdown code fences if the model wraps its response
  let cleaned = responseText.trim();
  if (cleaned.startsWith('```')) {
    // Remove opening fence (possibly ```json)
    cleaned = cleaned.replace(/^```[a-z]*\n?/, '');
    // Remove closing fence
    cleaned = cleaned.replace(/\n?```\s*$/, '');
    cleaned = cleaned.trim();
  }

  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new ParseError(
      `Model response is not valid JSON. ` +
      `Expected a JSON array of ${criteriaCount} findings. ` +
      `Got: ${cleaned.slice(0, 200)}${cleaned.length > 200 ? '...' : ''}`
    );
  }

  // Must be an array
  if (!Array.isArray(parsed)) {
    throw new ParseError(
      `Model response is not an array. Expected an array of ${criteriaCount} findings, ` +
      `got ${typeof parsed}.`
    );
  }

  // Must have exactly the right count
  if (parsed.length !== criteriaCount) {
    throw new ParseError(
      `Model returned ${parsed.length} findings but ${criteriaCount} were expected ` +
      `(one per criterion). Every criterion must have exactly one finding.`
    );
  }

  const findings: Finding[] = [];
  const seenIndexes = new Set<number>();

  for (let i = 0; i < parsed.length; i++) {
    const raw = parsed[i] as RawFinding;

    if (!raw || typeof raw !== 'object') {
      throw new ParseError(
        `Finding at position ${i} is not an object.`
      );
    }

    // Validate index
    const index = raw.index;
    if (typeof index !== 'number' || !Number.isInteger(index)) {
      throw new ParseError(
        `Finding at position ${i}: "index" must be an integer, got ${JSON.stringify(index)}.`
      );
    }
    if (index < 0 || index >= criteriaCount) {
      throw new ParseError(
        `Finding at position ${i}: index ${index} is out of range [0, ${criteriaCount - 1}].`
      );
    }
    if (seenIndexes.has(index)) {
      throw new ParseError(
        `Finding at position ${i}: duplicate index ${index}. Each criterion may appear only once.`
      );
    }
    seenIndexes.add(index);

    // Validate status
    const status = raw.status;
    if (typeof status !== 'string' || !VALID_STATUSES.includes(status as Status)) {
      throw new ParseError(
        `Finding at position ${i} (index ${index}): invalid status "${String(status)}". ` +
        `Must be one of: ${VALID_STATUSES.join(', ')}.`
      );
    }

    // Validate evidence requirement
    if (status === 'fails') {
      if (!raw.evidence || typeof raw.evidence !== 'string' || raw.evidence.trim() === '') {
        throw new ParseError(
          `Finding at position ${i} (index ${index}): status is "fails" but ` +
          `"evidence" is missing or empty. A failing finding must quote the ` +
          `verbatim span from the candidate that shows the violation.`
        );
      }
    }

    // Build the finding
    const finding: Finding = {
      criterionIndex: index,
      status: status as Status,
    };

    if (status === 'fails' && typeof raw.evidence === 'string') {
      finding.evidence = raw.evidence;
    }

    if (status === 'holds' && typeof raw.exceptionEvidence === 'string' && raw.exceptionEvidence.trim() !== '') {
      finding.exceptionEvidence = raw.exceptionEvidence;
    }

    findings.push(finding);
  }

  // Verify all indexes are covered (no gaps)
  for (let i = 0; i < criteriaCount; i++) {
    if (!seenIndexes.has(i)) {
      throw new ParseError(
        `Criterion index ${i} has no finding in the model response. ` +
        `Every criterion must be evaluated.`
      );
    }
  }

  // Sort by criterionIndex so the caller gets them in criterion order
  findings.sort((a, b) => a.criterionIndex - b.criterionIndex);

  return findings;
}
