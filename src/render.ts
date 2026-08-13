/**
 * Rendering — §8
 *
 * One renderer for both terminal output and the body of screens/<id>.md.
 * Pure function: data in, string out. No I/O, no model, no file writes.
 *
 * If colour is ever added, it is a wrapper around this — never a second
 * renderer. Two renderers drift, and the file would stop matching what
 * the user was shown.
 *
 * Evidence truncation boundary:
 *   - Rendered output MAY abbreviate evidence with "..." for long quotes (> 200 chars)
 *   - The full evidence lives in ScreenFrontmatter.findings — §9 persists it whole
 *   - The rendered markdown body (what a human reads) uses the abbreviated form
 */

import type { Finding, Criterion, Verdict } from './types.js';

/** Maximum evidence length before truncation in rendered output */
const MAX_EVIDENCE_DISPLAY = 200;

/**
 * Everything the renderer needs. §9 persists the same data structure,
 * so it reuses rather than reassembles.
 */
export interface RenderInput {
  verdict: Verdict;
  findings: Finding[];
  criteria: Criterion[];
  label: string;
  criteriaVersion: string;
  screenedAt: string;  // ISO 8601
}

/**
 * The not-a-recommendation statement. Fixed wording, never varied,
 * never shortened, never templated. Sits directly under the outcome.
 */
const NOT_A_RECOMMENDATION = `This is not a recommendation. Nothing here endorses this candidate; it
means none of your disqualifying criteria fired.`;

/**
 * Render a screen result to a human-readable string.
 * The same string is printed to the terminal and written to screens/<id>.md body.
 */
export function renderScreen(input: RenderInput): string {
  const { verdict, findings, criteria, label, criteriaVersion, screenedAt } = input;

  // Invariant checks — if these fail, something upstream broke
  if (verdict.outcome === 'REFUSED' && verdict.decidingCriterionIndex === undefined) {
    throw new Error('Render invariant violated: REFUSED verdict has no decidingCriterionIndex.');
  }
  if (verdict.outcome === 'NO_DISQUALIFIER_FOUND' && verdict.decidingCriterionIndex !== undefined) {
    throw new Error('Render invariant violated: NO_DISQUALIFIER_FOUND has a decidingCriterionIndex.');
  }
  for (const idx of verdict.failedIndexes) {
    const finding = findings.find(f => f.criterionIndex === idx);
    if (finding && finding.status === 'fails' && (!finding.evidence || finding.evidence.trim() === '')) {
      throw new Error(
        `Render invariant violated: fails finding at index ${idx} has no evidence. ` +
        `§6 should have demoted it.`
      );
    }
  }

  if (verdict.outcome === 'REFUSED') {
    return renderRefused(input);
  }
  return renderNoDisqualifierFound(input);
}

function renderRefused(input: RenderInput): string {
  const { verdict, findings, criteria, label, criteriaVersion, screenedAt } = input;
  const lines: string[] = [];

  lines.push(`REFUSED - ${label}`);
  lines.push('');

  // Deciding criterion
  const decidingIdx = verdict.decidingCriterionIndex!;
  const decidingCriterion = criteria[decidingIdx];
  const decidingFinding = findings.find(f => f.criterionIndex === decidingIdx)!;

  lines.push(`Deciding criterion: ${decidingCriterion.id}`);
  lines.push(`  "${decidingCriterion.statement}"`);
  lines.push(`  > "${truncateEvidence(decidingFinding.evidence!)}"`);

  // Additional failures (other than deciding)
  const otherFailed = verdict.failedIndexes.filter(i => i !== decidingIdx);
  if (otherFailed.length > 0) {
    lines.push('');
    lines.push('Also failed:');
    for (const idx of otherFailed) {
      const c = criteria[idx];
      const f = findings.find(fi => fi.criterionIndex === idx)!;
      lines.push(`  ${c.id}`);
      lines.push(`  > "${truncateEvidence(f.evidence!)}"`);
    }
  }

  // Unevaluated
  lines.push('');
  lines.push(renderUnevaluated(verdict, criteria));

  // Incompleteness marker
  if (verdict.incomplete) {
    lines.push('');
    lines.push(renderIncompleteMarker(verdict, criteria));
  }

  // Footer
  lines.push('');
  lines.push(`Criteria version: ${criteriaVersion.slice(0, 8)}...  |  Screened ${formatDate(screenedAt)}`);

  return lines.join('\n');
}

function renderNoDisqualifierFound(input: RenderInput): string {
  const { verdict, findings, criteria, label, criteriaVersion, screenedAt } = input;
  const lines: string[] = [];

  lines.push(`NO DISQUALIFIER FOUND - ${label}`);
  lines.push('');

  // Not-a-recommendation — sits directly under the outcome, in plain sentences
  lines.push(NOT_A_RECOMMENDATION);

  // Hollow screen warning: no disqualifying criteria were defined
  const hasDisqualifying = criteria.some(c => c.kind === 'disqualifying');
  if (!hasDisqualifying) {
    lines.push('');
    lines.push('No disqualifying criteria were defined. This screen could not have refused.');
  }

  // Residual risks — preference criteria that failed, in author order
  const residualRisks = findings.filter(
    f => f.status === 'fails' && criteria[f.criterionIndex].kind === 'preference'
  ).sort((a, b) => a.criterionIndex - b.criterionIndex);

  if (residualRisks.length > 0) {
    lines.push('');
    lines.push('Residual risks (preferences that failed, in your order):');
    for (const f of residualRisks) {
      const c = criteria[f.criterionIndex];
      lines.push(`  ${c.id}`);
      if (f.evidence) {
        lines.push(`  > "${truncateEvidence(f.evidence)}"`);
      }
    }
  }

  // Unevaluated
  lines.push('');
  lines.push(renderUnevaluated(verdict, criteria));

  // Incompleteness marker
  if (verdict.incomplete) {
    lines.push('');
    lines.push(renderIncompleteMarker(verdict, criteria));
  }

  // Footer
  lines.push('');
  lines.push(`Criteria version: ${criteriaVersion.slice(0, 8)}...  |  Screened ${formatDate(screenedAt)}`);

  return lines.join('\n');
}

function renderIncompleteMarker(verdict: Verdict, criteria: Criterion[]): string {
  const disqIndeterminate = verdict.unevaluatedIndexes.filter(
    i => criteria[i].kind === 'disqualifying'
  ).length;
  const noun = disqIndeterminate === 1 ? 'criterion' : 'criteria';
  return `! Incomplete: ${disqIndeterminate} disqualifying ${noun} could not be evaluated.`;
}

function renderUnevaluated(verdict: Verdict, criteria: Criterion[]): string {
  const total = criteria.length;
  const count = verdict.unevaluatedIndexes.length;

  if (count === 0) {
    return 'Could not be evaluated: none';
  }

  const header = `Could not be evaluated (${count} of ${total}):`;
  const items = verdict.unevaluatedIndexes.map(i => `  ${criteria[i].id}`);
  return [header, ...items].join('\n');
}

function truncateEvidence(evidence: string): string {
  if (evidence.length <= MAX_EVIDENCE_DISPLAY) {
    return evidence;
  }
  return evidence.slice(0, MAX_EVIDENCE_DISPLAY) + '...';
}

function formatDate(iso: string): string {
  // Display just the date portion for readability
  return iso.slice(0, 10);
}
