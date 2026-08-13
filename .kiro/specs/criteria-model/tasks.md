# Apophasis — spec 1: criteria model and screening engine (tasks)

## § 1 — Skeleton 🔧

> Tasks marked *scaffolding* satisfy no acceptance criterion. They are listed because the work exists, not because it is traceable.

- [ ] **1.1** Initialise `package.json` with `"type": "module"`, project name, and no dependencies yet. — AC: *none (scaffolding)*
- [ ] **1.2** Create the on-disk directory layout: `candidates/`, `screens/`, and root-level `criteria.yaml` placeholder. — AC: *none (scaffolding)*
- [ ] **1.3** Create `.env.example` with commented placeholder for the API key. — AC: *NF-5*
- [ ] **1.4** Create the SQLite schema (migrations or init script): tables for `screens`, `findings`, `criteria_snapshots`. — AC: *AC-7.1*
- [ ] **1.5** Stub the CLI entry point (`bin/apophasis.js` or similar) with subcommands: `screen`, `history`, `criteria validate`. Wire no logic yet. — AC: *none (scaffolding)*
- [ ] **1.6** Configure Vitest (ESM). Confirm a trivial test passes with `vitest --run`. — AC: *none (scaffolding)*

## § 2 — Criteria model 🔧

- [ ] **2.1** Implement `criteria.yaml` parser: read YAML, produce an ordered array of criterion objects with `id`, `statement`, `kind`, `rationale`, `addedOn`, optional `source`. — AC: *AC-1.1*, *AC-1.4*
- [ ] **2.2** Validate `kind` is one of `disqualifying` | `preference`. Reject the file on any other value. — AC: *AC-1.1*, *AC-1.3*
- [ ] **2.3** Validate that every criterion has a non-empty `rationale`. On failure, reject the file with an error naming the offending criterion `id`. — AC: *AC-1.2*
- [ ] **2.4** Compute criteria version as SHA-256 of the file's raw bytes. — AC: *AC-3.6*
- [ ] **2.5** Write tests: valid file loads; missing `rationale` rejects naming the criterion; invalid `kind` rejects; order is preserved. — AC: *AC-1.1*, *AC-1.2*, *AC-1.4*

## § 3 — Candidate accept 🔧

- [ ] **3.1** Implement candidate ingestion: read a `.txt` or `.md` file, store raw text verbatim in `candidates/<id>.txt`. No modification, no summarisation, no truncation. — AC: *AC-2.1*, *AC-2.2*
- [ ] **3.2** Record the candidate's ingest timestamp (ISO 8601) and a user-supplied label in the database. — AC: *AC-2.3*
- [ ] **3.3** Wire the `screen` CLI subcommand to accept a file path and label argument. — AC: *AC-2.1*
- [ ] **3.4** Write tests: raw text survives round-trip unchanged; timestamp and label are stored; non-text file is rejected. — AC: *AC-2.1*, *AC-2.2*, *AC-2.3*

## § 4 — Model interface 🔧

- [ ] **4.1** Create a provider module that reads the API key from environment. — AC: *none (scaffolding)*
- [ ] **4.2** Implement "fail clean" behaviour: when no API key is configured, the CLI exits with a clear error message explaining what is needed. No fallback, no demo mode, no stub client reachable from the CLI. — AC: *NF-3*
- [ ] **4.3** Create a `RecordingClient` wrapper that captures request/response pairs to disk as JSON fixtures, labelled as offline test data only. — AC: *NF-3* (labelling requirement)
- [ ] **4.4** Write tests: missing key produces the expected error and exit code; `RecordingClient` writes a fixture file; fixture files carry the "offline test suite only" label. — AC: *NF-3*
- [ ] **4.5** Write a test that asserts no CLI code path can construct or reach the `RecordingClient` or any replay client. The test fails if any CLI entry point can import or instantiate it. — AC: *NF-6*

## § 5 — The screen prompt 🤖

- [ ] **5.1** Build the prompt template: full candidate text + numbered criteria list. The model is asked only whether each criterion is violated (`fails`, `holds`, `indeterminate`) and, for `fails`, the exact verbatim span from the candidate. — AC: *AC-3.1*, *AC-3.2*, *AC-3.3*
- [ ] **5.2** Offer `indeterminate` explicitly in the prompt as the correct response when the candidate text does not address the criterion. — AC: *AC-3.2*, *AC-4.1*
- [ ] **5.3** Ensure the prompt never contains the tokens `REFUSED`, `NO_DISQUALIFIER_FOUND`, and never asks the model whether to refuse or how good the candidate is. — AC: *AC-5.1*, *AC-5.2*
- [ ] **5.4** Parse the model response into an array of `Finding` objects indexed by criterion position. — AC: *AC-3.1*, *AC-3.2*
- [ ] **5.5** Write tests using recorded fixtures: model returns expected findings; a discriminating pair (one that should fail, one that should hold) is included. No test may assert an empty result. — AC: *AC-3.1*, *AC-3.2*, engineering rule 3.

## § 6 — Verification 🔧

- [ ] **6.1** Implement substring check: for every finding with status `fails`, verify that `evidence` is a substring of the stored candidate text. — AC: *AC-3.4*
- [ ] **6.2** If substring check fails, demote the finding to `indeterminate`, set `demotedFrom` to `fails`, and record the demotion reason. — AC: *AC-3.5*
- [ ] **6.3** Implement `exceptionEvidence` verification: for any finding with status `holds` that carries an `exceptionEvidence` field, verify by substring match. Demote to `indeterminate` if check fails. — AC: *AC-3.7*
- [ ] **6.4** Write tests: valid evidence passes; fabricated evidence demotes to `indeterminate`; exception evidence verified and demoted on failure. Seed data must contain the thing being detected. — AC: *AC-3.4*, *AC-3.5*, *AC-3.7*, engineering rule 4.

## § 7 — Verdict assembly 🔧

- [ ] **7.1** Implement verdict logic: if one or more `disqualifying` findings are `fails`, verdict is `REFUSED`. Otherwise `NO_DISQUALIFIER_FOUND`. — AC: *AC-5.1*, *AC-5.3*, *AC-5.5*
- [ ] **7.2** When `REFUSED` with multiple disqualifying failures, designate the deciding criterion by author-declared order (lowest index in criteria file), never by model judgement. List all failed. — AC: *AC-5.4*, *AC-1.4*
- [ ] **7.3** Set `incomplete = true` when any `disqualifying` criterion is `indeterminate`. A verdict with `incomplete = true` is never rendered as clean. — AC: *AC-4.3*
- [ ] **7.4** Ensure the `Verdict` type has no `score`, `rating`, `fit`, or `recommended` field. The comment documenting this absence stays in shipped code. — AC: *AC-5.2*
- [ ] **7.5** Never compute, store, or return any aggregate number derived from findings. — AC: *AC-5.6*
- [ ] **7.6** `preference` findings that are `fails` are collected but never contribute to the verdict outcome. — AC: *AC-1.3*, *AC-6.1*
- [ ] **7.7** Write tests: single disqualifier fails → REFUSED with that as deciding; multiple disqualifiers fail → REFUSED with first-by-order as deciding; no disqualifier fails → NO_DISQUALIFIER_FOUND; indeterminate disqualifier → incomplete flag set; preferences never flip outcome. — AC: *AC-5.1*, *AC-5.3*, *AC-5.4*, *AC-4.3*, *AC-1.3*

## § 8 — Rendering 🔧

- [ ] **8.1** Implement the REFUSED output shape: deciding criterion with its statement, evidence quote, additional failures with quotes, unevaluated list, criteria version and timestamp. — AC: *AC-5.4*, *AC-4.2*, *AC-3.6*
- [ ] **8.2** Implement the NO_DISQUALIFIER_FOUND output shape: the not-a-recommendation statement in plain language, residual risks (failed preferences in author order), unevaluated list with count, incompleteness marker. — AC: *AC-5.5*, *AC-6.1*, *AC-6.2*, *AC-4.2*, *AC-4.3*
- [ ] **8.3** Ensure residual risks are listed in author-declared order and never ranked, weighted, or summed. — AC: *AC-6.1*, *AC-6.2*
- [ ] **8.4** Write tests: REFUSED shape contains all required sections; NO_DISQUALIFIER_FOUND shape contains not-a-recommendation line and residual risks; unevaluated count matches. — AC: *AC-5.4*, *AC-5.5*, *AC-4.2*, *AC-6.1*

## § 9 — History 🔧

- [ ] **9.1** Persist every screen as a record: candidate text, criteria version hash, all findings with evidence, and verdict. Store in SQLite and as `screens/<id>.md`. — AC: *AC-7.1*, *AC-7.2*
- [ ] **9.2** Ensure `screens/<id>.md` is human-readable in any editor without the application. — AC: *AC-7.2*, *NF-1*
- [ ] **9.3** Enforce append-only: never delete or overwrite a stored screen. A re-screen of the same candidate creates a new record with a new id. — AC: *AC-7.3*
- [ ] **9.4** Implement the `history` CLI subcommand: list past screens, read a specific screen by id. — AC: *AC-7.1*, *AC-7.2*
- [ ] **9.5** Write tests: screen is persisted and retrievable; re-screen creates a new record; markdown file is self-contained; deletion is not possible through the interface. — AC: *AC-7.1*, *AC-7.2*, *AC-7.3*

## § 10 — Corpus proof 🤖

- [ ] **10.1** Prepare at least two real candidate texts: one that should be REFUSED (contains a disqualifying match) and one that should be NO_DISQUALIFIER_FOUND. Seed data must contain the thing being detected. — AC: *AC-3.1*, engineering rule 4.
- [ ] **10.2** Run end-to-end screens against the live model. Verify the full pipeline: criteria load → candidate accept → model call → verification → verdict → render → record. — AC: *AC-3.1*, *AC-3.4*, *AC-5.1*, *AC-7.1*
- [ ] **10.3** Capture the request/response pairs as fixtures via `RecordingClient`. Label them as offline test data only. — AC: *NF-3*
- [ ] **10.4** Write fixture-based regression tests using the captured pairs: confirm the pipeline reproduces the same verdict deterministically from recorded model output. — AC: *AC-3.4*, *AC-5.1*, engineering rule 3.
- [ ] **10.5** Document cost per screen (tokens, estimated price) and rate-limit observations in the README. — AC: *NF-4*

---

## Cut order (if time runs short)

**Cut order if time runs short:** §9 (History) is the only cuttable section, and **cutting it forfeits AC-7.1, AC-7.2 and AC-7.3** — say so rather than shipping it quietly. Nothing else is cuttable. §§1–8 are the app, and §8's `NO_DISQUALIFIER_FOUND` shape is the demo — a tool that refuses to say yes when it has nothing to refuse on is the entire premise, so it is never cut.
