import { describe, it, expect } from 'vitest';
import { verifyFindings, normaliseForComparison } from './verify.js';
import { getCandidateText } from './candidate-text.js';
import type { Finding, Criterion } from './types.js';

// Seed data that contains the things being detected (engineering rule 4)
const CANDIDATE_TEXT = `Senior Platform Engineer - Remote

We are looking for a senior engineer to join our distributed team.
The role involves owning L2/L3 escalations for the platform on a weekly on-call rota.
You will work three days per week from our Bangalore office.
This is an architecture-track position with prod support named as under 15%.`;

const CRITERIA: Criterion[] = [
  {
    id: 'prod-support',
    kind: 'disqualifying',
    statement: 'The role is production support unless architecture-track with prod support under 20%.',
    rationale: 'Ruled out.',
    addedOn: '2026-08-03',
    hasException: true,
  },
  {
    id: 'onsite-required',
    kind: 'disqualifying',
    statement: 'The role requires relocation or regular onsite presence.',
    rationale: 'Commute constraint.',
    addedOn: '2026-07-09',
  },
  {
    id: 'legacy-only',
    kind: 'preference',
    statement: 'The stack is maintenance-only with no greenfield work.',
    rationale: 'Survivable.',
    addedOn: '2026-08-13',
  },
];

describe('verify — §6', () => {
  describe('normaliseForComparison', () => {
    it('collapses multiple spaces to one', () => {
      expect(normaliseForComparison('a   b')).toBe('a b');
    });

    it('collapses newlines to a space', () => {
      expect(normaliseForComparison('a\nb')).toBe('a b');
    });

    it('collapses CRLF to a space', () => {
      expect(normaliseForComparison('a\r\nb')).toBe('a b');
    });

    it('collapses tabs to a space', () => {
      expect(normaliseForComparison('a\t\tb')).toBe('a b');
    });

    it('trims leading and trailing whitespace', () => {
      expect(normaliseForComparison('  hello  ')).toBe('hello');
    });
  });

  describe('getCandidateText', () => {
    it('decodes UTF-8 buffer to string', () => {
      const buf = Buffer.from('Hello world', 'utf-8');
      expect(getCandidateText(buf)).toBe('Hello world');
    });

    it('strips UTF-8 BOM', () => {
      const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
      const text = Buffer.from('Content after BOM', 'utf-8');
      const combined = Buffer.concat([bom, text]);
      expect(getCandidateText(combined)).toBe('Content after BOM');
    });

    it('leaves content without BOM unchanged', () => {
      const buf = Buffer.from('No BOM here', 'utf-8');
      expect(getCandidateText(buf)).toBe('No BOM here');
    });
  });

  describe('6.1 / 6.2 — evidence verification for fails (AC-3.4, AC-3.5)', () => {
    it('passes when evidence is a verbatim substring', () => {
      const findings: Finding[] = [
        { criterionIndex: 1, status: 'fails', evidence: 'three days per week from our Bangalore office' },
      ];
      const result = verifyFindings(findings, CANDIDATE_TEXT, CRITERIA);
      expect(result[0].status).toBe('fails');
      expect(result[0].demotedFrom).toBeUndefined();
    });

    it('demotes to indeterminate when evidence is fabricated', () => {
      const findings: Finding[] = [
        { criterionIndex: 1, status: 'fails', evidence: 'mandatory relocation to Mumbai office' },
      ];
      const result = verifyFindings(findings, CANDIDATE_TEXT, CRITERIA);
      expect(result[0].status).toBe('indeterminate');
      expect(result[0].demotedFrom).toBe('fails');
      expect(result[0].demotionReason).toContain('not found in candidate text');
    });

    it('keeps original evidence after demotion for diagnostics', () => {
      const findings: Finding[] = [
        { criterionIndex: 1, status: 'fails', evidence: 'invented quote' },
      ];
      const result = verifyFindings(findings, CANDIDATE_TEXT, CRITERIA);
      expect(result[0].evidence).toBe('invented quote');
    });

    it('passes with whitespace-normalised match (newline collapsed to space)', () => {
      // Evidence with a newline where the source has one (normalised comparison)
      const findings: Finding[] = [
        {
          criterionIndex: 1,
          status: 'fails',
          // The source has a line break between these, model returns with space
          evidence: 'owning L2/L3 escalations for the platform on a weekly on-call rota. You will work three days per week',
        },
      ];
      const result = verifyFindings(findings, CANDIDATE_TEXT, CRITERIA);
      expect(result[0].status).toBe('fails');
      expect(result[0].demotedFrom).toBeUndefined();
    });

    it('demotes when evidence has extra words not in candidate (not just whitespace diff)', () => {
      const findings: Finding[] = [
        { criterionIndex: 1, status: 'fails', evidence: 'three days per week from our beautiful Bangalore office' },
      ];
      const result = verifyFindings(findings, CANDIDATE_TEXT, CRITERIA);
      expect(result[0].status).toBe('indeterminate');
      expect(result[0].demotedFrom).toBe('fails');
    });
  });

  describe('6.3 — hasException verification (AC-3.7, AC-3.8)', () => {
    it('passes a not-violated hold untouched — no evidence needed', () => {
      const findings: Finding[] = [
        { criterionIndex: 0, status: 'holds', holdsReason: 'not-violated' },
      ];
      const result = verifyFindings(findings, CANDIDATE_TEXT, CRITERIA);
      expect(result[0].status).toBe('holds');
      expect(result[0].holdsReason).toBe('not-violated');
      expect(result[0].demotedFrom).toBeUndefined();
    });

    it('passes exception-applied with valid exceptionEvidence', () => {
      const findings: Finding[] = [
        {
          criterionIndex: 0,
          status: 'holds',
          holdsReason: 'exception-applied',
          exceptionEvidence: 'architecture-track position with prod support named as under 15%',
        },
      ];
      const result = verifyFindings(findings, CANDIDATE_TEXT, CRITERIA);
      expect(result[0].status).toBe('holds');
      expect(result[0].demotedFrom).toBeUndefined();
    });

    it('demotes exception-applied when exceptionEvidence is fabricated', () => {
      const findings: Finding[] = [
        {
          criterionIndex: 0,
          status: 'holds',
          holdsReason: 'exception-applied',
          exceptionEvidence: 'clearly an architecture role with no on-call duties',
        },
      ];
      const result = verifyFindings(findings, CANDIDATE_TEXT, CRITERIA);
      expect(result[0].status).toBe('indeterminate');
      expect(result[0].demotedFrom).toBe('holds');
      expect(result[0].demotionReason).toContain('exceptionEvidence not found');
    });

    it('demotes exception-applied when exceptionEvidence is missing', () => {
      const findings: Finding[] = [
        {
          criterionIndex: 0,
          status: 'holds',
          holdsReason: 'exception-applied',
          // no exceptionEvidence
        },
      ];
      const result = verifyFindings(findings, CANDIDATE_TEXT, CRITERIA);
      expect(result[0].status).toBe('indeterminate');
      expect(result[0].demotedFrom).toBe('holds');
      expect(result[0].demotionReason).toContain('exceptionEvidence is missing');
    });

    it('demotes when holdsReason is missing on hasException criterion (AC-3.8)', () => {
      const findings: Finding[] = [
        {
          criterionIndex: 0,
          status: 'holds',
          // no holdsReason — model didn't say which way it held
        },
      ];
      const result = verifyFindings(findings, CANDIDATE_TEXT, CRITERIA);
      expect(result[0].status).toBe('indeterminate');
      expect(result[0].demotedFrom).toBe('holds');
      expect(result[0].demotionReason).toContain('holdsReason');
    });

    it('does NOT check holdsReason on a non-hasException criterion', () => {
      // Criterion index 1 (onsite-required) has no hasException
      const findings: Finding[] = [
        { criterionIndex: 1, status: 'holds' },
      ];
      const result = verifyFindings(findings, CANDIDATE_TEXT, CRITERIA);
      expect(result[0].status).toBe('holds');
      expect(result[0].demotedFrom).toBeUndefined();
    });
  });

  describe('indeterminate findings pass through unchanged', () => {
    it('does not touch an indeterminate finding', () => {
      const findings: Finding[] = [
        { criterionIndex: 2, status: 'indeterminate' },
      ];
      const result = verifyFindings(findings, CANDIDATE_TEXT, CRITERIA);
      expect(result[0].status).toBe('indeterminate');
      expect(result[0].demotedFrom).toBeUndefined();
    });
  });

  describe('multiple findings verified together', () => {
    it('verifies each finding independently', () => {
      const findings: Finding[] = [
        {
          criterionIndex: 0,
          status: 'holds',
          holdsReason: 'exception-applied',
          exceptionEvidence: 'architecture-track position with prod support named as under 15%',
        },
        {
          criterionIndex: 1,
          status: 'fails',
          evidence: 'three days per week from our Bangalore office',
        },
        {
          criterionIndex: 2,
          status: 'indeterminate',
        },
      ];
      const result = verifyFindings(findings, CANDIDATE_TEXT, CRITERIA);
      expect(result[0].status).toBe('holds');   // exception verified
      expect(result[1].status).toBe('fails');   // evidence verified
      expect(result[2].status).toBe('indeterminate'); // passed through
    });

    it('demotions are countable — demotedFrom is always set', () => {
      const findings: Finding[] = [
        { criterionIndex: 0, status: 'holds' },  // missing holdsReason
        { criterionIndex: 1, status: 'fails', evidence: 'fabricated nonsense' },
      ];
      const result = verifyFindings(findings, CANDIDATE_TEXT, CRITERIA);
      const demoted = result.filter(f => f.demotedFrom !== undefined);
      expect(demoted).toHaveLength(2);
    });
  });

  describe('whitespace normalisation details', () => {
    it('matches evidence with collapsed newline in source', () => {
      // Source text has a line break after "rota."
      // Model quotes across the line break as a single space
      const findings: Finding[] = [
        {
          criterionIndex: 1,
          status: 'fails',
          evidence: 'on a weekly on-call rota. You will work three days',
        },
      ];
      const result = verifyFindings(findings, CANDIDATE_TEXT, CRITERIA);
      expect(result[0].status).toBe('fails');
    });

    it('does NOT case-fold — case mismatch causes demotion', () => {
      const findings: Finding[] = [
        { criterionIndex: 1, status: 'fails', evidence: 'Three Days Per Week From Our Bangalore Office' },
      ];
      const result = verifyFindings(findings, CANDIDATE_TEXT, CRITERIA);
      // Original has lowercase "three days..." — case mismatch is NOT normalised
      expect(result[0].status).toBe('indeterminate');
      expect(result[0].demotedFrom).toBe('fails');
    });

    it('does NOT strip punctuation — extra period causes demotion', () => {
      const findings: Finding[] = [
        { criterionIndex: 1, status: 'fails', evidence: 'three days per week from our Bangalore office.' },
      ];
      // Source does NOT have a trailing period after "office" on that phrase
      // Wait — actually let's check. The source says "from our Bangalore office."
      // Let me use a case where source has no period
      const textNoPeriod = 'You will work three days per week from our Bangalore office';
      const findingsNoPeriod: Finding[] = [
        { criterionIndex: 1, status: 'fails', evidence: 'three days per week from our Bangalore office.' },
      ];
      const result = verifyFindings(findingsNoPeriod, textNoPeriod, CRITERIA);
      expect(result[0].status).toBe('indeterminate');
    });

    it('demotionReason distinguishes whitespace-normalised not-found', () => {
      const findings: Finding[] = [
        { criterionIndex: 1, status: 'fails', evidence: 'completely invented sentence' },
      ];
      const result = verifyFindings(findings, CANDIDATE_TEXT, CRITERIA);
      expect(result[0].demotionReason).toContain('after whitespace normalisation');
    });
  });
});
