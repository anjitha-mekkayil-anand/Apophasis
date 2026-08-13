import { describe, it, expect } from 'vitest';
import { assembleVerdict } from './verdict.js';
import type { Finding, Criterion, Verdict } from './types.js';

/**
 * Test criteria set: indices 0-4
 * [0] disqualifying
 * [1] disqualifying
 * [2] preference
 * [3] disqualifying
 * [4] preference
 */
const CRITERIA: Criterion[] = [
  { id: 'disq-0', kind: 'disqualifying', statement: 'First disqualifying.', rationale: 'Test.', addedOn: '2026-08-01' },
  { id: 'disq-1', kind: 'disqualifying', statement: 'Second disqualifying.', rationale: 'Test.', addedOn: '2026-08-02' },
  { id: 'pref-2', kind: 'preference', statement: 'First preference.', rationale: 'Test.', addedOn: '2026-08-03' },
  { id: 'disq-3', kind: 'disqualifying', statement: 'Third disqualifying.', rationale: 'Test.', addedOn: '2026-08-04' },
  { id: 'pref-4', kind: 'preference', statement: 'Second preference.', rationale: 'Test.', addedOn: '2026-08-05' },
];

/** Forbidden keys that must never appear on a Verdict object (AC-5.2) */
const FORBIDDEN_KEYS = ['score', 'rating', 'fit', 'recommended', 'rank', 'total', 'weighted'];

describe('verdict assembly — §7', () => {
  describe('7.4 — AC-5.2: no forbidden keys on returned object', () => {
    it('verdict object has no score, rating, fit, recommended, rank, total, or weighted key', () => {
      const findings: Finding[] = CRITERIA.map((_, i) => ({
        criterionIndex: i,
        status: 'holds' as const,
      }));
      const verdict = assembleVerdict(findings, CRITERIA);
      const keys = Object.keys(verdict);
      for (const forbidden of FORBIDDEN_KEYS) {
        expect(keys).not.toContain(forbidden);
      }
    });
  });

  describe('Case 1: single disqualifying fails → REFUSED, that one deciding', () => {
    it('returns REFUSED with the failing criterion as deciding', () => {
      const findings: Finding[] = [
        { criterionIndex: 0, status: 'fails', evidence: 'some evidence' },
        { criterionIndex: 1, status: 'holds' },
        { criterionIndex: 2, status: 'holds' },
        { criterionIndex: 3, status: 'holds' },
        { criterionIndex: 4, status: 'holds' },
      ];
      const verdict = assembleVerdict(findings, CRITERIA);
      expect(verdict.outcome).toBe('REFUSED');
      expect(verdict.decidingCriterionIndex).toBe(0);
      expect(verdict.failedIndexes).toEqual([0]);
    });
  });

  describe('Case 2: several disqualifying fails → lowest index deciding', () => {
    it('lists all failed, decides by lowest index (author order)', () => {
      const findings: Finding[] = [
        { criterionIndex: 0, status: 'holds' },
        { criterionIndex: 1, status: 'fails', evidence: 'ev1' },
        { criterionIndex: 2, status: 'holds' },
        { criterionIndex: 3, status: 'fails', evidence: 'ev3' },
        { criterionIndex: 4, status: 'holds' },
      ];
      const verdict = assembleVerdict(findings, CRITERIA);
      expect(verdict.outcome).toBe('REFUSED');
      expect(verdict.decidingCriterionIndex).toBe(1); // lowest index among failed disqualifiers
      expect(verdict.failedIndexes).toEqual([1, 3]); // in criteria-file order
    });
  });

  describe('Case 3: no disqualifying fails → NO_DISQUALIFIER_FOUND', () => {
    it('returns NO_DISQUALIFIER_FOUND with no deciding criterion', () => {
      const findings: Finding[] = [
        { criterionIndex: 0, status: 'holds' },
        { criterionIndex: 1, status: 'holds' },
        { criterionIndex: 2, status: 'holds' },
        { criterionIndex: 3, status: 'holds' },
        { criterionIndex: 4, status: 'holds' },
      ];
      const verdict = assembleVerdict(findings, CRITERIA);
      expect(verdict.outcome).toBe('NO_DISQUALIFIER_FOUND');
      expect(verdict.decidingCriterionIndex).toBeUndefined();
      expect(verdict.failedIndexes).toEqual([]);
    });
  });

  describe('Case 4: disqualifying indeterminate → incomplete true', () => {
    it('sets incomplete when a disqualifying criterion is indeterminate', () => {
      const findings: Finding[] = [
        { criterionIndex: 0, status: 'indeterminate' },
        { criterionIndex: 1, status: 'holds' },
        { criterionIndex: 2, status: 'holds' },
        { criterionIndex: 3, status: 'holds' },
        { criterionIndex: 4, status: 'holds' },
      ];
      const verdict = assembleVerdict(findings, CRITERIA);
      expect(verdict.outcome).toBe('NO_DISQUALIFIER_FOUND');
      expect(verdict.incomplete).toBe(true);
      expect(verdict.unevaluatedIndexes).toContain(0);
    });
  });

  describe('Case 5: preference indeterminate only → incomplete false', () => {
    it('does NOT set incomplete for a preference-only indeterminate', () => {
      const findings: Finding[] = [
        { criterionIndex: 0, status: 'holds' },
        { criterionIndex: 1, status: 'holds' },
        { criterionIndex: 2, status: 'indeterminate' }, // preference
        { criterionIndex: 3, status: 'holds' },
        { criterionIndex: 4, status: 'indeterminate' }, // preference
      ];
      const verdict = assembleVerdict(findings, CRITERIA);
      expect(verdict.incomplete).toBe(false);
      // But the indexes still appear in unevaluatedIndexes
      expect(verdict.unevaluatedIndexes).toEqual([2, 4]);
    });
  });

  describe('Case 6: preference fails alone → NO_DISQUALIFIER_FOUND, outcome unchanged', () => {
    it('preference fails do not change the outcome', () => {
      const findings: Finding[] = [
        { criterionIndex: 0, status: 'holds' },
        { criterionIndex: 1, status: 'holds' },
        { criterionIndex: 2, status: 'fails', evidence: 'pref evidence' }, // preference
        { criterionIndex: 3, status: 'holds' },
        { criterionIndex: 4, status: 'fails', evidence: 'pref evidence 2' }, // preference
      ];
      const verdict = assembleVerdict(findings, CRITERIA);
      expect(verdict.outcome).toBe('NO_DISQUALIFIER_FOUND');
      // Preference fails are NOT in failedIndexes (those are disqualifying only)
      expect(verdict.failedIndexes).toEqual([]);
      expect(verdict.decidingCriterionIndex).toBeUndefined();
    });
  });

  describe('Case 7: demoted disqualifying finding → treated as indeterminate, not fails', () => {
    it('a demoted finding does not decide a refusal', () => {
      const findings: Finding[] = [
        {
          criterionIndex: 0,
          status: 'indeterminate', // was 'fails' but demoted by §6
          demotedFrom: 'fails',
          demotionReason: 'Evidence not found in candidate text.',
          evidence: 'fabricated quote',
        },
        { criterionIndex: 1, status: 'holds' },
        { criterionIndex: 2, status: 'holds' },
        { criterionIndex: 3, status: 'holds' },
        { criterionIndex: 4, status: 'holds' },
      ];
      const verdict = assembleVerdict(findings, CRITERIA);
      // The demoted finding is indeterminate, not fails
      expect(verdict.outcome).toBe('NO_DISQUALIFIER_FOUND');
      expect(verdict.failedIndexes).toEqual([]);
      // But it IS incomplete because a disqualifying criterion is indeterminate
      expect(verdict.incomplete).toBe(true);
      expect(verdict.unevaluatedIndexes).toContain(0);
    });
  });

  describe('Case 8: REFUSED and incomplete together', () => {
    it('one criterion fails while another is indeterminate — both are true', () => {
      const findings: Finding[] = [
        { criterionIndex: 0, status: 'fails', evidence: 'evidence for 0' },
        { criterionIndex: 1, status: 'indeterminate' }, // disqualifying, indeterminate
        { criterionIndex: 2, status: 'holds' },
        { criterionIndex: 3, status: 'holds' },
        { criterionIndex: 4, status: 'holds' },
      ];
      const verdict = assembleVerdict(findings, CRITERIA);
      expect(verdict.outcome).toBe('REFUSED');
      expect(verdict.incomplete).toBe(true);
      expect(verdict.decidingCriterionIndex).toBe(0);
      expect(verdict.failedIndexes).toEqual([0]);
      expect(verdict.unevaluatedIndexes).toContain(1);
    });
  });

  describe('Case 9: every criterion holds → clean NO_DISQUALIFIER_FOUND', () => {
    it('all holds, nothing failed, not incomplete', () => {
      const findings: Finding[] = [
        { criterionIndex: 0, status: 'holds' },
        { criterionIndex: 1, status: 'holds' },
        { criterionIndex: 2, status: 'holds' },
        { criterionIndex: 3, status: 'holds' },
        { criterionIndex: 4, status: 'holds' },
      ];
      const verdict = assembleVerdict(findings, CRITERIA);
      expect(verdict.outcome).toBe('NO_DISQUALIFIER_FOUND');
      expect(verdict.incomplete).toBe(false);
      expect(verdict.failedIndexes).toEqual([]);
      expect(verdict.unevaluatedIndexes).toEqual([]);
      expect(verdict.decidingCriterionIndex).toBeUndefined();
    });
  });

  describe('ordering guarantees', () => {
    it('failedIndexes are in criteria-file order', () => {
      // Findings arrive in reverse order but failedIndexes should be sorted
      const findings: Finding[] = [
        { criterionIndex: 3, status: 'fails', evidence: 'ev3' },
        { criterionIndex: 0, status: 'fails', evidence: 'ev0' },
        { criterionIndex: 1, status: 'fails', evidence: 'ev1' },
        { criterionIndex: 2, status: 'holds' },
        { criterionIndex: 4, status: 'holds' },
      ];
      const verdict = assembleVerdict(findings, CRITERIA);
      expect(verdict.failedIndexes).toEqual([0, 1, 3]);
      expect(verdict.decidingCriterionIndex).toBe(0);
    });

    it('unevaluatedIndexes are in criteria-file order', () => {
      const findings: Finding[] = [
        { criterionIndex: 4, status: 'indeterminate' },
        { criterionIndex: 0, status: 'holds' },
        { criterionIndex: 3, status: 'indeterminate' },
        { criterionIndex: 1, status: 'holds' },
        { criterionIndex: 2, status: 'indeterminate' },
      ];
      const verdict = assembleVerdict(findings, CRITERIA);
      expect(verdict.unevaluatedIndexes).toEqual([2, 3, 4]);
    });
  });

  describe('edge cases', () => {
    it('zero criteria → NO_DISQUALIFIER_FOUND, not incomplete', () => {
      const verdict = assembleVerdict([], []);
      expect(verdict.outcome).toBe('NO_DISQUALIFIER_FOUND');
      expect(verdict.incomplete).toBe(false);
      expect(verdict.failedIndexes).toEqual([]);
      expect(verdict.unevaluatedIndexes).toEqual([]);
    });

    it('no disqualifying criteria (all preferences) → NO_DISQUALIFIER_FOUND even if all fail', () => {
      const prefOnly: Criterion[] = [
        { id: 'p1', kind: 'preference', statement: 'Pref 1.', rationale: 'Test.', addedOn: '2026-08-01' },
        { id: 'p2', kind: 'preference', statement: 'Pref 2.', rationale: 'Test.', addedOn: '2026-08-02' },
      ];
      const findings: Finding[] = [
        { criterionIndex: 0, status: 'fails', evidence: 'ev' },
        { criterionIndex: 1, status: 'fails', evidence: 'ev' },
      ];
      const verdict = assembleVerdict(findings, prefOnly);
      expect(verdict.outcome).toBe('NO_DISQUALIFIER_FOUND');
      expect(verdict.failedIndexes).toEqual([]);
      expect(verdict.incomplete).toBe(false);
    });
  });
});
