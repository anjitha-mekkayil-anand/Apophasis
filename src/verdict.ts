/**
 * Verdict assembly — §7
 *
 * Pure function: verified findings + criteria in, Verdict out.
 * No I/O, no model calls, no file writes.
 *
 * The model produces findings. This code produces the verdict.
 *
 * Key distinctions:
 *   - `unevaluatedIndexes`: EVERY indeterminate finding (disqualifying AND preference)
 *   - `incomplete`: true ONLY when a DISQUALIFYING criterion is indeterminate
 *   - These are not the same thing and must not be derived from each other.
 *     A preference that could not be evaluated does not make a verdict incomplete,
 *     because a preference could never have changed the outcome.
 *
 *   - `failedIndexes`: disqualifying criteria with status 'fails' (in criteria-file order)
 *   - `decidingCriterionIndex`: lowest index among failedIndexes (author-declared order, AC-5.4)
 *
 * A demoted finding (demotedFrom set) is treated as indeterminate, never as fails.
 * A demoted finding must never decide a refusal.
 */

import type { Finding, Criterion, Verdict } from './types.js';

/**
 * Assemble a verdict from verified findings and criteria.
 *
 * @param findings - verified findings (one per criterion, post-§6)
 * @param criteria - the criteria array (for kind lookup)
 * @returns Verdict
 */
export function assembleVerdict(findings: Finding[], criteria: Criterion[]): Verdict {
  const failedIndexes: number[] = [];
  const unevaluatedIndexes: number[] = [];
  let incomplete = false;

  for (const finding of findings) {
    const criterion = criteria[finding.criterionIndex];
    const kind = criterion.kind;

    if (finding.status === 'indeterminate') {
      unevaluatedIndexes.push(finding.criterionIndex);
      if (kind === 'disqualifying') {
        incomplete = true;
      }
    } else if (finding.status === 'fails' && kind === 'disqualifying') {
      failedIndexes.push(finding.criterionIndex);
    }
    // preference fails are NOT added to failedIndexes — they never affect the outcome (AC-1.3)
    // They are collected for §8 rendering via the findings array, not via the verdict.
  }

  // Sort in criteria-file order (index ascending) — guarantees AC-6.1 author order for rendering
  failedIndexes.sort((a, b) => a - b);
  unevaluatedIndexes.sort((a, b) => a - b);

  const outcome = failedIndexes.length > 0 ? 'REFUSED' : 'NO_DISQUALIFIER_FOUND';
  const decidingCriterionIndex = outcome === 'REFUSED' ? failedIndexes[0] : undefined;

  return {
    outcome,
    decidingCriterionIndex,
    failedIndexes,
    unevaluatedIndexes,
    incomplete,
    // NOTE: there is deliberately no score, rating, fit or recommended field.
    // AC-5.2 — this absence is the feature. Do not add one.
  };
}
