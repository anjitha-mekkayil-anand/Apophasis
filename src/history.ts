/**
 * History — §9
 *
 * Persists screen records and provides read access.
 * Writes are the only I/O here. No model, no network.
 *
 * Screen id ≠ candidate id. AC-7.3 says a re-screen creates a new record.
 * If the screen file were named from the candidate id, re-screening would
 * overwrite. Screen ids are independent and timestamp-based.
 *
 * Frontmatter is serialised with the `yaml` package — never string-concatenated.
 * Evidence may contain colons, dashes, `---` lines, quote characters, and
 * trailing spaces. Hand-building YAML would corrupt the record.
 */

import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { stringify as toYaml } from 'yaml';
import { renderScreen, type RenderInput } from './render.js';
import { parseFrontmatter, appendToIndex, readIndex } from './store.js';
import type { ScreenFrontmatter, ScreenIndexEntry, Finding, Criterion, Verdict } from './types.js';

const SCREENS_DIR = 'screens';

/**
 * Generate a screen id.
 *
 * Format: screen-YYYYMMDD-HHmmss-SSS
 *
 * Separate from candidate id: a re-screen of the same candidate produces
 * a new screen id (AC-7.3). The 'screen-' prefix distinguishes at a glance
 * in directory listings.
 */
export function generateScreenId(now: Date = new Date()): string {
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const pad3 = (n: number) => String(n).padStart(3, '0');

  return `screen-${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}` +
    `-${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}` +
    `-${pad3(now.getMilliseconds())}`;
}

/**
 * Persist a screen record.
 *
 * 1. Generates a screen id
 * 2. Builds ScreenFrontmatter (full findings, no truncation)
 * 3. Renders the human-readable body (may truncate evidence for display)
 * 4. Writes screens/<id>.md (YAML frontmatter + body)
 * 5. Appends to screens/index.json
 *
 * The markdown file is THE record. The index is a convenience.
 */
export async function persistScreen(input: {
  verdict: Verdict;
  findings: Finding[];
  criteria: Criterion[];
  label: string;
  candidateFile: string;
  criteriaVersion: string;
  now?: Date;
}): Promise<{ screenId: string; filePath: string }> {
  const now = input.now ?? new Date();
  const screenId = generateScreenId(now);
  const screenedAt = now.toISOString();

  // Build the frontmatter — FULL findings, no truncation (AC-7.1)
  const frontmatter: ScreenFrontmatter = {
    id: screenId,
    label: input.label,
    candidateFile: input.candidateFile,
    criteriaVersion: input.criteriaVersion,
    screenedAt,
    verdict: input.verdict.outcome,
    decidingCriterionIndex: input.verdict.decidingCriterionIndex,
    incomplete: input.verdict.incomplete,
    findings: input.findings,
  };

  // Render the human-readable body (may abbreviate long quotes)
  const renderInput: RenderInput = {
    verdict: input.verdict,
    findings: input.findings,
    criteria: input.criteria,
    label: input.label,
    criteriaVersion: input.criteriaVersion,
    screenedAt,
  };
  const body = renderScreen(renderInput);

  // Serialise frontmatter with the yaml package — never concatenated by hand.
  // This handles colons, dashes, --- lines, quotes, and trailing spaces in evidence.
  const yamlBlock = toYaml(frontmatter, { lineWidth: 0 });
  const fileContent = `---\n${yamlBlock}---\n\n${body}\n`;

  // Write the screen file
  await mkdir(SCREENS_DIR, { recursive: true });
  const filePath = join(SCREENS_DIR, `${screenId}.md`);
  await writeFile(filePath, fileContent, 'utf-8');

  // Append to index
  const indexEntry: ScreenIndexEntry = {
    id: screenId,
    label: input.label,
    verdict: input.verdict.outcome,
    criteriaVersion: input.criteriaVersion,
    screenedAt,
  };
  await appendToIndex(indexEntry);

  return { screenId, filePath };
}

/**
 * List all screens from the index.
 */
export async function listScreens(): Promise<ScreenIndexEntry[]> {
  return readIndex();
}

/**
 * Read a specific screen by id.
 * Returns the full parsed frontmatter (authoritative) and the raw file content.
 */
export async function readScreen(screenId: string): Promise<{
  frontmatter: ScreenFrontmatter;
  raw: string;
}> {
  const filePath = join(SCREENS_DIR, `${screenId}.md`);
  const raw = await readFile(filePath, 'utf-8');
  const frontmatter = parseFrontmatter(raw);
  return { frontmatter, raw };
}

/**
 * List screen files on disk (authoritative source, not index).
 */
export async function listScreenFiles(): Promise<string[]> {
  try {
    const files = await readdir(SCREENS_DIR);
    return files.filter(f => f.endsWith('.md')).sort();
  } catch {
    return [];
  }
}
