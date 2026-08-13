/**
 * Typed error classes for Apophasis.
 *
 * Each domain area gets a typed error so callers can distinguish
 * between failure modes without string-matching.
 */

/**
 * Thrown when candidate acceptance fails (wrong extension, missing file, etc).
 */
export class CandidateAcceptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CandidateAcceptError';
  }
}
