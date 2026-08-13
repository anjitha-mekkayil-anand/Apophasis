# Apophasis — spec 1: criteria model and screening engine (design)

## The load-bearing architectural decision

**The model produces findings. Code produces the verdict.**

The model is never asked whether to refuse, never sees the tokens `REFUSED` or `NO_DISQUALIFIER_FOUND`, and has no path to influence which criterion is named as deciding. It answers one narrow question per criterion — *does this candidate violate this rule, and if so which sentence shows it* — and everything after that is deterministic.

This makes AC-5.1 and AC-5.2 **structurally true rather than prompted**. A prompt that says "never recommend" is a request. A verdict type with no field to hold a recommendation is a guarantee.

It also bounds the failure mode: a model that is wrong about a finding produces a wrong refusal *with a quoted sentence you can check in two seconds*, rather than a wrong score you cannot audit at all.

## Pipeline

```
load criteria  ->  accept candidate  ->  screen  ->  verify  ->  assemble  ->  render  ->  record
   (code)             (code)           (model)     (code)      (code)      (code)     (code)
```

One model call. Everything else is deterministic.

| Stage | Does | Enforces |
|---|---|---|
| **load criteria** | Parse `criteria.yaml`, validate, compute version hash | AC-1.1, AC-1.2, AC-1.4 |
| **accept candidate** | Store raw text verbatim, no normalisation | AC-2.1, AC-2.2, AC-2.3 |
| **screen** | One call: full candidate text + numbered criteria -> findings by index | AC-3.1, AC-3.2 |
| **verify** | Substring-check every evidence span against stored candidate text; demote on failure | AC-3.4, AC-3.5, AC-3.7 |
| **assemble** | Verdict from findings by rule; deciding criterion by author order | AC-5.3, AC-5.4, AC-5.5, AC-4.3 |
| **render** | The refusal, residual risks, the unevaluated list, the not-a-recommendation line | AC-4.2, AC-5.5, AC-6.1 |
| **record** | Append-only screen record, markdown + db | AC-7.1, AC-7.2, AC-7.3 |

## Data model

### `criteria.yaml` — the product, not a config file

```yaml
version: 1
criteria:
  - id: prod-support
    kind: disqualifying
    statement: >
      The role is production support, L2/L3, or an on-call escalation function.
    rationale: >
      Ruled out at any salary. Past instances produced the hero-complex pattern
      and displaced the architecture track entirely.
    addedOn: 2026-08-03
    source: "Why Applying Feels Dangerous"
  - id: onsite-required
    kind: disqualifying
    statement: The role requires relocation or regular onsite presence.
    rationale: Commute constraint. Non-negotiable.
    addedOn: 2026-07-09
  - id: legacy-only
    kind: preference
    statement: The stack is maintenance-only with no greenfield work described.
    rationale: Survivable, but it slows the architecture track.
    addedOn: 2026-08-13
```

**Order is priority** (AC-1.4). `rationale` is required and load fails without it (AC-1.2).

**Version = SHA-256 of the file's bytes**, recorded on every screen (AC-3.6). Not a hand-maintained integer, which drifts.

### Types

```ts
type Kind = 'disqualifying' | 'preference'
type Status = 'fails' | 'holds' | 'indeterminate'

interface Finding {
  criterionIndex: number          // by index, never restated text
  status: Status
  evidence?: string               // required when status === 'fails'
  exceptionEvidence?: string      // required when 'holds' via a stated exception
  demotedFrom?: Status            // set by verify, never by the model
  demotionReason?: string
}

interface Verdict {
  outcome: 'REFUSED' | 'NO_DISQUALIFIER_FOUND'
  decidingCriterionIndex?: number // set only when REFUSED
  failedIndexes: number[]
  unevaluatedIndexes: number[]
  incomplete: boolean             // true if any disqualifying criterion is indeterminate
  // NOTE: there is deliberately no score, rating, fit or recommended field.
  // AC-5.2 - this absence is the feature. Do not add one.
}
```

The comment in the type stays in the shipped code.

## What the model is asked, and what it is not

**Asked:** for each numbered criterion, does the candidate violate it — `fails`, `holds`, or `indeterminate` — and for `fails`, the exact sentence from the candidate that shows it.

**Not asked:** whether to refuse · which criterion matters most · how good the candidate is · anything requiring a number.

Findings come back **by criterion index**, never as restated statements. Restated text drifts from the source and cannot be checked against it.

`indeterminate` is offered explicitly as a first-class answer, with the prompt stating that it is the correct response when the candidate text does not address the criterion. **A model with no way to say "I don't know" will guess**, and here a guess in the `holds` direction is a false clean.

## Enforced in code vs asked of the model

*This table goes in the README verbatim.*

| Guarantee | How |
|---|---|
| A refusal names a quoted sentence that really appears in the candidate | **Code** — substring check (AC-3.4) |
| A claimed quote that isn't in the source cannot cause a refusal | **Code** — demotion to `indeterminate` (AC-3.5) |
| An exception cannot rescue a candidate without a quote | **Code** — AC-3.7 |
| The verdict is one of exactly two values | **Code** — the type has no third |
| Nothing can be recommended | **Code** — no field to populate (AC-5.2) |
| Which criterion decided | **Code** — author-declared order (AC-5.4) |
| No aggregate number exists anywhere | **Code** — never computed (AC-5.6) |
| A clean verdict cannot hide an unevaluated disqualifier | **Code** — `incomplete` flag (AC-4.3) |
| Whether a specific rule is violated | **Model** — the one judgement it makes |

## On-disk layout

```
criteria.yaml           # the rules - hand-edited, versioned, the product
candidates/<id>.txt     # raw candidate text, verbatim, never rewritten
screens/<id>.md         # the readable record
apophasis.db            # SQLite: screens, findings, criteria snapshots
.env.example            # never a real key
```

`screens/*.md` is readable without the application (AC-7.2). Append-only: a re-screen writes a new record (AC-7.3).

## Rendered output — the two shapes

**REFUSED**

```
REFUSED - senior-dotnet-role-acme

Deciding criterion: prod-support
  "The role is production support, L2/L3, or an on-call escalation function."
  > "...owning L2/L3 escalations for the platform on a weekly on-call rota."

Also failed:
  onsite-required
  > "...three days per week from our Bangalore office."

Could not be evaluated: none
Criteria version: 4f2a...  |  Screened 2026-08-13
```

**NO_DISQUALIFIER_FOUND**

```
NO DISQUALIFIER FOUND - platform-engineer-role-beta

This is not a recommendation. Nothing here endorses this candidate; it
means none of your disqualifying criteria fired.

Residual risks (preferences that failed, in your order):
  legacy-only
  > "...primary responsibility is maintaining the existing billing platform."

Could not be evaluated (2 of 9):
  compensation-floor  - the candidate text does not state compensation
  team-size           - not addressed

! Incomplete: 1 disqualifying criterion could not be evaluated.
```

The second shape is what sells the demo. A tool that refuses to say yes when it has nothing to refuse on is doing something almost nothing else does — and the unevaluated count is visible rather than retried away.

## Section plan for the task list

Kiro generates the tasks; these are the section boundaries. 🔧 = pure code, no model calls. 🤖 = needs a key.

| § | Content | |
|---|---|---|
| 1 | Skeleton — ESM setup, CLI stubs, SQLite schema, on-disk layout | 🔧 |
| 2 | Criteria model — parse, validate, `rationale` required, version hash | 🔧 |
| 3 | Candidate accept — verbatim storage, label, timestamp | 🔧 |
| 4 | Model interface — provider, **fail clean with no key**, `RecordingClient` for fixtures | 🔧 |
| 5 | The screen prompt — numbered criteria, findings by index, `indeterminate` offered explicitly | 🤖 |
| 6 | Verification — substring checks, demotion, `exceptionEvidence` | 🔧 |
| 7 | Verdict assembly — deciding criterion by order, `incomplete`, no aggregate | 🔧 |
| 8 | Rendering — both shapes, the not-a-recommendation line, the unevaluated count | 🔧 |
| 9 | History — append-only records, re-read command | 🔧 |
| 10 | Corpus proof — real screens end to end; fixtures captured as a by-product | 🤖 |

**Eight of ten need no API key.** The key-dependent work is §5 and §10 only.

**Cut order if time runs short:** §9 → §8's second shape → nothing else. §§1–7 are the app.
