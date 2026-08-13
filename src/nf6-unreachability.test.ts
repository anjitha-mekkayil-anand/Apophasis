/**
 * NF-6 enforcement: no recording or replay client is reachable from
 * any CLI code path.
 *
 * Approach: walk the static import graph starting from src/cli.ts.
 * For every .ts file reachable via import/export statements, assert
 * that no path resolves to anything in test-support/.
 *
 * This is structural enforcement — the RecordingClient lives outside
 * src/ (in test-support/), so it cannot be reached by any import chain
 * starting from the CLI entry point. This test proves that property
 * and will fail if anyone adds an import that bridges the boundary.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';

/**
 * Extract all static import paths from a TypeScript source file.
 * Matches: import ... from 'path'  and  import 'path'
 * Also matches: export ... from 'path'
 */
function extractImports(filePath: string): string[] {
  const content = readFileSync(filePath, 'utf-8');
  const importRegex = /(?:import|export)\s+.*?from\s+['"]([^'"]+)['"]/g;
  const sideEffectImport = /import\s+['"]([^'"]+)['"]/g;

  const paths: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = importRegex.exec(content)) !== null) {
    paths.push(match[1]);
  }
  while ((match = sideEffectImport.exec(content)) !== null) {
    paths.push(match[1]);
  }

  return paths;
}

/**
 * Resolve a TypeScript import path to an absolute file path.
 * Handles .js → .ts extension mapping (NodeNext resolution).
 */
function resolveImportPath(importPath: string, fromFile: string): string | null {
  // Only resolve relative imports (starting with . or ..)
  if (!importPath.startsWith('.')) {
    return null; // node_modules — not our concern
  }

  const dir = dirname(fromFile);
  let resolved = resolve(dir, importPath);

  // NodeNext: .js imports resolve to .ts source files
  if (resolved.endsWith('.js')) {
    resolved = resolved.slice(0, -3) + '.ts';
  }

  return resolved;
}

/**
 * Walk the import graph from a root file, collecting all reachable source files.
 */
function walkImportGraph(rootFile: string): Set<string> {
  const visited = new Set<string>();
  const queue = [resolve(rootFile)];

  while (queue.length > 0) {
    const current = queue.pop()!;
    if (visited.has(current)) continue;

    // Check file exists before reading
    try {
      readFileSync(current, 'utf-8');
    } catch {
      continue; // File doesn't exist — external or type-only
    }

    visited.add(current);

    const imports = extractImports(current);
    for (const imp of imports) {
      const resolved = resolveImportPath(imp, current);
      if (resolved && !visited.has(resolved)) {
        queue.push(resolved);
      }
    }
  }

  return visited;
}

describe('NF-6 — RecordingClient unreachable from CLI (structural)', () => {
  it('the CLI import graph does not reach test-support/', () => {
    const cliEntry = resolve('src/cli.ts');
    const reachable = walkImportGraph(cliEntry);

    const testSupportDir = resolve('test-support');

    for (const file of reachable) {
      expect(file.startsWith(testSupportDir)).toBe(false);
    }
  });

  it('the CLI import graph does not contain "recording" or "replay" in any reachable module name', () => {
    const cliEntry = resolve('src/cli.ts');
    const reachable = walkImportGraph(cliEntry);

    for (const file of reachable) {
      const lower = file.toLowerCase();
      expect(lower).not.toContain('recording');
      expect(lower).not.toContain('replay');
    }
  });

  it('the import graph from cli.ts includes expected production modules', () => {
    // Sanity check: the walk actually finds real modules
    const cliEntry = resolve('src/cli.ts');
    const reachable = walkImportGraph(cliEntry);

    const hasProvider = [...reachable].some(f => f.includes('provider.ts'));
    const hasCriteria = [...reachable].some(f => f.includes('criteria.ts'));
    const hasCandidate = [...reachable].some(f => f.includes('candidate.ts'));

    expect(hasProvider).toBe(true);
    expect(hasCriteria).toBe(true);
    expect(hasCandidate).toBe(true);
  });
});
