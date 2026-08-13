/**
 * Candidate acceptance — §3
 *
 * Reads a .txt or .md file and stores it byte-identical in candidates/<id>.txt.
 * A sidecar JSON file (candidates/<id>.json) holds ingest metadata.
 *
 * CRITICAL — AC-2.2: the candidate text is NEVER modified, summarised, or
 * truncated. We copy the raw buffer. No decode-and-re-encode, no CRLF
 * normalisation, no BOM stripping, no trailing-newline insertion.
 * Evidence spans are substring-checked against this stored text in §6.
 * Any byte difference causes findings to be demoted to indeterminate
 * for no visible reason.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, extname } from 'node:path';

const CANDIDATES_DIR = 'candidates';

/** Allowed source file extensions (case-insensitive). */
const ALLOWED_EXTENSIONS = new Set(['.txt', '.md']);

/**
 * Metadata stored alongside the candidate file.
 * This is a property of the CANDIDATE, not the screen.
 * A candidate can be re-screened (AC-7.3 creates a new screen record each time),
 * but its metadata — label and ingest timestamp — are fixed at ingest.
 *
 * On a re-screen, the screen record references this candidate by id and carries
 * its own screenedAt timestamp. The label in ScreenFrontmatter is copied from
 * here at screen time — they are the same value in two places, not two concepts.
 */
export interface CandidateMetadata {
  id: string;
  label: string;
  ingestedAt: string;        // ISO 8601
  sourceExtension: string;   // original file extension, e.g. '.md'
  sourceFileName: string;    // original file name for provenance
  byteLength: number;        // stored for quick size checks without reading the file
}

/**
 * Result of accepting a candidate.
 */
export interface AcceptResult {
  id: string;
  candidateFile: string;     // relative path: candidates/<id>.txt
  metadata: CandidateMetadata;
}

/**
 * Generate a candidate id.
 *
 * Format: YYYYMMDD-HHmmss-SSS-<sanitised-label-prefix>
 *
 * Properties:
 * - Filesystem-safe: only alphanumerics and hyphens
 * - Chronologically sortable: timestamp prefix sorts lexicographically
 * - Recognisable in a directory listing: the label fragment tells you what it is
 * - Collision handling: milliseconds provide uniqueness within a single-user CLI;
 *   if two ingests happen in the same millisecond (not realistic in a manual CLI),
 *   the second would overwrite the first. For a single-user tool this is acceptable;
 *   a UUID suffix would be the fix if it ever mattered.
 */
export function generateCandidateId(label: string, now: Date = new Date()): string {
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const pad3 = (n: number) => String(n).padStart(3, '0');

  const ts =
    `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}` +
    `-${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}` +
    `-${pad3(now.getMilliseconds())}`;

  // Sanitise label: lowercase, replace non-alphanumeric runs with hyphen, truncate
  const sanitised = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

  return sanitised ? `${ts}-${sanitised}` : ts;
}

/**
 * Accept a candidate file.
 *
 * 1. Validates the extension is .txt or .md
 * 2. Reads the file as a raw Buffer (no decoding)
 * 3. Generates an id
 * 4. Writes the buffer byte-identical to candidates/<id>.txt
 * 5. Writes a sidecar JSON with metadata
 *
 * @throws Error if the file extension is not allowed
 */
export async function acceptCandidate(
  filePath: string,
  label: string,
  now: Date = new Date(),
): Promise<AcceptResult> {
  // Validate extension — only .txt and .md accepted
  const ext = extname(filePath).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(
      `Rejected: "${filePath}" has extension "${ext}". ` +
      `Only .txt and .md files are accepted.`
    );
  }

  // Read as raw buffer — no encoding conversion, no normalisation (AC-2.2)
  const rawBytes = await readFile(filePath);

  // Generate id
  const id = generateCandidateId(label, now);

  // Ensure candidates directory exists
  await mkdir(CANDIDATES_DIR, { recursive: true });

  // Write candidate file — byte-identical copy (AC-2.1, AC-2.2)
  const candidateFileName = `${id}.txt`;
  const candidatePath = join(CANDIDATES_DIR, candidateFileName);
  await writeFile(candidatePath, rawBytes);

  // Build metadata — AC-2.3
  const metadata: CandidateMetadata = {
    id,
    label,
    ingestedAt: now.toISOString(),
    sourceExtension: ext,
    sourceFileName: filePath.split('/').pop() ?? filePath,
    byteLength: rawBytes.length,
  };

  // Write sidecar — candidates/<id>.json
  const metadataPath = join(CANDIDATES_DIR, `${id}.json`);
  await writeFile(metadataPath, JSON.stringify(metadata, null, 2) + '\n', 'utf-8');

  return {
    id,
    candidateFile: join(CANDIDATES_DIR, candidateFileName),
    metadata,
  };
}

/**
 * Read candidate metadata from its sidecar file.
 */
export async function readCandidateMetadata(id: string): Promise<CandidateMetadata> {
  const metadataPath = join(CANDIDATES_DIR, `${id}.json`);
  const raw = await readFile(metadataPath, 'utf-8');
  return JSON.parse(raw) as CandidateMetadata;
}

/**
 * Read the stored candidate bytes.
 * Returns a Buffer — the exact bytes that were stored at ingest time.
 */
export async function readCandidateBytes(id: string): Promise<Buffer> {
  const candidatePath = join(CANDIDATES_DIR, `${id}.txt`);
  return readFile(candidatePath);
}
