import { describe, it, expect } from 'vitest';
import { parseModelResponse, ParseError } from './parser.js';

const VALID_RESPONSE_3 = JSON.stringify([
  { index: 0, status: 'fails', evidence: 'owning L2/L3 escalations for the platform on a weekly on-call rota' },
  { index: 1, status: 'fails', evidence: 'three days per week from our Bangalore office' },
  { index: 2, status: 'indeterminate' },
]);

describe('parser — §5.4', () => {
  describe('valid responses', () => {
    it('parses a well-formed response with all three statuses', () => {
      const findings = parseModelResponse(VALID_RESPONSE_3, 3);
      expect(findings).toHaveLength(3);
      expect(findings[0].criterionIndex).toBe(0);
      expect(findings[0].status).toBe('fails');
      expect(findings[0].evidence).toBe('owning L2/L3 escalations for the platform on a weekly on-call rota');
      expect(findings[1].status).toBe('fails');
      expect(findings[2].status).toBe('indeterminate');
    });

    it('returns findings sorted by criterionIndex', () => {
      // Model returns in reverse order
      const reversed = JSON.stringify([
        { index: 2, status: 'holds' },
        { index: 0, status: 'fails', evidence: 'some evidence' },
        { index: 1, status: 'indeterminate' },
      ]);
      const findings = parseModelResponse(reversed, 3);
      expect(findings[0].criterionIndex).toBe(0);
      expect(findings[1].criterionIndex).toBe(1);
      expect(findings[2].criterionIndex).toBe(2);
    });

    it('preserves exceptionEvidence on holds', () => {
      const withException = JSON.stringify([
        { index: 0, status: 'holds', exceptionEvidence: 'architecture-track with prod support under 10%' },
      ]);
      const findings = parseModelResponse(withException, 1);
      expect(findings[0].exceptionEvidence).toBe('architecture-track with prod support under 10%');
    });

    it('strips markdown code fences', () => {
      const fenced = '```json\n' + VALID_RESPONSE_3 + '\n```';
      const findings = parseModelResponse(fenced, 3);
      expect(findings).toHaveLength(3);
    });

    it('handles holds without exceptionEvidence (exceptionEvidence is optional)', () => {
      const simple = JSON.stringify([{ index: 0, status: 'holds' }]);
      const findings = parseModelResponse(simple, 1);
      expect(findings[0].status).toBe('holds');
      expect(findings[0].exceptionEvidence).toBeUndefined();
    });
  });

  describe('failure mode: unparseable JSON', () => {
    it('throws ParseError for garbage text', () => {
      expect(() => parseModelResponse('not json at all', 3)).toThrow(ParseError);
      expect(() => parseModelResponse('not json at all', 3)).toThrow(/not valid JSON/);
    });

    it('throws ParseError for partial JSON', () => {
      expect(() => parseModelResponse('[{"index": 0,', 1)).toThrow(ParseError);
    });
  });

  describe('failure mode: not an array', () => {
    it('throws ParseError for an object', () => {
      expect(() => parseModelResponse('{"index": 0}', 1)).toThrow(ParseError);
      expect(() => parseModelResponse('{"index": 0}', 1)).toThrow(/not an array/);
    });

    it('throws ParseError for a string', () => {
      expect(() => parseModelResponse('"hello"', 1)).toThrow(ParseError);
    });
  });

  describe('failure mode: wrong array length', () => {
    it('throws ParseError when too few findings', () => {
      const tooFew = JSON.stringify([{ index: 0, status: 'holds' }]);
      expect(() => parseModelResponse(tooFew, 3)).toThrow(ParseError);
      expect(() => parseModelResponse(tooFew, 3)).toThrow(/1 findings but 3 were expected/);
    });

    it('throws ParseError when too many findings', () => {
      const tooMany = JSON.stringify([
        { index: 0, status: 'holds' },
        { index: 1, status: 'holds' },
        { index: 2, status: 'holds' },
      ]);
      expect(() => parseModelResponse(tooMany, 2)).toThrow(ParseError);
      expect(() => parseModelResponse(tooMany, 2)).toThrow(/3 findings but 2 were expected/);
    });
  });

  describe('failure mode: invalid index', () => {
    it('throws ParseError for non-integer index', () => {
      const nonInt = JSON.stringify([{ index: 0.5, status: 'holds' }]);
      expect(() => parseModelResponse(nonInt, 1)).toThrow(ParseError);
      expect(() => parseModelResponse(nonInt, 1)).toThrow(/must be an integer/);
    });

    it('throws ParseError for string index', () => {
      const strIndex = JSON.stringify([{ index: 'zero', status: 'holds' }]);
      expect(() => parseModelResponse(strIndex, 1)).toThrow(ParseError);
    });

    it('throws ParseError for missing index', () => {
      const noIndex = JSON.stringify([{ status: 'holds' }]);
      expect(() => parseModelResponse(noIndex, 1)).toThrow(ParseError);
    });

    it('throws ParseError for out-of-range index', () => {
      const outOfRange = JSON.stringify([{ index: 5, status: 'holds' }]);
      expect(() => parseModelResponse(outOfRange, 1)).toThrow(ParseError);
      expect(() => parseModelResponse(outOfRange, 1)).toThrow(/out of range/);
    });

    it('throws ParseError for negative index', () => {
      const negative = JSON.stringify([{ index: -1, status: 'holds' }]);
      expect(() => parseModelResponse(negative, 1)).toThrow(ParseError);
      expect(() => parseModelResponse(negative, 1)).toThrow(/out of range/);
    });
  });

  describe('failure mode: duplicate index', () => {
    it('throws ParseError for duplicate indexes', () => {
      const dup = JSON.stringify([
        { index: 0, status: 'holds' },
        { index: 0, status: 'fails', evidence: 'something' },
      ]);
      expect(() => parseModelResponse(dup, 2)).toThrow(ParseError);
      expect(() => parseModelResponse(dup, 2)).toThrow(/duplicate index 0/);
    });
  });

  describe('failure mode: missing criterion (gap in indexes)', () => {
    it('throws ParseError when an index is never covered', () => {
      // Returns indexes 0 and 2 but not 1
      const gap = JSON.stringify([
        { index: 0, status: 'holds' },
        { index: 2, status: 'holds' },
      ]);
      // Array length is 2, criteria count is 3 → caught by length check first
      expect(() => parseModelResponse(gap, 3)).toThrow(ParseError);
    });

    it('throws ParseError for correct length but skipped index', () => {
      // 3 findings but indexes are 0, 0, 1 (duplicate) rather than 0, 1, 2
      const skip = JSON.stringify([
        { index: 0, status: 'holds' },
        { index: 2, status: 'holds' },
        { index: 2, status: 'holds' },
      ]);
      expect(() => parseModelResponse(skip, 3)).toThrow(ParseError);
      expect(() => parseModelResponse(skip, 3)).toThrow(/duplicate/);
    });
  });

  describe('failure mode: invalid status', () => {
    it('throws ParseError for unknown status', () => {
      const bad = JSON.stringify([{ index: 0, status: 'maybe' }]);
      expect(() => parseModelResponse(bad, 1)).toThrow(ParseError);
      expect(() => parseModelResponse(bad, 1)).toThrow(/invalid status "maybe"/);
    });

    it('throws ParseError for missing status', () => {
      const noStatus = JSON.stringify([{ index: 0 }]);
      expect(() => parseModelResponse(noStatus, 1)).toThrow(ParseError);
    });

    it('throws ParseError for numeric status', () => {
      const numStatus = JSON.stringify([{ index: 0, status: 1 }]);
      expect(() => parseModelResponse(numStatus, 1)).toThrow(ParseError);
    });
  });

  describe('failure mode: fails without evidence', () => {
    it('throws ParseError when fails has no evidence', () => {
      const noEvidence = JSON.stringify([{ index: 0, status: 'fails' }]);
      expect(() => parseModelResponse(noEvidence, 1)).toThrow(ParseError);
      expect(() => parseModelResponse(noEvidence, 1)).toThrow(/evidence.*missing or empty/);
    });

    it('throws ParseError when evidence is empty string', () => {
      const emptyEvidence = JSON.stringify([{ index: 0, status: 'fails', evidence: '' }]);
      expect(() => parseModelResponse(emptyEvidence, 1)).toThrow(ParseError);
    });

    it('throws ParseError when evidence is whitespace only', () => {
      const wsEvidence = JSON.stringify([{ index: 0, status: 'fails', evidence: '   ' }]);
      expect(() => parseModelResponse(wsEvidence, 1)).toThrow(ParseError);
    });
  });

  describe('failure mode: non-object entries', () => {
    it('throws ParseError for null entry', () => {
      const nullEntry = JSON.stringify([null]);
      expect(() => parseModelResponse(nullEntry, 1)).toThrow(ParseError);
      expect(() => parseModelResponse(nullEntry, 1)).toThrow(/not an object/);
    });

    it('throws ParseError for string entry', () => {
      const strEntry = JSON.stringify(['holds']);
      expect(() => parseModelResponse(strEntry, 1)).toThrow(ParseError);
    });
  });

  describe('extra fields are silently ignored', () => {
    it('does not fail on extra fields', () => {
      const extra = JSON.stringify([
        { index: 0, status: 'holds', reasoning: 'The model explains itself', confidence: 0.9 },
      ]);
      const findings = parseModelResponse(extra, 1);
      expect(findings).toHaveLength(1);
      expect(findings[0].status).toBe('holds');
    });
  });
});
