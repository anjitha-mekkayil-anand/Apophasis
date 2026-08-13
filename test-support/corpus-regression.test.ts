/**
 * Corpus regression tests — §10 (10.4, 10.6)
 *
 * These tests use the captured fixtures from the live run to verify
 * the pipeline produces the same verdict deterministically from
 * recorded model output.
 *
 * The fixtures were captured by RecordingClient and are labelled
 * _offlineTestOnly: true (NF-3).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseModelResponse } from '../src/parser.js';
import { verifyFindings } from '../src/verify.js';
import { assembleVerdict } from '../src/verdict.js';
import { getCandidateText } from '../src/candidate-text.js';
import { loadCriteriaFromBuffer } from '../src/criteria.js';
import type { RecordedFixture } from './recording-client.js';

const FIXTURES_DIR = 'test-support/fixtures';
const CORPUS_DIR = 'test-support/corpus';

async function loadFixture(name: string): Promise<RecordedFixture> {
  const raw = await readFile(join(FIXTURES_DIR, name), 'utf-8');
  return JSON.parse(raw) as RecordedFixture;
}

describe('corpus regression — §10', () => {
  describe('10.4 — deterministic verdict from recorded output', () => {
    it('fixture-0000 (refused candidate) produces REFUSED', async () => {
      const fixture = await loadFixture('fixture-0000.json');
      const criteriaBytes = await readFile('criteria.yaml');
      const { criteria } = loadCriteriaFromBuffer(criteriaBytes);
      const candidateBytes = await readFile(join(CORPUS_DIR, 'refused-candidate.txt'));
      const candidateText = getCandidateText(candidateBytes);

      const findings = parseModelResponse(fixture.response, criteria.length);
      const verified = verifyFindings(findings, candidateText, criteria);
      const verdict = assembleVerdict(verified, criteria);

      expect(verdict.outcome).toBe('REFUSED');
      expect(verdict.decidingCriterionIndex).toBe(0);
      expect(verdict.failedIndexes).toContain(0);
      expect(verdict.failedIndexes).toContain(1);
    });

    it('fixture-0001 (clean candidate) produces NO_DISQUALIFIER_FOUND', async () => {
      const fixture = await loadFixture('fixture-0001.json');
      const criteriaBytes = await readFile('criteria.yaml');
      const { criteria } = loadCriteriaFromBuffer(criteriaBytes);
      const candidateBytes = await readFile(join(CORPUS_DIR, 'clean-candidate.txt'));
      const candidateText = getCandidateText(candidateBytes);

      const findings = parseModelResponse(fixture.response, criteria.length);
      const verified = verifyFindings(findings, candidateText, criteria);
      const verdict = assembleVerdict(verified, criteria);

      expect(verdict.outcome).toBe('NO_DISQUALIFIER_FOUND');
      expect(verdict.incomplete).toBe(false);
    });
  });

  describe('10.6 — discriminating pair: one fails, one holds (engineering rule 3)', () => {
    it('fixture-0000 contains at least one finding with status fails', async () => {
      const fixture = await loadFixture('fixture-0000.json');
      const criteriaBytes = await readFile('criteria.yaml');
      const { criteria } = loadCriteriaFromBuffer(criteriaBytes);

      const findings = parseModelResponse(fixture.response, criteria.length);
      const failsCount = findings.filter(f => f.status === 'fails').length;
      // Engineering rule 3: no test may assert an empty result
      expect(failsCount).toBeGreaterThan(0);
    });

    it('fixture-0001 contains at least one finding with status holds', async () => {
      const fixture = await loadFixture('fixture-0001.json');
      const criteriaBytes = await readFile('criteria.yaml');
      const { criteria } = loadCriteriaFromBuffer(criteriaBytes);

      const findings = parseModelResponse(fixture.response, criteria.length);
      const holdsCount = findings.filter(f => f.status === 'holds').length;
      expect(holdsCount).toBeGreaterThan(0);
    });

    it('the pair produces different verdicts (discriminating)', async () => {
      const fixture0 = await loadFixture('fixture-0000.json');
      const fixture1 = await loadFixture('fixture-0001.json');
      const criteriaBytes = await readFile('criteria.yaml');
      const { criteria } = loadCriteriaFromBuffer(criteriaBytes);

      const findings0 = parseModelResponse(fixture0.response, criteria.length);
      const candidateBytes0 = await readFile(join(CORPUS_DIR, 'refused-candidate.txt'));
      const verified0 = verifyFindings(findings0, getCandidateText(candidateBytes0), criteria);
      const verdict0 = assembleVerdict(verified0, criteria);

      const findings1 = parseModelResponse(fixture1.response, criteria.length);
      const candidateBytes1 = await readFile(join(CORPUS_DIR, 'clean-candidate.txt'));
      const verified1 = verifyFindings(findings1, getCandidateText(candidateBytes1), criteria);
      const verdict1 = assembleVerdict(verified1, criteria);

      expect(verdict0.outcome).not.toBe(verdict1.outcome);
    });
  });

  describe('10.7 — hasException criterion with exception met (AC-3.7)', () => {
    it('model supplies holdsReason and exceptionEvidence for hasException criterion', async () => {
      const fixture = await loadFixture('fixture-0001.json');
      const criteriaBytes = await readFile('criteria.yaml');
      const { criteria } = loadCriteriaFromBuffer(criteriaBytes);

      const findings = parseModelResponse(fixture.response, criteria.length);
      // Index 0 is the hasException criterion (prod-support)
      const finding0 = findings.find(f => f.criterionIndex === 0);
      expect(finding0).toBeDefined();
      expect(finding0!.status).toBe('holds');
      expect(finding0!.holdsReason).toBe('exception-applied');
      expect(finding0!.exceptionEvidence).toBeTruthy();
    });

    it('exceptionEvidence passes verification (not demoted)', async () => {
      const fixture = await loadFixture('fixture-0001.json');
      const criteriaBytes = await readFile('criteria.yaml');
      const { criteria } = loadCriteriaFromBuffer(criteriaBytes);
      const candidateBytes = await readFile(join(CORPUS_DIR, 'clean-candidate.txt'));
      const candidateText = getCandidateText(candidateBytes);

      const findings = parseModelResponse(fixture.response, criteria.length);
      const verified = verifyFindings(findings, candidateText, criteria);
      const finding0 = verified.find(f => f.criterionIndex === 0);
      expect(finding0!.status).toBe('holds'); // not demoted to indeterminate
      expect(finding0!.demotedFrom).toBeUndefined();
    });
  });

  describe('fixtures carry _offlineTestOnly label (NF-3)', () => {
    it('both fixtures are labelled as offline test data only', async () => {
      const f0 = await loadFixture('fixture-0000.json');
      const f1 = await loadFixture('fixture-0001.json');
      expect(f0._offlineTestOnly).toBe(true);
      expect(f1._offlineTestOnly).toBe(true);
    });
  });
});
