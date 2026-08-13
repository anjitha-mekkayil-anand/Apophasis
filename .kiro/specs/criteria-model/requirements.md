# Apophasis — spec 1: criteria model and screening engine (requirements)

## The premise, in one line

**Apophasis** — ἀπόφασις, defining a thing by what it is not. Every recommender optimises for *yes*, which is why a single fatal criterion disappears inside an aggregate score. This screens a candidate against written disqualifiers and returns **what fails and which criterion decided**. It refuses. It never recommends.

## User stories

**US-1 — write the rules while calm.**
As someone evaluating opportunities, I want my disqualifying criteria written down once, so a decision is checked against rules I set in advance rather than rules I invent while looking at an attractive option.

**US-2 — see the deciding criterion, not a score.**
As a user screening a candidate, I want to be told what fails and which single criterion decided it, so a high-scoring match that dies on one rule is visible rather than averaged away.

**US-3 — never be told to proceed.**
As a user, I want the tool to be incapable of endorsing anything, so the decision stays mine and a clean screen is never mistaken for approval.

**US-4 — re-read a past decision.**
As a user, I want every screen kept with its criteria version and evidence, so I can re-read why something was refused months later.

## Acceptance criteria (EARS)

### AC-1 — criteria are typed, and the type is load-bearing

- **AC-1.1** The system SHALL store each criterion with: a stable `id`, a `statement`, a `kind` of either `disqualifying` or `preference`, a `rationale`, an `addedOn` date, an optional `source`, and an optional `hasException` boolean defaulting to `false`.
- **AC-1.2** WHEN a criterion is loaded without a `rationale`, the system SHALL reject the criteria file with an error naming the criterion. *A rule with no stated reason cannot be re-examined later, which is the failure this app exists to prevent.*
- **AC-1.3** The system SHALL treat `disqualifying` as binary and fatal, and `preference` as non-fatal, and SHALL NOT provide any mechanism for a `preference` to become fatal by accumulation.
- **AC-1.4** The criteria file SHALL be an ordered list, and that order SHALL be author-declared priority.
- **AC-1.5** WHERE a criterion's `statement` contains an exception clause, the author SHALL set `hasException: true`. The system SHALL NOT attempt to detect exception clauses from statement text.

### AC-2 — the candidate

- **AC-2.1** The system SHALL accept a candidate as plain text or a markdown/text file, storing the raw text verbatim.
- **AC-2.2** The system SHALL NOT modify, summarise or truncate candidate text before screening. *Evidence is quoted from it and substring-checked; any normalisation breaks the check.*
- **AC-2.3** The system SHALL record the candidate's ingest timestamp and a user-supplied label.

### AC-3 — the screen

- **AC-3.1** WHEN a candidate is screened, the system SHALL evaluate it against every criterion in the file, producing one `Finding` per criterion.
- **AC-3.2** Each `Finding` SHALL carry a `status` of exactly one of `fails`, `holds`, or `indeterminate`.
- **AC-3.3** WHERE a finding is `fails`, the system SHALL require an `evidence` field containing a **verbatim span from the candidate text**.
- **AC-3.4** The system SHALL verify `evidence` by substring match against the stored candidate text **in code**, not by trusting the model's assertion.
- **AC-3.5** IF the substring check fails, the system SHALL demote the finding to `indeterminate` and record the demotion reason. *A claimed quote that is not in the source is a fabrication, and the app must not act on one.*
- **AC-3.6** The system SHALL record which criteria version was in force for the screen.
- **AC-3.7** WHERE a criterion has `hasException: true` AND a finding for it is `holds`, the system SHALL require an `exceptionEvidence` field containing a verbatim span from the candidate text, verified by substring match as in AC-3.4. IF `exceptionEvidence` is absent, empty, or fails the substring check, the system SHALL demote the finding to `indeterminate` and record the demotion reason.

*This closes an asymmetry that AC-3.3 alone leaves open: refusing requires a quote, but rescuing would not have. "The exception applied" is where a model is generous, and it is the direction that costs a candidate you would have refused. The trigger is author-declared rather than inferred, because inferring it would put a judgement back in the model that the governing principle keeps in code.*

### AC-4 — `indeterminate` is not a pass

- **AC-4.1** The system SHALL treat `indeterminate` as unresolved, never as `holds`.
- **AC-4.2** WHEN any finding is `indeterminate`, the output SHALL list it under an explicit "could not be evaluated" heading, distinct from the criteria that held.
- **AC-4.3** The system SHALL NOT allow a verdict to be rendered as clean while any `disqualifying` criterion is `indeterminate` — the verdict SHALL carry an explicit incompleteness marker.

*Silence is not a pass. This mirrors the standing rule that a gate which cannot run must never read as a gate that passed.*

### AC-5 — the verdict, and what it cannot say

- **AC-5.1** The verdict SHALL be exactly one of `REFUSED` or `NO_DISQUALIFIER_FOUND`. There SHALL be no third value.
- **AC-5.2** The verdict type SHALL NOT contain a `recommended`, `score`, `rating`, `fit` or equivalently-named field. *Enforced in the type, not in the prompt — there must be nothing to populate.*
- **AC-5.3** WHEN one or more `disqualifying` findings are `fails`, the verdict SHALL be `REFUSED`.
- **AC-5.4** WHEN a verdict is `REFUSED` and more than one disqualifying criterion failed, the system SHALL name **all** of them and SHALL designate exactly one as the **deciding criterion**, chosen by author-declared order (AC-1.4) — **never by model judgement**.
- **AC-5.5** WHEN no disqualifying criterion fails, the verdict SHALL be `NO_DISQUALIFIER_FOUND`, and the rendered output SHALL state in plain language that this is **not a recommendation**.
- **AC-5.6** The system SHALL NOT compute, store or display any aggregate number derived from findings.

### AC-6 — preferences surface as residual risk, never as a total

- **AC-6.1** WHERE `preference` criteria are `fails`, the system SHALL list them under `NO_DISQUALIFIER_FOUND` as residual risks, in author-declared order.
- **AC-6.2** The system SHALL NOT rank, weight or sum residual risks.

### AC-7 — history

- **AC-7.1** The system SHALL persist every screen with its candidate text, criteria version, findings, evidence and verdict.
- **AC-7.2** A stored screen SHALL be readable without the application.
- **AC-7.3** The system SHALL NOT delete or overwrite a stored screen. A re-screen SHALL create a new record.

## Non-functional

- **NF-1** Everything the app produces SHALL be plain files on disk, readable in any editor.
- **NF-2** The system SHALL make no network calls other than to the configured model provider.
- **NF-3** The system SHALL fail clean and explain itself when no API key is configured. **No fallback, no demo mode, no stub client reachable from the CLI.** *Presenting simulated functionality as working is a disqualification matter; recorded fixtures exist only as an offline test suite and SHALL be labelled as such.*
- **NF-4** Cost per screen SHALL be measured and documented in the README, alongside rate limits.
- **NF-5** No API key SHALL be committed. `.env.example` in the repo; the working test credential goes on the submission form.
- **NF-6** No recording or replay client SHALL be reachable from any CLI code path. Fixture capture SHALL be available only to the test suite. *A stub that can be reached at runtime is a demo mode regardless of what it is called, and presenting simulated functionality as working is a disqualification matter.*

## Deliberately out of scope — the cut list goes in the README

Scraping · integrations with job boards or marketplaces · multi-user · authentication · scoring or ranking of any kind · recommendations · auto-apply · a graphical interface beyond the CLI's output · candidate formats beyond text and markdown.

*A named cut list reads as judgment. An unnamed one reads as an unfinished app.*

## Resolved and open questions

- ✅ **OQ-1 — RESOLVED: no structured counter-condition field.** A `statement` is already natural language, so an exception is already expressible — *"Production support disqualifies, unless the role is explicitly architecture-track with prod support named as under 20%"* is a valid criterion today. A structured `unless` buys nothing except making the exception checkable, and that is where the cost is. The real asymmetry it surfaced is closed by AC-3.7. **Known limitation, documented rather than engineered around:** a compound statement evaluates less reliably than a simple one. *Write one rule per criterion; exceptions are supported and cost accuracy.*
- **OQ-2 — open.** When the candidate text is long, does the whole text go in the prompt, or is retrieval needed? Lean: full text, and document the length limit rather than engineering around it.
- ✅ **OQ-3 — RESOLVED: no auto-retry on `indeterminate`. Surface the rate instead** (*"2 of 9 criteria could not be evaluated"*). A criterion that repeatedly comes back unevaluable is usually badly written, which is actionable, and retrying hides it; retrying also erodes AC-4.3, the one guard against a false-clean verdict.
