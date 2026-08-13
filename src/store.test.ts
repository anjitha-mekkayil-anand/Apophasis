import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stringify as toYaml } from 'yaml';
import { rebuildIndex, appendToIndex, readIndex, parseFrontmatter } from './store.js';
import type { ScreenFrontmatter, ScreenIndexEntry } from './types.js';

const SCREENS_DIR = 'screens';
const INDEX_FILE = join(SCREENS_DIR, 'index.json');

const sampleFrontmatter: ScreenFrontmatter = {
  id: 'test-screen-001',
  label: 'senior-dotnet-role-acme',
  candidateFile: 'candidates/test-screen-001.txt',
  criteriaVersion: '4f2a1b3c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a',
  screenedAt: '2026-08-13T10:00:00.000Z',
  verdict: 'REFUSED',
  decidingCriterionIndex: 0,
  incomplete: false,
  findings: [
    { criterionIndex: 0, status: 'fails', evidence: 'owning L2/L3 escalations for the platform' },
    { criterionIndex: 1, status: 'holds' },
    { criterionIndex: 2, status: 'fails', evidence: 'maintaining the existing billing platform' },
  ],
};

function buildScreenMarkdown(fm: ScreenFrontmatter): string {
  const yamlBlock = toYaml(fm);
  return `---\n${yamlBlock}---\n\n# Screen: ${fm.label}\n\nVerdict: ${fm.verdict}\n`;
}

describe('store', () => {
  beforeEach(async () => {
    // Clean slate
    await rm(SCREENS_DIR, { recursive: true, force: true });
    await mkdir(SCREENS_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(SCREENS_DIR, { recursive: true, force: true });
  });

  describe('parseFrontmatter', () => {
    it('extracts YAML frontmatter from a screen markdown file', () => {
      const md = buildScreenMarkdown(sampleFrontmatter);
      const parsed = parseFrontmatter(md);
      expect(parsed.id).toBe(sampleFrontmatter.id);
      expect(parsed.verdict).toBe('REFUSED');
      expect(parsed.findings).toHaveLength(3);
      expect(parsed.findings[0].status).toBe('fails');
    });

    it('throws when frontmatter delimiter is missing', () => {
      expect(() => parseFrontmatter('no frontmatter here')).toThrow(
        'Screen file missing YAML frontmatter delimiter'
      );
    });
  });

  describe('appendToIndex / readIndex', () => {
    it('creates index and appends entries', async () => {
      const entry: ScreenIndexEntry = {
        id: sampleFrontmatter.id,
        label: sampleFrontmatter.label,
        verdict: sampleFrontmatter.verdict,
        criteriaVersion: sampleFrontmatter.criteriaVersion,
        screenedAt: sampleFrontmatter.screenedAt,
      };

      await appendToIndex(entry);
      const index = await readIndex();
      expect(index).toHaveLength(1);
      expect(index[0].id).toBe('test-screen-001');
      expect(index[0].verdict).toBe('REFUSED');
    });

    it('returns empty array when index does not exist', async () => {
      await rm(INDEX_FILE, { force: true });
      const index = await readIndex();
      expect(index).toEqual([]);
    });
  });

  describe('rebuildIndex', () => {
    it('deletes the index, rebuilds from .md files, and matches the original', async () => {
      // Write a screen markdown file
      const md = buildScreenMarkdown(sampleFrontmatter);
      await writeFile(join(SCREENS_DIR, `${sampleFrontmatter.id}.md`), md, 'utf-8');

      // Write a second screen
      const fm2: ScreenFrontmatter = {
        ...sampleFrontmatter,
        id: 'test-screen-002',
        label: 'platform-engineer-role-beta',
        screenedAt: '2026-08-13T11:00:00.000Z',
        verdict: 'NO_DISQUALIFIER_FOUND',
        decidingCriterionIndex: undefined,
        incomplete: false,
        findings: [
          { criterionIndex: 0, status: 'holds', exceptionEvidence: 'architecture-track with prod support under 10%' },
          { criterionIndex: 1, status: 'holds' },
          { criterionIndex: 2, status: 'holds' },
        ],
      };
      await writeFile(join(SCREENS_DIR, `${fm2.id}.md`), buildScreenMarkdown(fm2), 'utf-8');

      // Build the expected index from the two files
      const expectedIndex: ScreenIndexEntry[] = [
        {
          id: sampleFrontmatter.id,
          label: sampleFrontmatter.label,
          verdict: sampleFrontmatter.verdict,
          criteriaVersion: sampleFrontmatter.criteriaVersion,
          screenedAt: sampleFrontmatter.screenedAt,
        },
        {
          id: fm2.id,
          label: fm2.label,
          verdict: fm2.verdict,
          criteriaVersion: fm2.criteriaVersion,
          screenedAt: fm2.screenedAt,
        },
      ];

      // Write an index, then delete it, rebuild, and assert match
      await writeFile(INDEX_FILE, JSON.stringify(expectedIndex, null, 2) + '\n', 'utf-8');
      await rm(INDEX_FILE);

      const rebuilt = await rebuildIndex();
      expect(rebuilt).toEqual(expectedIndex);

      // Also verify the file was written
      const fileContent = await readFile(INDEX_FILE, 'utf-8');
      const fromFile = JSON.parse(fileContent) as ScreenIndexEntry[];
      expect(fromFile).toEqual(expectedIndex);
    });
  });
});
