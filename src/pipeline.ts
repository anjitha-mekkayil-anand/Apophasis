/**
 * Pipeline orchestrator — §10 (task 8.5: decode invariant enforcement)
 *
 * Wires the full screening pipeline:
 *   loadCriteria → acceptCandidate → getCandidateText → buildScreenPrompt
 *   → client.complete → parseModelResponse → verifyFindings → assembleVerdict
 *   → renderScreen → persistScreen
 *
 * ★ DECODE INVARIANT (task 8.5): `getCandidateText` is called ONCE. The resulting
 * string is stored in ONE variable (`candidateText`). That same variable is passed
 * to both `buildScreenPrompt` and `verifyFindings`. No other code path decodes
 * candidate bytes in this pipeline. This is the point where the invariant becomes
 * enforced rather than merely prepared.
 */

import { readFile } from 'node:fs/promises';
import { loadCriteria } from './criteria.js';
import { acceptCandidate, readCandidateBytes } from './candidate.js';
import { getCandidateText } from './candidate-text.js';
import { buildScreenPrompt } from './prompt.js';
import { parseModelResponse } from './parser.js';
import { verifyFindings } from './verify.js';
import { assembleVerdict } from './verdict.js';
import { renderScreen, type RenderInput } from './render.js';
import { persistScreen } from './history.js';
import type { ModelClient } from './provider.js';
import type { Finding, Criterion, Verdict } from './types.js';

export interface PipelineResult {
  screenId: string;
  filePath: string;
  renderedOutput: string;
  verdict: Verdict;
  findings: Finding[];
  criteriaVersion: string;
  candidateText: string;
  rawModelResponse: string;
}

/**
 * Run the full screening pipeline.
 *
 * @param client - a ModelClient implementation (real or recording)
 * @param candidateFilePath - path to the source candidate file (.txt or .md)
 * @param label - user-supplied label for the candidate
 * @param criteriaFilePath - path to criteria.yaml (defaults to 'criteria.yaml')
 */
export async function runPipeline(
  client: ModelClient,
  candidateFilePath: string,
  label: string,
  criteriaFilePath: string = 'criteria.yaml',
): Promise<PipelineResult> {
  // 1. Load criteria
  const { criteria, version: criteriaVersion } = await loadCriteria(criteriaFilePath);

  // 2. Accept candidate (byte-identical storage)
  const acceptResult = await acceptCandidate(candidateFilePath, label);

  // 3. ★ DECODE INVARIANT: getCandidateText called ONCE, stored in ONE variable.
  //    Both buildScreenPrompt and verifyFindings receive this same string.
  //    No other decode of candidate bytes happens in this pipeline.
  const storedBytes = await readCandidateBytes(acceptResult.id);
  const candidateText = getCandidateText(storedBytes);

  // 4. Build prompt (receives candidateText)
  const prompt = buildScreenPrompt(candidateText, criteria);

  // 5. Model call — the ONE network call in the entire pipeline
  const rawModelResponse = await client.complete(prompt);

  // 6. Parse model response
  const parsedFindings = parseModelResponse(rawModelResponse, criteria.length);

  // 7. Verify findings (receives the SAME candidateText)
  const verifiedFindings = verifyFindings(parsedFindings, candidateText, criteria);

  // 8. Assemble verdict
  const verdict = assembleVerdict(verifiedFindings, criteria);

  // 9. Render
  const renderInput: RenderInput = {
    verdict,
    findings: verifiedFindings,
    criteria,
    label,
    criteriaVersion,
    screenedAt: new Date().toISOString(),
  };
  const renderedOutput = renderScreen(renderInput);

  // 10. Persist
  const { screenId, filePath } = await persistScreen({
    verdict,
    findings: verifiedFindings,
    criteria,
    label,
    candidateFile: acceptResult.candidateFile,
    criteriaVersion,
  });

  return {
    screenId,
    filePath,
    renderedOutput,
    verdict,
    findings: verifiedFindings,
    criteriaVersion,
    candidateText,
    rawModelResponse,
  };
}
