/**
 * Core domain types for Apophasis.
 *
 * The model produces findings. Code produces the verdict.
 */

export type Kind = 'disqualifying' | 'preference';
export type Status = 'fails' | 'holds' | 'indeterminate';

export interface Criterion {
  id: string;
  kind: Kind;
  statement: string;
  rationale: string;
  addedOn: string;
  source?: string;
  hasException?: boolean;
}

export interface CriteriaFile {
  schemaVersion: number;
  criteria: Criterion[];
}

export type HoldsReason = 'not-violated' | 'exception-applied';

export interface Finding {
  criterionIndex: number;          // by index, never restated text
  status: Status;
  evidence?: string;               // required when status === 'fails'
  holdsReason?: HoldsReason;       // required when status === 'holds' on a hasException criterion (AC-3.7)
  exceptionEvidence?: string;      // required when holdsReason === 'exception-applied' (AC-3.7)
  demotedFrom?: Status;            // set by verify, never by the model
  demotionReason?: string;
}

export interface Verdict {
  outcome: 'REFUSED' | 'NO_DISQUALIFIER_FOUND';
  decidingCriterionIndex?: number; // set only when REFUSED
  failedIndexes: number[];
  unevaluatedIndexes: number[];
  incomplete: boolean;             // true if any disqualifying criterion is indeterminate
  // NOTE: there is deliberately no score, rating, fit or recommended field.
  // AC-5.2 — this absence is the feature. Do not add one.
}

/**
 * A single entry in screens/index.json.
 * This is a convenience index, never a source of truth.
 * If it disagrees with the markdown files, the markdown wins.
 */
export interface ScreenIndexEntry {
  id: string;
  label: string;
  verdict: 'REFUSED' | 'NO_DISQUALIFIER_FOUND';
  criteriaVersion: string;
  screenedAt: string;  // ISO 8601
}

/**
 * The YAML frontmatter schema for screens/<id>.md.
 * This IS the record — everything AC-7.1 requires lives here.
 */
export interface ScreenFrontmatter {
  id: string;
  label: string;
  candidateFile: string;           // relative path to candidates/<id>.txt
  criteriaVersion: string;         // SHA-256 of criteria.yaml bytes at screen time
  screenedAt: string;              // ISO 8601
  verdict: 'REFUSED' | 'NO_DISQUALIFIER_FOUND';
  decidingCriterionIndex?: number;
  incomplete: boolean;
  findings: Finding[];
}
