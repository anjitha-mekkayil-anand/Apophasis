/**
 * Shared candidate text decoding — §6 invariant
 *
 * ONE function produces the candidate text string from stored bytes.
 * Both the prompt builder (§5) and the verifier (§6) MUST use this function.
 *
 * If §5 decodes differently from §6, evidence that the model quoted correctly
 * will fail substring checks with no visible cause and every test still green.
 *
 * The stored bytes are the verbatim copy from §3 (AC-2.2). This function
 * decodes them to a string for use in the prompt and in verification.
 *
 * BOM handling: a UTF-8 BOM (0xEF 0xBB 0xBF) is stripped at decode time.
 * This is the ONLY normalisation applied. The bytes on disk are never modified.
 * The decision to strip here rather than at storage time means:
 *   - Storage is byte-identical (AC-2.2 satisfied)
 *   - The model never sees a BOM character (which would confuse quoting)
 *   - The verifier checks against the same BOM-stripped string the model saw
 */

const UTF8_BOM = '\uFEFF';

/**
 * Decode stored candidate bytes to the string used for prompt and verification.
 *
 * This is the single source of truth for "what text the model sees."
 * Both buildScreenPrompt and verifyFindings must receive text from this function.
 */
export function getCandidateText(storedBytes: Buffer): string {
  let text = storedBytes.toString('utf-8');

  // Strip UTF-8 BOM if present — the only normalisation applied
  if (text.startsWith(UTF8_BOM)) {
    text = text.slice(1);
  }

  return text;
}
