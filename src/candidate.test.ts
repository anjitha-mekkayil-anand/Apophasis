import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, rm, readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  acceptCandidate,
  generateCandidateId,
  readCandidateMetadata,
  readCandidateBytes,
} from './candidate.js';

const CANDIDATES_DIR = 'candidates';
const TEST_DIR = 'test-input';

describe('candidate accept — §3', () => {
  beforeEach(async () => {
    await rm(CANDIDATES_DIR, { recursive: true, force: true });
    await rm(TEST_DIR, { recursive: true, force: true });
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(CANDIDATES_DIR, { recursive: true, force: true });
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe('generateCandidateId', () => {
    it('produces a filesystem-safe, chronologically sortable id', () => {
      const now = new Date('2026-08-13T14:30:45.123Z');
      const id = generateCandidateId('Senior .NET Role @ Acme', now);
      // Format: YYYYMMDD-HHmmss-SSS-sanitised-label
      expect(id).toBe('20260813-143045-123-senior-net-role-acme');
    });

    it('handles a label with only special characters', () => {
      const now = new Date('2026-08-13T14:30:45.000Z');
      const id = generateCandidateId('!!!@@@###', now);
      // Falls back to timestamp only
      expect(id).toBe('20260813-143045-000');
    });

    it('truncates long labels at 40 characters', () => {
      const now = new Date('2026-08-13T14:30:45.000Z');
      const longLabel = 'a'.repeat(100);
      const id = generateCandidateId(longLabel, now);
      // Timestamp (19) + hyphen (1) + label (40) = 60 max
      const labelPart = id.slice(20); // after "YYYYMMDD-HHmmss-SSS-"
      expect(labelPart.length).toBeLessThanOrEqual(40);
    });

    it('earlier timestamps sort before later timestamps', () => {
      const id1 = generateCandidateId('a', new Date('2026-08-13T10:00:00.000Z'));
      const id2 = generateCandidateId('a', new Date('2026-08-13T10:00:01.000Z'));
      expect(id1 < id2).toBe(true);
    });
  });

  describe('3.1 — byte-identical storage (AC-2.1, AC-2.2)', () => {
    it('stores a .txt file byte-identical', async () => {
      const content = 'Hello, world!\nThis is a test.\n';
      const sourcePath = join(TEST_DIR, 'test.txt');
      await writeFile(sourcePath, content, 'utf-8');

      const result = await acceptCandidate(sourcePath, 'test-label');
      const stored = await readFile(join(CANDIDATES_DIR, `${result.id}.txt`));
      const source = await readFile(sourcePath);

      expect(Buffer.compare(stored, source)).toBe(0);
    });

    it('stores a .md file byte-identical', async () => {
      const content = '# Role Description\n\nSome markdown content.\n';
      const sourcePath = join(TEST_DIR, 'role.md');
      await writeFile(sourcePath, content, 'utf-8');

      const result = await acceptCandidate(sourcePath, 'markdown-test');
      const stored = await readFile(join(CANDIDATES_DIR, `${result.id}.txt`));
      const source = await readFile(sourcePath);

      expect(Buffer.compare(stored, source)).toBe(0);
    });

    it('preserves CRLF line endings byte-identical (AC-2.2)', async () => {
      // CRLF content — must NOT be normalised to LF
      const crlf = Buffer.from('Line one\r\nLine two\r\nLine three\r\n', 'utf-8');
      const sourcePath = join(TEST_DIR, 'crlf.txt');
      await writeFile(sourcePath, crlf);

      const result = await acceptCandidate(sourcePath, 'crlf-test');
      const stored = await readFile(join(CANDIDATES_DIR, `${result.id}.txt`));

      // Byte-identical comparison — NOT string equality
      expect(Buffer.compare(stored, crlf)).toBe(0);
      // Verify CRLF bytes are actually present
      expect(stored.includes(Buffer.from('\r\n'))).toBe(true);
    });

    it('preserves a UTF-8 BOM byte-identical (AC-2.2)', async () => {
      // UTF-8 BOM (0xEF 0xBB 0xBF) followed by content
      const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
      const text = Buffer.from('BOM content here\n', 'utf-8');
      const withBom = Buffer.concat([bom, text]);
      const sourcePath = join(TEST_DIR, 'bom.txt');
      await writeFile(sourcePath, withBom);

      const result = await acceptCandidate(sourcePath, 'bom-test');
      const stored = await readFile(join(CANDIDATES_DIR, `${result.id}.txt`));

      expect(Buffer.compare(stored, withBom)).toBe(0);
      // BOM is present in stored bytes
      expect(stored[0]).toBe(0xEF);
      expect(stored[1]).toBe(0xBB);
      expect(stored[2]).toBe(0xBF);
    });

    it('preserves non-ASCII characters byte-identical (AC-2.2)', async () => {
      // Mix of CRLF, BOM, and non-ASCII — the combined case
      const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
      const text = Buffer.from(
        'Rôle: développeur senior\r\n' +
        'Salaire: €85 000\r\n' +
        'Emplacement: München\r\n',
        'utf-8'
      );
      const combined = Buffer.concat([bom, text]);
      const sourcePath = join(TEST_DIR, 'combined.txt');
      await writeFile(sourcePath, combined);

      const result = await acceptCandidate(sourcePath, 'combined-test');
      const stored = await readFile(join(CANDIDATES_DIR, `${result.id}.txt`));

      // THE critical assertion: stored bytes are IDENTICAL to source bytes
      expect(Buffer.compare(stored, combined)).toBe(0);
    });
  });

  describe('3.2 — ingest timestamp and label (AC-2.3)', () => {
    it('stores timestamp in ISO 8601 format', async () => {
      const sourcePath = join(TEST_DIR, 'meta.txt');
      await writeFile(sourcePath, 'content', 'utf-8');

      const now = new Date('2026-08-13T14:30:45.123Z');
      const result = await acceptCandidate(sourcePath, 'meta-test', now);

      expect(result.metadata.ingestedAt).toBe('2026-08-13T14:30:45.123Z');
    });

    it('stores the user-supplied label exactly', async () => {
      const sourcePath = join(TEST_DIR, 'label.txt');
      await writeFile(sourcePath, 'content', 'utf-8');

      const result = await acceptCandidate(sourcePath, 'Senior .NET Role @ Acme Corp');
      expect(result.metadata.label).toBe('Senior .NET Role @ Acme Corp');
    });

    it('metadata is retrievable from the sidecar file', async () => {
      const sourcePath = join(TEST_DIR, 'sidecar.txt');
      await writeFile(sourcePath, 'test content', 'utf-8');

      const now = new Date('2026-08-13T12:00:00.000Z');
      const result = await acceptCandidate(sourcePath, 'sidecar-label', now);

      const metadata = await readCandidateMetadata(result.id);
      expect(metadata.id).toBe(result.id);
      expect(metadata.label).toBe('sidecar-label');
      expect(metadata.ingestedAt).toBe('2026-08-13T12:00:00.000Z');
      expect(metadata.sourceExtension).toBe('.txt');
      expect(metadata.byteLength).toBe(12); // 'test content' = 12 bytes
    });

    it('stores the original file name for provenance', async () => {
      const sourcePath = join(TEST_DIR, 'original-name.md');
      await writeFile(sourcePath, '# content', 'utf-8');

      const result = await acceptCandidate(sourcePath, 'provenance-test');
      expect(result.metadata.sourceFileName).toBe('original-name.md');
    });
  });

  describe('3.4 — non-text file rejection', () => {
    it('rejects a .pdf file with a message naming the extension', async () => {
      const sourcePath = join(TEST_DIR, 'resume.pdf');
      await writeFile(sourcePath, 'fake pdf content', 'utf-8');

      await expect(acceptCandidate(sourcePath, 'pdf-test'))
        .rejects.toThrow(/\.pdf/);
      await expect(acceptCandidate(sourcePath, 'pdf-test'))
        .rejects.toThrow(/Only .txt and .md/);
    });

    it('rejects a .docx file', async () => {
      const sourcePath = join(TEST_DIR, 'doc.docx');
      await writeFile(sourcePath, 'fake docx', 'utf-8');

      await expect(acceptCandidate(sourcePath, 'docx-test'))
        .rejects.toThrow(/\.docx/);
    });

    it('rejects a file with no extension', async () => {
      const sourcePath = join(TEST_DIR, 'noext');
      await writeFile(sourcePath, 'no extension', 'utf-8');

      await expect(acceptCandidate(sourcePath, 'noext-test'))
        .rejects.toThrow(/Only .txt and .md/);
    });

    it('accepts .TXT (case-insensitive)', async () => {
      const sourcePath = join(TEST_DIR, 'UPPER.TXT');
      await writeFile(sourcePath, 'upper case ext', 'utf-8');

      const result = await acceptCandidate(sourcePath, 'upper-test');
      expect(result.id).toBeTruthy();
    });
  });

  describe('readCandidateBytes', () => {
    it('returns the exact stored bytes', async () => {
      const content = Buffer.from('stored bytes\r\nwith CRLF', 'utf-8');
      const sourcePath = join(TEST_DIR, 'bytes.txt');
      await writeFile(sourcePath, content);

      const result = await acceptCandidate(sourcePath, 'bytes-test');
      const retrieved = await readCandidateBytes(result.id);

      expect(Buffer.compare(retrieved, content)).toBe(0);
    });
  });
});
