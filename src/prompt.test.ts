import { describe, it, expect } from 'vitest';
import { buildScreenPrompt } from './prompt.js';
import type { Criterion } from './types.js';

const SAMPLE_CRITERIA: Criterion[] = [
  {
    id: 'prod-support',
    kind: 'disqualifying',
    statement: 'The role is production support or on-call escalation, unless architecture-track with prod support under 20%.',
    rationale: 'Ruled out at any salary.',
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
    rationale: 'Survivable but slows the architecture track.',
    addedOn: '2026-08-13',
  },
];

const SAMPLE_CANDIDATE = `Senior Platform Engineer - Remote

We are looking for a senior engineer to join our distributed team.
The role involves owning L2/L3 escalations for the platform on a weekly on-call rota.
You will work three days per week from our Bangalore office.`;

describe('prompt — §5', () => {
  describe('5.3 / 5.8 — prompt must not contain verdict tokens (AC-5.7)', () => {
    it('does not contain REFUSED', () => {
      const prompt = buildScreenPrompt(SAMPLE_CANDIDATE, SAMPLE_CRITERIA);
      expect(prompt).not.toContain('REFUSED');
    });

    it('does not contain NO_DISQUALIFIER_FOUND', () => {
      const prompt = buildScreenPrompt(SAMPLE_CANDIDATE, SAMPLE_CRITERIA);
      expect(prompt).not.toContain('NO_DISQUALIFIER_FOUND');
    });

    it('does not ask the model whether to refuse', () => {
      const prompt = buildScreenPrompt(SAMPLE_CANDIDATE, SAMPLE_CRITERIA).toLowerCase();
      expect(prompt).not.toContain('should this candidate be refused');
      expect(prompt).not.toContain('whether to refuse');
      expect(prompt).not.toContain('decide whether to');
    });

    it('does not ask for a rating, score, or overall judgement', () => {
      const prompt = buildScreenPrompt(SAMPLE_CANDIDATE, SAMPLE_CRITERIA).toLowerCase();
      // NOTE: We check the prompt does not REQUEST these things.
      // The prompt correctly FORBIDS them ("do not provide any overall assessment...")
      // which is not the same as requesting them. We check for request patterns only.
      expect(prompt).not.toContain('provide an overall score');
      expect(prompt).not.toContain('provide an overall rating');
      expect(prompt).not.toContain('rate this candidate');
      expect(prompt).not.toContain('score this candidate');
      expect(prompt).not.toContain('how good');
    });

    it('does not ask how good the candidate is', () => {
      const prompt = buildScreenPrompt(SAMPLE_CANDIDATE, SAMPLE_CRITERIA).toLowerCase();
      expect(prompt).not.toContain('how suitable');
      expect(prompt).not.toContain('how well');
      expect(prompt).not.toContain('fitness');
      expect(prompt).not.toContain('suitability');
    });

    it('does not ask which criterion matters most', () => {
      const prompt = buildScreenPrompt(SAMPLE_CANDIDATE, SAMPLE_CRITERIA).toLowerCase();
      expect(prompt).not.toContain('most important');
      expect(prompt).not.toContain('rank the criteria');
      expect(prompt).not.toContain('prioritize');
    });
  });

  describe('5.1 — prompt structure (AC-3.1, AC-3.2, AC-3.3)', () => {
    it('contains the full candidate text verbatim', () => {
      const prompt = buildScreenPrompt(SAMPLE_CANDIDATE, SAMPLE_CRITERIA);
      expect(prompt).toContain(SAMPLE_CANDIDATE);
    });

    it('contains numbered criteria', () => {
      const prompt = buildScreenPrompt(SAMPLE_CANDIDATE, SAMPLE_CRITERIA);
      expect(prompt).toContain('[0]');
      expect(prompt).toContain('[1]');
      expect(prompt).toContain('[2]');
    });

    it('includes each criterion statement', () => {
      const prompt = buildScreenPrompt(SAMPLE_CANDIDATE, SAMPLE_CRITERIA);
      for (const c of SAMPLE_CRITERIA) {
        expect(prompt).toContain(c.statement);
      }
    });

    it('requests exactly three statuses: fails, holds, indeterminate', () => {
      const prompt = buildScreenPrompt(SAMPLE_CANDIDATE, SAMPLE_CRITERIA);
      expect(prompt).toContain('"fails"');
      expect(prompt).toContain('"holds"');
      expect(prompt).toContain('"indeterminate"');
    });

    it('requests evidence for fails', () => {
      const prompt = buildScreenPrompt(SAMPLE_CANDIDATE, SAMPLE_CRITERIA).toLowerCase();
      expect(prompt).toContain('evidence');
      expect(prompt).toContain('verbatim');
    });

    it('specifies the expected count of findings', () => {
      const prompt = buildScreenPrompt(SAMPLE_CANDIDATE, SAMPLE_CRITERIA);
      expect(prompt).toContain(`exactly ${SAMPLE_CRITERIA.length} objects`);
    });
  });

  describe('5.2 — indeterminate offered explicitly (AC-3.2, AC-4.1)', () => {
    it('describes indeterminate as the correct answer for unaddressed criteria', () => {
      const prompt = buildScreenPrompt(SAMPLE_CANDIDATE, SAMPLE_CRITERIA).toLowerCase();
      expect(prompt).toContain('correct answer');
      expect(prompt).toContain('does not address');
    });

    it('tells the model not to guess', () => {
      const prompt = buildScreenPrompt(SAMPLE_CANDIDATE, SAMPLE_CRITERIA).toLowerCase();
      expect(prompt).toContain('do not guess');
    });
  });

  describe('5.6 — hasException instruction (AC-3.7)', () => {
    it('marks hasException criteria in the prompt', () => {
      const prompt = buildScreenPrompt(SAMPLE_CANDIDATE, SAMPLE_CRITERIA);
      expect(prompt).toContain('[hasException: true]');
    });

    it('requests exceptionEvidence for hasException criteria', () => {
      const prompt = buildScreenPrompt(SAMPLE_CANDIDATE, SAMPLE_CRITERIA).toLowerCase();
      expect(prompt).toContain('exceptionevidence');
    });

    it('explains when exceptionEvidence is required vs not', () => {
      const prompt = buildScreenPrompt(SAMPLE_CANDIDATE, SAMPLE_CRITERIA);
      // The prompt now uses holdsReason to structurally distinguish the two cases:
      // 'not-violated' (no evidence needed) vs 'exception-applied' (evidence required)
      expect(prompt).toContain('exception');
      expect(prompt.toLowerCase()).toContain('not-violated');
      expect(prompt.toLowerCase()).toContain('exception-applied');
      // 'not-violated' described as needing no further evidence
      expect(prompt.toLowerCase()).toContain('no further evidence needed');
    });

    it('does not mention exceptionEvidence when no criteria have hasException', () => {
      const noException: Criterion[] = [
        {
          id: 'simple',
          kind: 'disqualifying',
          statement: 'Simple criterion with no exception.',
          rationale: 'Test.',
          addedOn: '2026-08-01',
        },
      ];
      const prompt = buildScreenPrompt(SAMPLE_CANDIDATE, noException);
      expect(prompt.toLowerCase()).not.toContain('exceptionevidence');
    });
  });

  describe('findings by index, not restated text', () => {
    it('instructs findings by index number only', () => {
      const prompt = buildScreenPrompt(SAMPLE_CANDIDATE, SAMPLE_CRITERIA).toLowerCase();
      expect(prompt).toContain('identified by index');
      expect(prompt).toContain('do not restate');
    });
  });
});
