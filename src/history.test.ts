import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rm, readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { persistScreen, readScreen, listScreens, generateScreenId } from './history.js';
import { rebuildIndex } from './store.js';
import type { Finding, Criterion, Verdict, ScreenFrontmatter } from './types.js';

const SCREENS_DIR = 'screens';

const CRITERIA: Criterion[] = [
  { id: 'prod-support', kind: 'disqualifying', statement: 'Production support role.', rationale: 'Ruled out.', addedOn: '2026-08-03', hasException: true },
  { id: 'onsite-required', kind: 'disqualifying', statement: 'Onsite required.', rationale: 'Commute.', addedOn: '2026-07-09' },
  { id: 'legacy-only', kind: 'preference', statement: 'Maintenance-only stack.', rationale: 'Slows track.', addedOn: '2026-08-13' },
];

describe('history — §9', () => {
  beforeEach(async () => {
    await rm(SCREENS_DIR, { recursive: true, force: true });
  });

  afterEach(async () => {
    await rm(SCREENS_DIR, { recursive: true, force: true });
  });

  describe('generateScreenId', () => {
    it('produces a screen-prefixed timestamp id', () => {
      const now = new Date('2026-08-13T14:30:45.123Z');
      const id = generateScreenId(now);
      expect(id).toBe('screen-20260813-143045-123');
    });

    it('two calls at different times produce different ids', () => {
      const id1 = generateScreenId(new Date('2026-08-13T10:00:00.000Z'));
      const id2 = generateScreenId(new Date('2026-08-13T10:00:01.000Z'));
      expect(id1).not.toBe(id2);
    });
  });

  describe('9.1 — persist screen record (AC-7.1, AC-7.2, NF-7)', () => {
    it('writes a screen file with YAML frontmatter and rendered body', async () => {
      const verdict: Verdict = {
        outcome: 'REFUSED',
        decidingCriterionIndex: 0,
        failedIndexes: [0],
        unevaluatedIndexes: [],
        incomplete: false,
      };
      const findings: Finding[] = [
        { criterionIndex: 0, status: 'fails', evidence: 'owning L2/L3 escalations' },
        { criterionIndex: 1, status: 'holds' },
        { criterionIndex: 2, status: 'holds' },
      ];

      const { screenId, filePath } = await persistScreen({
        verdict,
        findings,
        criteria: CRITERIA,
        label: 'test-role',
        candidateFile: 'candidates/some-id.txt',
        criteriaVersion: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        now: new Date('2026-08-13T14:30:00.000Z'),
      });

      expect(screenId).toBe('screen-20260813-143000-000');
      const raw = await readFile(filePath, 'utf-8');
      expect(raw).toContain('---');
      expect(raw).toContain('REFUSED');
      expect(raw).toContain('owning L2/L3 escalations');
    });

    it('frontmatter is valid YAML and contains full findings (no truncation)', async () => {
      const longEvidence = 'x'.repeat(500); // longer than render truncation limit
      const verdict: Verdict = {
        outcome: 'REFUSED',
        decidingCriterionIndex: 0,
        failedIndexes: [0],
        unevaluatedIndexes: [],
        incomplete: false,
      };
      const findings: Finding[] = [
        { criterionIndex: 0, status: 'fails', evidence: longEvidence },
        { criterionIndex: 1, status: 'holds' },
        { criterionIndex: 2, status: 'holds' },
      ];

      const { filePath } = await persistScreen({
        verdict,
        findings,
        criteria: CRITERIA,
        label: 'truncation-test',
        candidateFile: 'candidates/trunc.txt',
        criteriaVersion: 'aaaa' + '0'.repeat(60),
        now: new Date('2026-08-13T15:00:00.000Z'),
      });

      const raw = await readFile(filePath, 'utf-8');
      // Frontmatter has the FULL evidence (no truncation)
      const lines = raw.split('\n');
      const endIdx = lines.indexOf('---', 1);
      const yamlBlock = lines.slice(1, endIdx).join('\n');
      const fm = parseYaml(yamlBlock) as ScreenFrontmatter;
      expect(fm.findings[0].evidence).toBe(longEvidence);

      // Body has truncated version
      const body = lines.slice(endIdx + 1).join('\n');
      expect(body).not.toContain(longEvidence);
      expect(body).toContain('...');
    });

    it('appends to screens/index.json', async () => {
      await persistScreen({
        verdict: { outcome: 'NO_DISQUALIFIER_FOUND', failedIndexes: [], unevaluatedIndexes: [], incomplete: false },
        findings: CRITERIA.map((_, i) => ({ criterionIndex: i, status: 'holds' as const })),
        criteria: CRITERIA,
        label: 'index-test',
        candidateFile: 'candidates/idx.txt',
        criteriaVersion: 'bbbb' + '0'.repeat(60),
        now: new Date('2026-08-13T16:00:00.000Z'),
      });

      const screens = await listScreens();
      expect(screens).toHaveLength(1);
      expect(screens[0].label).toBe('index-test');
      expect(screens[0].verdict).toBe('NO_DISQUALIFIER_FOUND');
    });
  });

  describe('9.2 — readable without the application (AC-7.2, NF-1)', () => {
    it('screen file starts with YAML frontmatter and has human-readable body', async () => {
      const { filePath } = await persistScreen({
        verdict: { outcome: 'NO_DISQUALIFIER_FOUND', failedIndexes: [], unevaluatedIndexes: [], incomplete: false },
        findings: CRITERIA.map((_, i) => ({ criterionIndex: i, status: 'holds' as const })),
        criteria: CRITERIA,
        label: 'readable-test',
        candidateFile: 'candidates/read.txt',
        criteriaVersion: 'cccc' + '0'.repeat(60),
        now: new Date('2026-08-13T17:00:00.000Z'),
      });

      const raw = await readFile(filePath, 'utf-8');
      expect(raw.startsWith('---\n')).toBe(true);
      expect(raw).toContain('NO DISQUALIFIER FOUND');
      expect(raw).toContain('This is not a recommendation');
    });
  });

  describe('9.3 — append-only, re-screen creates new record (AC-7.3)', () => {
    it('screening the same candidate twice creates two different screen records', async () => {
      const sharedInput = {
        verdict: { outcome: 'NO_DISQUALIFIER_FOUND' as const, failedIndexes: [] as number[], unevaluatedIndexes: [] as number[], incomplete: false },
        findings: CRITERIA.map((_, i) => ({ criterionIndex: i, status: 'holds' as const })),
        criteria: CRITERIA,
        label: 'same-candidate',
        candidateFile: 'candidates/same-id.txt', // same candidate
        criteriaVersion: 'dddd' + '0'.repeat(60),
      };

      const { screenId: id1 } = await persistScreen({ ...sharedInput, now: new Date('2026-08-13T18:00:00.000Z') });
      const { screenId: id2 } = await persistScreen({ ...sharedInput, now: new Date('2026-08-13T18:00:01.000Z') });

      // Two different screen ids
      expect(id1).not.toBe(id2);

      // Both files exist
      const s1 = await readScreen(id1);
      const s2 = await readScreen(id2);
      expect(s1.frontmatter.id).toBe(id1);
      expect(s2.frontmatter.id).toBe(id2);
      // Same candidate referenced
      expect(s1.frontmatter.candidateFile).toBe(s2.frontmatter.candidateFile);
    });
  });

  describe('9.4 — history subcommand: list and read', () => {
    it('listScreens returns all persisted screens', async () => {
      await persistScreen({
        verdict: { outcome: 'REFUSED', decidingCriterionIndex: 0, failedIndexes: [0], unevaluatedIndexes: [], incomplete: false },
        findings: [
          { criterionIndex: 0, status: 'fails', evidence: 'ev' },
          { criterionIndex: 1, status: 'holds' },
          { criterionIndex: 2, status: 'holds' },
        ],
        criteria: CRITERIA,
        label: 'list-test-1',
        candidateFile: 'candidates/l1.txt',
        criteriaVersion: 'eeee' + '0'.repeat(60),
        now: new Date('2026-08-13T19:00:00.000Z'),
      });
      await persistScreen({
        verdict: { outcome: 'NO_DISQUALIFIER_FOUND', failedIndexes: [], unevaluatedIndexes: [], incomplete: false },
        findings: CRITERIA.map((_, i) => ({ criterionIndex: i, status: 'holds' as const })),
        criteria: CRITERIA,
        label: 'list-test-2',
        candidateFile: 'candidates/l2.txt',
        criteriaVersion: 'ffff' + '0'.repeat(60),
        now: new Date('2026-08-13T19:01:00.000Z'),
      });

      const screens = await listScreens();
      expect(screens).toHaveLength(2);
    });

    it('readScreen returns full frontmatter and raw content', async () => {
      const { screenId } = await persistScreen({
        verdict: { outcome: 'REFUSED', decidingCriterionIndex: 0, failedIndexes: [0], unevaluatedIndexes: [], incomplete: false },
        findings: [
          { criterionIndex: 0, status: 'fails', evidence: 'some evidence here' },
          { criterionIndex: 1, status: 'holds' },
          { criterionIndex: 2, status: 'holds' },
        ],
        criteria: CRITERIA,
        label: 'read-test',
        candidateFile: 'candidates/r1.txt',
        criteriaVersion: '1111' + '0'.repeat(60),
        now: new Date('2026-08-13T20:00:00.000Z'),
      });

      const { frontmatter, raw } = await readScreen(screenId);
      expect(frontmatter.verdict).toBe('REFUSED');
      expect(frontmatter.findings[0].evidence).toBe('some evidence here');
      expect(raw).toContain('REFUSED - read-test');
    });
  });

  describe('YAML special characters in evidence — round-trip correctness', () => {
    it('evidence containing colon, ---, leading hyphen, and quotes survives round-trip', async () => {
      // This is the critical test: hand-building YAML would corrupt these
      const nastyEvidence = 'key: value with a colon\n---\n- leading hyphen\n"quoted text" and \'single quotes\'';
      const verdict: Verdict = {
        outcome: 'REFUSED',
        decidingCriterionIndex: 0,
        failedIndexes: [0],
        unevaluatedIndexes: [],
        incomplete: false,
      };
      const findings: Finding[] = [
        { criterionIndex: 0, status: 'fails', evidence: nastyEvidence },
        { criterionIndex: 1, status: 'holds' },
        { criterionIndex: 2, status: 'holds' },
      ];

      const { screenId } = await persistScreen({
        verdict,
        findings,
        criteria: CRITERIA,
        label: 'yaml-special-chars',
        candidateFile: 'candidates/special.txt',
        criteriaVersion: '2222' + '0'.repeat(60),
        now: new Date('2026-08-13T21:00:00.000Z'),
      });

      // Read back and compare field by field
      const { frontmatter } = await readScreen(screenId);
      expect(frontmatter.findings[0].evidence).toBe(nastyEvidence);
      expect(frontmatter.findings[0].status).toBe('fails');
      expect(frontmatter.label).toBe('yaml-special-chars');
      expect(frontmatter.verdict).toBe('REFUSED');
    });

    it('evidence with trailing spaces and tabs survives', async () => {
      const spacey = 'sentence with trailing spaces   \tand a tab';
      const { screenId } = await persistScreen({
        verdict: { outcome: 'REFUSED', decidingCriterionIndex: 0, failedIndexes: [0], unevaluatedIndexes: [], incomplete: false },
        findings: [
          { criterionIndex: 0, status: 'fails', evidence: spacey },
          { criterionIndex: 1, status: 'holds' },
          { criterionIndex: 2, status: 'holds' },
        ],
        criteria: CRITERIA,
        label: 'spacey-test',
        candidateFile: 'candidates/spacey.txt',
        criteriaVersion: '3333' + '0'.repeat(60),
        now: new Date('2026-08-13T22:00:00.000Z'),
      });

      const { frontmatter } = await readScreen(screenId);
      expect(frontmatter.findings[0].evidence).toBe(spacey);
    });
  });

  describe('rebuildIndex against real screen files', () => {
    it('rebuildIndex produces correct index from files written by persistScreen', async () => {
      // Write two real screens
      await persistScreen({
        verdict: { outcome: 'REFUSED', decidingCriterionIndex: 0, failedIndexes: [0], unevaluatedIndexes: [], incomplete: false },
        findings: [
          { criterionIndex: 0, status: 'fails', evidence: 'evidence1' },
          { criterionIndex: 1, status: 'holds' },
          { criterionIndex: 2, status: 'holds' },
        ],
        criteria: CRITERIA,
        label: 'rebuild-test-1',
        candidateFile: 'candidates/rb1.txt',
        criteriaVersion: '4444' + '0'.repeat(60),
        now: new Date('2026-08-13T23:00:00.000Z'),
      });
      await persistScreen({
        verdict: { outcome: 'NO_DISQUALIFIER_FOUND', failedIndexes: [], unevaluatedIndexes: [2], incomplete: false },
        findings: [
          { criterionIndex: 0, status: 'holds', holdsReason: 'not-violated' },
          { criterionIndex: 1, status: 'holds' },
          { criterionIndex: 2, status: 'indeterminate' },
        ],
        criteria: CRITERIA,
        label: 'rebuild-test-2',
        candidateFile: 'candidates/rb2.txt',
        criteriaVersion: '5555' + '0'.repeat(60),
        now: new Date('2026-08-13T23:01:00.000Z'),
      });

      // Get the current index
      const beforeRebuild = await listScreens();
      expect(beforeRebuild).toHaveLength(2);

      // Delete index and rebuild from .md files only
      const { rm: rmFile } = await import('node:fs/promises');
      await rmFile(join(SCREENS_DIR, 'index.json'));

      const rebuilt = await rebuildIndex();
      expect(rebuilt).toHaveLength(2);
      expect(rebuilt[0].label).toBe('rebuild-test-1');
      expect(rebuilt[0].verdict).toBe('REFUSED');
      expect(rebuilt[1].label).toBe('rebuild-test-2');
      expect(rebuilt[1].verdict).toBe('NO_DISQUALIFIER_FOUND');
    });
  });
});
