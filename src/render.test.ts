import { describe, it, expect } from 'vitest';
import { renderScreen, type RenderInput } from './render.js';
import type { Finding, Criterion, Verdict } from './types.js';

const CRITERIA: Criterion[] = [
  { id: 'prod-support', kind: 'disqualifying', statement: 'The role is production support or on-call.', rationale: 'Ruled out.', addedOn: '2026-08-03', hasException: true },
  { id: 'onsite-required', kind: 'disqualifying', statement: 'The role requires onsite presence.', rationale: 'Commute.', addedOn: '2026-07-09' },
  { id: 'legacy-only', kind: 'preference', statement: 'The stack is maintenance-only.', rationale: 'Slows track.', addedOn: '2026-08-13' },
  { id: 'team-size', kind: 'disqualifying', statement: 'Team is fewer than 3 engineers.', rationale: 'No peers.', addedOn: '2026-08-01' },
  { id: 'no-remote', kind: 'preference', statement: 'No remote option.', rationale: 'Preference.', addedOn: '2026-08-02' },
];

const BASE_INPUT: RenderInput = {
  verdict: {
    outcome: 'NO_DISQUALIFIER_FOUND',
    failedIndexes: [],
    unevaluatedIndexes: [],
    incomplete: false,
  },
  findings: CRITERIA.map((_, i) => ({ criterionIndex: i, status: 'holds' as const })),
  criteria: CRITERIA,
  label: 'platform-engineer-role-beta',
  criteriaVersion: '4f2a1b3c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a',
  screenedAt: '2026-08-13T14:30:00.000Z',
};

/** Words and symbols that must NEVER appear in any rendered output (AC-5.5, product premise) */
const BANNED_APPROVAL_TERMS = [
  'PASS', 'PASSED', 'CLEAR', 'OK', 'APPROVED',
  'looks good', 'no issues found', 'suitable', 'recommended',
  '✓', '✔', '☑',
];

describe('render — §8', () => {
  describe('banned approval terms never appear', () => {
    it('REFUSED output contains no approval language', () => {
      const input: RenderInput = {
        ...BASE_INPUT,
        verdict: {
          outcome: 'REFUSED',
          decidingCriterionIndex: 0,
          failedIndexes: [0],
          unevaluatedIndexes: [],
          incomplete: false,
        },
        findings: [
          { criterionIndex: 0, status: 'fails', evidence: 'owning L2/L3 escalations' },
          { criterionIndex: 1, status: 'holds' },
          { criterionIndex: 2, status: 'holds' },
          { criterionIndex: 3, status: 'holds' },
          { criterionIndex: 4, status: 'holds' },
        ],
      };
      const output = renderScreen(input);
      for (const term of BANNED_APPROVAL_TERMS) {
        expect(output).not.toContain(term);
      }
    });

    it('NO_DISQUALIFIER_FOUND output contains no approval language', () => {
      const output = renderScreen(BASE_INPUT);
      for (const term of BANNED_APPROVAL_TERMS) {
        expect(output).not.toContain(term);
      }
    });
  });

  describe('8.1 — REFUSED shape (AC-5.4, AC-4.2, AC-3.6)', () => {
    const refusedInput: RenderInput = {
      ...BASE_INPUT,
      verdict: {
        outcome: 'REFUSED',
        decidingCriterionIndex: 0,
        failedIndexes: [0, 1],
        unevaluatedIndexes: [3],
        incomplete: true,
      },
      findings: [
        { criterionIndex: 0, status: 'fails', evidence: 'owning L2/L3 escalations for the platform on a weekly on-call rota' },
        { criterionIndex: 1, status: 'fails', evidence: 'three days per week from our Bangalore office' },
        { criterionIndex: 2, status: 'holds' },
        { criterionIndex: 3, status: 'indeterminate' },
        { criterionIndex: 4, status: 'holds' },
      ],
    };

    it('starts with REFUSED - label', () => {
      const output = renderScreen(refusedInput);
      expect(output).toMatch(/^REFUSED - platform-engineer-role-beta/);
    });

    it('shows the deciding criterion with its id and statement', () => {
      const output = renderScreen(refusedInput);
      expect(output).toContain('Deciding criterion: prod-support');
      expect(output).toContain('The role is production support or on-call.');
    });

    it('shows evidence quote for deciding criterion', () => {
      const output = renderScreen(refusedInput);
      expect(output).toContain('owning L2/L3 escalations');
    });

    it('lists additional failures with evidence', () => {
      const output = renderScreen(refusedInput);
      expect(output).toContain('Also failed:');
      expect(output).toContain('onsite-required');
      expect(output).toContain('three days per week from our Bangalore office');
    });

    it('shows unevaluated list', () => {
      const output = renderScreen(refusedInput);
      expect(output).toContain('Could not be evaluated (1 of 5):');
      expect(output).toContain('team-size');
    });

    it('shows criteria version (truncated) and date', () => {
      const output = renderScreen(refusedInput);
      expect(output).toContain('Criteria version: 4f2a1b3c...');
      expect(output).toContain('Screened 2026-08-13');
    });

    it('shows incompleteness marker', () => {
      const output = renderScreen(refusedInput);
      expect(output).toContain('! Incomplete:');
    });
  });

  describe('8.2 — NO_DISQUALIFIER_FOUND shape (AC-5.5, AC-6.1, AC-4.2, AC-4.3)', () => {
    it('starts with NO DISQUALIFIER FOUND - label', () => {
      const output = renderScreen(BASE_INPUT);
      expect(output).toMatch(/^NO DISQUALIFIER FOUND - platform-engineer-role-beta/);
    });

    it('contains the not-a-recommendation statement directly under the outcome', () => {
      const output = renderScreen(BASE_INPUT);
      const lines = output.split('\n');
      // Line 0: outcome, Line 1: blank, Lines 2-3: not-a-recommendation
      expect(lines[2]).toContain('This is not a recommendation');
      expect(output).toContain('Nothing here endorses this candidate');
    });

    it('shows residual risks in author order', () => {
      const input: RenderInput = {
        ...BASE_INPUT,
        findings: [
          { criterionIndex: 0, status: 'holds', holdsReason: 'not-violated' },
          { criterionIndex: 1, status: 'holds' },
          { criterionIndex: 2, status: 'fails', evidence: 'maintaining the existing billing platform' },
          { criterionIndex: 3, status: 'holds' },
          { criterionIndex: 4, status: 'fails', evidence: 'no remote option mentioned' },
        ],
      };
      const output = renderScreen(input);
      expect(output).toContain('Residual risks (preferences that failed, in your order):');
      expect(output).toContain('legacy-only');
      expect(output).toContain('no-remote');
      // Check order: legacy-only (index 2) before no-remote (index 4)
      const legacyPos = output.indexOf('legacy-only');
      const noRemotePos = output.indexOf('no-remote');
      expect(legacyPos).toBeLessThan(noRemotePos);
    });

    it('shows unevaluated list with count', () => {
      const input: RenderInput = {
        ...BASE_INPUT,
        verdict: {
          outcome: 'NO_DISQUALIFIER_FOUND',
          failedIndexes: [],
          unevaluatedIndexes: [2, 4],
          incomplete: false,
        },
        findings: [
          { criterionIndex: 0, status: 'holds', holdsReason: 'not-violated' },
          { criterionIndex: 1, status: 'holds' },
          { criterionIndex: 2, status: 'indeterminate' },
          { criterionIndex: 3, status: 'holds' },
          { criterionIndex: 4, status: 'indeterminate' },
        ],
      };
      const output = renderScreen(input);
      expect(output).toContain('Could not be evaluated (2 of 5):');
    });

    it('shows incompleteness marker when incomplete', () => {
      const input: RenderInput = {
        ...BASE_INPUT,
        verdict: {
          outcome: 'NO_DISQUALIFIER_FOUND',
          failedIndexes: [],
          unevaluatedIndexes: [0],
          incomplete: true,
        },
        findings: [
          { criterionIndex: 0, status: 'indeterminate' },
          { criterionIndex: 1, status: 'holds' },
          { criterionIndex: 2, status: 'holds' },
          { criterionIndex: 3, status: 'holds' },
          { criterionIndex: 4, status: 'holds' },
        ],
      };
      const output = renderScreen(input);
      expect(output).toContain('! Incomplete: 1 disqualifying criterion could not be evaluated.');
    });

    it('shows "Could not be evaluated: none" when all criteria evaluated', () => {
      const output = renderScreen(BASE_INPUT);
      expect(output).toContain('Could not be evaluated: none');
    });
  });

  describe('8.3 — residual risks never ranked, weighted, or summed (AC-6.1, AC-6.2)', () => {
    it('does not number residual risks', () => {
      const input: RenderInput = {
        ...BASE_INPUT,
        findings: [
          { criterionIndex: 0, status: 'holds', holdsReason: 'not-violated' },
          { criterionIndex: 1, status: 'holds' },
          { criterionIndex: 2, status: 'fails', evidence: 'evidence1' },
          { criterionIndex: 3, status: 'holds' },
          { criterionIndex: 4, status: 'fails', evidence: 'evidence2' },
        ],
      };
      const output = renderScreen(input);
      // Should not have "1." or "2." numbering in front of risk items
      expect(output).not.toMatch(/^\s*\d+\.\s+legacy-only/m);
      expect(output).not.toMatch(/^\s*\d+\.\s+no-remote/m);
    });
  });

  describe('hollow screen — no disqualifying criteria defined', () => {
    it('surfaces a warning when criteria has no disqualifying kind', () => {
      const prefOnlyCriteria: Criterion[] = [
        { id: 'pref-a', kind: 'preference', statement: 'Pref A.', rationale: 'Test.', addedOn: '2026-08-01' },
      ];
      const input: RenderInput = {
        verdict: { outcome: 'NO_DISQUALIFIER_FOUND', failedIndexes: [], unevaluatedIndexes: [], incomplete: false },
        findings: [{ criterionIndex: 0, status: 'holds' }],
        criteria: prefOnlyCriteria,
        label: 'hollow-screen-test',
        criteriaVersion: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        screenedAt: '2026-08-13T10:00:00.000Z',
      };
      const output = renderScreen(input);
      expect(output).toContain('No disqualifying criteria were defined');
      expect(output).toContain('could not have refused');
    });

    it('does NOT show the hollow warning when disqualifying criteria exist', () => {
      const output = renderScreen(BASE_INPUT);
      expect(output).not.toContain('could not have refused');
    });
  });

  describe('evidence truncation', () => {
    it('truncates long evidence with ... in rendered output', () => {
      const longEvidence = 'x'.repeat(300);
      const input: RenderInput = {
        ...BASE_INPUT,
        verdict: { outcome: 'REFUSED', decidingCriterionIndex: 0, failedIndexes: [0], unevaluatedIndexes: [], incomplete: false },
        findings: [
          { criterionIndex: 0, status: 'fails', evidence: longEvidence },
          { criterionIndex: 1, status: 'holds' },
          { criterionIndex: 2, status: 'holds' },
          { criterionIndex: 3, status: 'holds' },
          { criterionIndex: 4, status: 'holds' },
        ],
      };
      const output = renderScreen(input);
      expect(output).not.toContain(longEvidence); // full not present
      expect(output).toContain('...'); // truncated
    });
  });

  describe('invariant violations', () => {
    it('throws when REFUSED has no decidingCriterionIndex', () => {
      const input: RenderInput = {
        ...BASE_INPUT,
        verdict: { outcome: 'REFUSED', failedIndexes: [0], unevaluatedIndexes: [], incomplete: false },
        findings: [
          { criterionIndex: 0, status: 'fails', evidence: 'ev' },
          { criterionIndex: 1, status: 'holds' },
          { criterionIndex: 2, status: 'holds' },
          { criterionIndex: 3, status: 'holds' },
          { criterionIndex: 4, status: 'holds' },
        ],
      };
      expect(() => renderScreen(input)).toThrow(/decidingCriterionIndex/);
    });

    it('throws when NO_DISQUALIFIER_FOUND has a decidingCriterionIndex', () => {
      const input: RenderInput = {
        ...BASE_INPUT,
        verdict: { outcome: 'NO_DISQUALIFIER_FOUND', decidingCriterionIndex: 0, failedIndexes: [], unevaluatedIndexes: [], incomplete: false },
      };
      expect(() => renderScreen(input)).toThrow(/decidingCriterionIndex/);
    });

    it('throws when a fails finding has empty evidence', () => {
      const input: RenderInput = {
        ...BASE_INPUT,
        verdict: { outcome: 'REFUSED', decidingCriterionIndex: 0, failedIndexes: [0], unevaluatedIndexes: [], incomplete: false },
        findings: [
          { criterionIndex: 0, status: 'fails', evidence: '' },
          { criterionIndex: 1, status: 'holds' },
          { criterionIndex: 2, status: 'holds' },
          { criterionIndex: 3, status: 'holds' },
          { criterionIndex: 4, status: 'holds' },
        ],
      };
      expect(() => renderScreen(input)).toThrow(/no evidence/);
    });
  });
});
