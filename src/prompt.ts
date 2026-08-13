/**
 * Screen prompt — §5
 *
 * Builds the prompt sent to the model. The model is asked one narrow
 * question per criterion: does the candidate violate this rule?
 *
 * What it is asked:
 *   - For each criterion: fails / holds / indeterminate
 *   - For 'fails': the verbatim evidence span from the candidate
 *   - For 'holds' on a hasException criterion: the verbatim exceptionEvidence span
 *
 * What it is NOT asked:
 *   - Whether to refuse (AC-5.7)
 *   - Which criterion matters most (AC-5.4 is code, not model)
 *   - How good the candidate is (AC-5.6)
 *   - Anything requiring a number (AC-5.6)
 *
 * The prompt never contains the tokens REFUSED or NO_DISQUALIFIER_FOUND (AC-5.7).
 */

import type { Criterion } from './types.js';

/**
 * Build the screening prompt from candidate text and criteria.
 *
 * The output is a single string prompt. The response format is JSON:
 * an array of findings indexed by criterion position.
 */
export function buildScreenPrompt(
  candidateText: string,
  criteria: Criterion[],
): string {
  const criteriaBlock = criteria.map((c, i) => {
    let entry = `[${i}] (${c.kind}) ${c.statement}`;
    if (c.hasException) {
      entry += `\n    [hasException: true]`;
    }
    return entry;
  }).join('\n\n');

  return `You are evaluating a candidate text against a numbered list of criteria.

For each criterion, determine whether the candidate text violates it.

Return your answer as a JSON array with exactly ${criteria.length} objects, one per criterion in order. Each object must have:
- "index": the criterion number (integer, 0-based, matching the [N] label)
- "status": exactly one of "fails", "holds", or "indeterminate"
- "evidence": required when status is "fails" — the EXACT verbatim span from the candidate text that shows the violation. Copy it character-for-character; do not paraphrase or truncate.${criteria.some(c => c.hasException) ? `
- "holdsReason": required when status is "holds" AND the criterion is marked [hasException: true]. Must be exactly one of:
  - "not-violated": the candidate text simply does not trigger the rule at all. No further evidence needed.
  - "exception-applied": the rule WOULD have been violated, but the stated exception in the criterion is met by the candidate. You MUST also provide "exceptionEvidence" (see below).
- "exceptionEvidence": required when "holdsReason" is "exception-applied" — the EXACT verbatim span from the candidate text showing the exception is satisfied. Copy it character-for-character; do not paraphrase or truncate.` : ''}

Status meanings:
- "fails": the candidate text clearly violates this criterion, and you can quote the exact sentence(s) proving it.
- "holds": the candidate text does not violate this criterion.
- "indeterminate": the candidate text does not address this criterion, or there is not enough information to determine whether it is violated. This is the CORRECT answer when the text simply does not mention the topic — do not guess.

Rules:
- Return ONLY the JSON array. No explanation, no commentary, no markdown fencing.
- Every criterion must have exactly one entry. Do not skip any.
- Findings are identified by index number only. Do not restate the criterion text.
- Do not provide any overall assessment, rating, score, or recommendation.
- Do not state whether the candidate should be accepted or rejected.

---
CRITERIA:

${criteriaBlock}

---
CANDIDATE TEXT:

${candidateText}

---
Respond with the JSON array only.`;
}
