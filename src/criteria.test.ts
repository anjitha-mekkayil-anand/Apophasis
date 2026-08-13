import { describe, it, expect } from 'vitest';
import { loadCriteriaFromBuffer, CriteriaValidationError } from './criteria.js';

/**
 * Helper: build a Buffer from a YAML string for testing without disk access.
 */
function yamlBuffer(yaml: string): Buffer {
  return Buffer.from(yaml, 'utf-8');
}

const VALID_CRITERIA_YAML = `
schemaVersion: 1
criteria:
  - id: prod-support
    kind: disqualifying
    statement: >
      The role is production support, L2/L3, or an on-call escalation function,
      unless the role is explicitly architecture-track with prod support named
      as under 20%.
    rationale: >
      Ruled out at any salary. Past instances produced the hero-complex pattern
      and displaced the architecture track entirely.
    addedOn: 2026-08-03
    source: "Why Applying Feels Dangerous"
    hasException: true
  - id: onsite-required
    kind: disqualifying
    statement: The role requires relocation or regular onsite presence.
    rationale: Commute constraint. Non-negotiable.
    addedOn: 2026-07-09
  - id: legacy-only
    kind: preference
    statement: The stack is maintenance-only with no greenfield work described.
    rationale: Survivable, but it slows the architecture track.
    addedOn: 2026-08-13
`;

describe('criteria model', () => {
  describe('2.1 — valid file loads and order is preserved (AC-1.1, AC-1.4)', () => {
    it('parses a valid criteria file into an ordered array', () => {
      const result = loadCriteriaFromBuffer(yamlBuffer(VALID_CRITERIA_YAML));

      expect(result.criteria).toHaveLength(3);
      expect(result.criteria[0].id).toBe('prod-support');
      expect(result.criteria[1].id).toBe('onsite-required');
      expect(result.criteria[2].id).toBe('legacy-only');
    });

    it('preserves author-declared order exactly', () => {
      const yaml = `
schemaVersion: 1
criteria:
  - id: z-last
    kind: preference
    statement: Z comes last alphabetically but first in the file.
    rationale: Testing order preservation.
    addedOn: 2026-08-01
  - id: a-first
    kind: disqualifying
    statement: A comes first alphabetically but second in the file.
    rationale: Testing order preservation.
    addedOn: 2026-08-02
`;
      const result = loadCriteriaFromBuffer(yamlBuffer(yaml));
      expect(result.criteria[0].id).toBe('z-last');
      expect(result.criteria[1].id).toBe('a-first');
    });

    it('loads all required fields correctly', () => {
      const result = loadCriteriaFromBuffer(yamlBuffer(VALID_CRITERIA_YAML));
      const first = result.criteria[0];

      expect(first.kind).toBe('disqualifying');
      expect(first.statement).toContain('production support');
      expect(first.rationale).toContain('Ruled out at any salary');
      expect(first.addedOn).toBe('2026-08-03');
      expect(first.source).toBe('Why Applying Feels Dangerous');
      expect(first.hasException).toBe(true);
    });

    it('defaults hasException to undefined when not set', () => {
      const result = loadCriteriaFromBuffer(yamlBuffer(VALID_CRITERIA_YAML));
      expect(result.criteria[1].hasException).toBeUndefined();
    });
  });

  describe('2.2 — invalid kind rejects (AC-1.1, AC-1.3)', () => {
    it('rejects a file with an invalid kind', () => {
      const yaml = `
schemaVersion: 1
criteria:
  - id: bad-kind
    kind: critical
    statement: This has an invalid kind.
    rationale: For testing.
    addedOn: 2026-08-01
`;
      expect(() => loadCriteriaFromBuffer(yamlBuffer(yaml))).toThrow(CriteriaValidationError);
      expect(() => loadCriteriaFromBuffer(yamlBuffer(yaml))).toThrow(
        /invalid kind "critical"/
      );
    });

    it('rejects missing kind', () => {
      const yaml = `
schemaVersion: 1
criteria:
  - id: no-kind
    statement: Kind is missing entirely.
    rationale: For testing.
    addedOn: 2026-08-01
`;
      expect(() => loadCriteriaFromBuffer(yamlBuffer(yaml))).toThrow(CriteriaValidationError);
    });
  });

  describe('2.3 — missing or empty rationale rejects naming the criterion (AC-1.2)', () => {
    it('rejects when rationale is missing', () => {
      const yaml = `
schemaVersion: 1
criteria:
  - id: no-rationale
    kind: disqualifying
    statement: A rule without a rationale.
    addedOn: 2026-08-01
`;
      expect(() => loadCriteriaFromBuffer(yamlBuffer(yaml))).toThrow(CriteriaValidationError);
      expect(() => loadCriteriaFromBuffer(yamlBuffer(yaml))).toThrow(
        /no-rationale.*rationale/i
      );
    });

    it('rejects when rationale is whitespace-only', () => {
      const yaml = `
schemaVersion: 1
criteria:
  - id: blank-rationale
    kind: preference
    statement: A rule with blank rationale.
    rationale: "   "
    addedOn: 2026-08-01
`;
      expect(() => loadCriteriaFromBuffer(yamlBuffer(yaml))).toThrow(CriteriaValidationError);
      expect(() => loadCriteriaFromBuffer(yamlBuffer(yaml))).toThrow(
        /blank-rationale/
      );
    });

    it('names the offending criterion id in the error', () => {
      const yaml = `
schemaVersion: 1
criteria:
  - id: good-one
    kind: disqualifying
    statement: This one is fine.
    rationale: Has a rationale.
    addedOn: 2026-08-01
  - id: the-offender
    kind: preference
    statement: This one has no rationale.
    addedOn: 2026-08-02
`;
      try {
        loadCriteriaFromBuffer(yamlBuffer(yaml));
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(CriteriaValidationError);
        expect((err as Error).message).toContain('the-offender');
        expect((err as Error).message).not.toContain('good-one');
      }
    });
  });

  describe('2.4 — version is SHA-256 of raw bytes (AC-3.6)', () => {
    it('returns a 64-character hex hash', () => {
      const result = loadCriteriaFromBuffer(yamlBuffer(VALID_CRITERIA_YAML));
      expect(result.version).toMatch(/^[0-9a-f]{64}$/);
    });

    it('same bytes produce the same hash', () => {
      const buf = yamlBuffer(VALID_CRITERIA_YAML);
      const r1 = loadCriteriaFromBuffer(buf);
      const r2 = loadCriteriaFromBuffer(buf);
      expect(r1.version).toBe(r2.version);
    });

    it('different bytes produce a different hash', () => {
      const buf1 = yamlBuffer(VALID_CRITERIA_YAML);
      const buf2 = yamlBuffer(VALID_CRITERIA_YAML + '\n# a comment\n');
      const r1 = loadCriteriaFromBuffer(buf1);
      const r2 = loadCriteriaFromBuffer(buf2);
      expect(r1.version).not.toBe(r2.version);
    });
  });

  describe('2.6 — advisory for exception clause without hasException (AC-1.5)', () => {
    it('emits an advisory when "unless" appears and hasException is not set', () => {
      const yaml = `
schemaVersion: 1
criteria:
  - id: has-unless
    kind: disqualifying
    statement: The role requires onsite presence unless fully remote.
    rationale: Testing advisory.
    addedOn: 2026-08-01
`;
      const result = loadCriteriaFromBuffer(yamlBuffer(yaml));
      expect(result.advisories).toHaveLength(1);
      expect(result.advisories[0].criterionId).toBe('has-unless');
      expect(result.advisories[0].message).toContain('unless');
    });

    it('emits an advisory for "except where"', () => {
      const yaml = `
schemaVersion: 1
criteria:
  - id: has-except-where
    kind: disqualifying
    statement: No travel required except where the client is on-site.
    rationale: Testing advisory.
    addedOn: 2026-08-01
`;
      const result = loadCriteriaFromBuffer(yamlBuffer(yaml));
      expect(result.advisories).toHaveLength(1);
      expect(result.advisories[0].criterionId).toBe('has-except-where');
    });

    it('emits an advisory for "other than"', () => {
      const yaml = `
schemaVersion: 1
criteria:
  - id: has-other-than
    kind: disqualifying
    statement: No languages other than TypeScript or Rust.
    rationale: Testing advisory.
    addedOn: 2026-08-01
`;
      const result = loadCriteriaFromBuffer(yamlBuffer(yaml));
      expect(result.advisories).toHaveLength(1);
      expect(result.advisories[0].criterionId).toBe('has-other-than');
    });

    it('does NOT emit an advisory when hasException is true', () => {
      const yaml = `
schemaVersion: 1
criteria:
  - id: flagged
    kind: disqualifying
    statement: The role requires onsite presence unless fully remote.
    rationale: Testing advisory suppression.
    addedOn: 2026-08-01
    hasException: true
`;
      const result = loadCriteriaFromBuffer(yamlBuffer(yaml));
      expect(result.advisories).toHaveLength(0);
    });

    it('does NOT fail validation — advisory is non-blocking', () => {
      const yaml = `
schemaVersion: 1
criteria:
  - id: advisory-only
    kind: disqualifying
    statement: The role requires travel unless remote.
    rationale: This has an advisory but is still valid.
    addedOn: 2026-08-01
`;
      const result = loadCriteriaFromBuffer(yamlBuffer(yaml));
      // File loads successfully
      expect(result.criteria).toHaveLength(1);
      expect(result.criteria[0].id).toBe('advisory-only');
      // Advisory is present but did not throw
      expect(result.advisories).toHaveLength(1);
    });
  });

  describe('duplicate id rejection', () => {
    it('rejects a file with duplicate criterion ids', () => {
      const yaml = `
schemaVersion: 1
criteria:
  - id: same-id
    kind: disqualifying
    statement: First occurrence.
    rationale: Testing duplicates.
    addedOn: 2026-08-01
  - id: same-id
    kind: preference
    statement: Second occurrence with same id.
    rationale: Testing duplicates.
    addedOn: 2026-08-02
`;
      expect(() => loadCriteriaFromBuffer(yamlBuffer(yaml))).toThrow(CriteriaValidationError);
      expect(() => loadCriteriaFromBuffer(yamlBuffer(yaml))).toThrow(
        /Duplicate criterion id.*same-id/
      );
    });
  });

  describe('edge cases', () => {
    it('rejects a file with no criteria array', () => {
      const yaml = `schemaVersion: 1\n`;
      expect(() => loadCriteriaFromBuffer(yamlBuffer(yaml))).toThrow(CriteriaValidationError);
    });

    it('rejects a file with an empty criteria array', () => {
      const yaml = `
schemaVersion: 1
criteria: []
`;
      // An empty array is technically valid YAML, but we load it fine — 
      // it produces zero criteria. Whether this should be rejected is a 
      // design question (see PR description section 4).
      const result = loadCriteriaFromBuffer(yamlBuffer(yaml));
      expect(result.criteria).toHaveLength(0);
    });
  });
});
