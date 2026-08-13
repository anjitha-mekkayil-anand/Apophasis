/**
 * Verification — §6
 *
 * Verifies evidence spans by substring match against the candidate text.
 * Pure function: input findings + candidate text → output findings.
 * No file writes, no model calls, no I/O.
 *
 * Whitespace normalisation for comparison:
 *   - Runs of whitespace (including \r\n, \n, \t, spaces) are collapsed
 *     to a single space, on BOTH sides, for comparison only.
 *   - The stored text and evidence strings are never modified.
 *   - No case folding, no punctuation stripping, no fuzzy matching.
 *
 * The guarantee being defended: "the model did not invent this sentence."
 * Whitespace normalisation preserves that guarantee completely;
 * paraphrase tolerance would destroy it.
 */

import type { Finding, Criterion } from './types.js';

/**
 * Normalise whitespace for comparison purposes only.
 * Collapses all runs of whitespace (including newlines) to a single space, trims.
 */
export function normaliseForComparison(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Check whether evidence is a substring of the candidate text,
 * using whitespace-normalised comparison.
 */
function containsEvidence(candidateText: string, evidence: string): boolean {
  const normCandidate = normaliseForComparison(candidateText);
  const normEvidence = normaliseForComparison(evidence);
  return normCandidate.includes(normEvidence);
}

/**
 * Verify all findings against the candidate text.
 *
 * Returns a new array of findings with demotions applied where needed.
 * The input array is not mutated.
 *
 * Checks performed:
 *   1. status === 'fails' → evidence must be a substring of candidateText (AC-3.4)
 *      On failure: demote to indeterminate (AC-3.5)
 *
 *   2. status === 'holds' on a hasException criterion:
 *      a. holdsReason missing → demote to indeterminate (AC-3.8)
 *      b. holdsReason === 'not-violated' → pass untouched, no evidence needed
 *      c. holdsReason === 'exception-applied':
 *         - exceptionEvidence missing/empty → demote (AC-3.7)
 *         - exceptionEvidence fails substring check → demote (AC-3.7)
 *         - exceptionEvidence passes → pass
 *
 * @param findings - parsed findings from the model (one per criterion)
 * @param candidateText - the candidate text string (from getCandidateText)
 * @param criteria - the criteria array (to check hasException flags)
 * @returns new Finding[] with demotions applied
 */
export function verifyFindings(
  findings: Finding[],
  candidateText: string,
  criteria: Criterion[],
): Finding[] {
  return findings.map((finding) => {
    const criterion = criteria[finding.criterionIndex];

    // 6.1 / 6.2 — verify evidence for 'fails' findings
    if (finding.status === 'fails') {
      if (!finding.evidence || finding.evidence.trim() === '') {
        // Should not happen (parser rejects fails without evidence),
        // but defend against it anyway.
        return demote(finding, 'fails', 'Evidence field is missing or empty.');
      }
      if (!containsEvidence(candidateText, finding.evidence)) {
        return demote(
          finding,
          'fails',
          'Evidence not found in candidate text (even after whitespace normalisation). ' +
          'The quoted span does not appear in the source.',
        );
      }
    }

    // 6.3 — verify hasException holds findings (AC-3.7, AC-3.8)
    if (finding.status === 'holds' && criterion?.hasException) {
      // AC-3.8: holdsReason must be present
      if (!finding.holdsReason) {
        return demote(
          finding,
          'holds',
          'Criterion has hasException but the model did not supply holdsReason. ' +
          'Cannot determine whether the exception was applied or the rule was not violated.',
        );
      }

      // holdsReason === 'not-violated': pass untouched, no evidence needed
      if (finding.holdsReason === 'not-violated') {
        return finding;
      }

      // holdsReason === 'exception-applied': exceptionEvidence required and verified
      if (finding.holdsReason === 'exception-applied') {
        if (!finding.exceptionEvidence || finding.exceptionEvidence.trim() === '') {
          return demote(
            finding,
            'holds',
            'holdsReason is "exception-applied" but exceptionEvidence is missing or empty. ' +
            'A rescue-by-exception requires proof.',
          );
        }
        if (!containsEvidence(candidateText, finding.exceptionEvidence)) {
          return demote(
            finding,
            'holds',
            'exceptionEvidence not found in candidate text (even after whitespace normalisation). ' +
            'The quoted exception span does not appear in the source.',
          );
        }
      }
    }

    // All other findings pass through unchanged
    return finding;
  });
}

/**
 * Demote a finding to indeterminate, preserving the original evidence for diagnostics.
 */
function demote(finding: Finding, demotedFrom: 'fails' | 'holds', demotionReason: string): Finding {
  return {
    ...finding,
    status: 'indeterminate',
    demotedFrom,
    demotionReason,
    // Original evidence is kept for diagnostics — do not clear it.
  };
}
