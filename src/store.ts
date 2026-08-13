/**
 * On-disk storage for screen records.
 *
 * screens/<id>.md is THE record. screens/index.json is a convenience index,
 * never a source of truth — if it disagrees with the markdown files, the
 * markdown wins, and it must be rebuildable from screens/*.md alone.
 */

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { ScreenFrontmatter, ScreenIndexEntry } from './types.js';

const SCREENS_DIR = 'screens';
const INDEX_FILE = join(SCREENS_DIR, 'index.json');

/**
 * Ensures the screens directory exists. Called before any write.
 */
export async function ensureScreensDir(): Promise<void> {
  await mkdir(SCREENS_DIR, { recursive: true });
}

/**
 * Reads the index file. Returns an empty array if it doesn't exist.
 */
export async function readIndex(): Promise<ScreenIndexEntry[]> {
  try {
    const raw = await readFile(INDEX_FILE, 'utf-8');
    return JSON.parse(raw) as ScreenIndexEntry[];
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

/**
 * Appends an entry to the index file (creates it if missing).
 */
export async function appendToIndex(entry: ScreenIndexEntry): Promise<void> {
  await ensureScreensDir();
  const current = await readIndex();
  current.push(entry);
  await writeFile(INDEX_FILE, JSON.stringify(current, null, 2) + '\n', 'utf-8');
}

/**
 * Extracts YAML frontmatter from a screen markdown file.
 * Frontmatter is delimited by --- on its own line.
 */
export function parseFrontmatter(content: string): ScreenFrontmatter {
  const lines = content.split('\n');
  if (lines[0] !== '---') {
    throw new Error('Screen file missing YAML frontmatter delimiter');
  }
  const endIndex = lines.indexOf('---', 1);
  if (endIndex === -1) {
    throw new Error('Screen file missing closing YAML frontmatter delimiter');
  }
  const yamlBlock = lines.slice(1, endIndex).join('\n');
  return parseYaml(yamlBlock) as ScreenFrontmatter;
}

/**
 * Rebuilds screens/index.json from screens/*.md alone.
 *
 * This is the guarantee that the index is never a source of truth:
 * delete it, call this, and get it back.
 */
export async function rebuildIndex(): Promise<ScreenIndexEntry[]> {
  await ensureScreensDir();
  const files = await readdir(SCREENS_DIR);
  const mdFiles = files.filter(f => f.endsWith('.md')).sort();

  const entries: ScreenIndexEntry[] = [];

  for (const file of mdFiles) {
    const content = await readFile(join(SCREENS_DIR, file), 'utf-8');
    const fm = parseFrontmatter(content);
    entries.push({
      id: fm.id,
      label: fm.label,
      verdict: fm.verdict,
      criteriaVersion: fm.criteriaVersion,
      screenedAt: fm.screenedAt,
    });
  }

  // Sort by screenedAt ascending (append-only order)
  entries.sort((a, b) => a.screenedAt.localeCompare(b.screenedAt));

  await writeFile(INDEX_FILE, JSON.stringify(entries, null, 2) + '\n', 'utf-8');
  return entries;
}
