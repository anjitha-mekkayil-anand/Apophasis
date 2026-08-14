# Apophasis

**ἀπόφασις** — defining a thing by what it is not.

---

Every recommender optimises for yes. They score your options and return the highest number, which holds until one criterion is fatal — and then a candidate matching on nine of ten things still scores well, while the thing that rules it out disappears inside the average.

Apophasis screens a candidate text against an ordered set of disqualifying rules and returns one of exactly two verdicts:

- **REFUSED** — naming the deciding criterion, quoting the evidence sentence, listing all others that also failed.
- **NO DISQUALIFIER FOUND** — which is not a recommendation. Nothing here endorses the candidate; it means none of your disqualifying criteria fired.

The model produces findings. Code produces the verdict. A prompt that says "never recommend" is a request. A verdict type with no field to hold a recommendation is a guarantee.

> The output is the interface. Every screen is markdown on disk, readable in any editor without this application — which is also how you check that it did what it says it did.

---

## Enforced in code vs asked of the model

| Guarantee | How |
|---|---|
| A refusal names a quoted sentence that really appears in the candidate | **Code** — substring check (AC-3.4) |
| A claimed quote that isn't in the source cannot cause a refusal | **Code** — demotion to `indeterminate` (AC-3.5) |
| An exception cannot rescue a candidate without a quote, and the trigger is not the model's to decide | **Code** — AC-1.5, AC-3.7 |
| The verdict is one of exactly two values | **Code** — the type has no third |
| Nothing can be recommended | **Code** — no field to populate (AC-5.2) |
| Which criterion decided | **Code** — author-declared order (AC-5.4) |
| No aggregate number exists anywhere | **Code** — never computed (AC-5.6) |
| A clean verdict cannot hide an unevaluated disqualifier | **Code** — `incomplete` flag (AC-4.3) |
| Whether a specific rule is violated | **Model** — the one judgement it makes |
| The model is never asked to decide the outcome | **Code** — AC-5.7, asserted against the rendered prompt |

---

## Real-World Value

The practice behind Apophasis is a written disqualifier list applied by hand before deciding on a role.

In August 2026, a Principal Full-Stack position matched on nine of ten skills — the stack, the domain, the enterprise-debugging experience. The CV variant was already built. It was refused on one criterion: production support and L2/L3 escalation work, ruled out at any salary, written down weeks before that posting existed. A ranker scores that role highly and is wrong.

This is not a narrow personal preference. Anyone with a constraint that cannot be traded faces the same problem: a salary floor, no relocation, no on-call, a visa requirement, a contract type. Every board and every matcher optimises for fit. None of them refuse. A fatal criterion inside an aggregate score is invisible — which is what every recommender returns. The decision that matters is not *how well does this match*, it is *is there one thing here that rules it out*, and a score cannot express that.

No code from the hand-applied practice exists; it was a document and a habit. First commit 13 August 2026, inside the competition period.

---

## Setup

Requires Node.js 20+ and an Anthropic API key.

```bash
git clone https://github.com/anjitha-mekkayil-anand/Apophasis.git
cd Apophasis
npm install
cp .env.example .env
# Edit .env: set ANTHROPIC_API_KEY=sk-ant-...
```

---

## Configuration

| Variable | Purpose | Default |
|----------|---------|---------|
| `ANTHROPIC_API_KEY` | Required. The API key for model calls. | — |
| `ANTHROPIC_MODEL` | Model identifier. | `claude-sonnet-4-6` |

The model id is `claude-sonnet-4-6` and it is overridable via `ANTHROPIC_MODEL`. A judge whose key cannot reach that model should set the variable to a model their key supports.

`criteria.yaml` at the project root defines the screening rules. Edit it to change what the tool screens for.

---

## Usage

```bash
# Validate criteria file
npx tsx src/cli.ts criteria validate

# Screen a candidate (requires API key)
npx tsx src/cli.ts screen examples/senior-platform-reliability-role.txt senior-platform-finserv
npx tsx src/cli.ts screen examples/staff-architect-distributed-role.txt staff-architect

# View screen history
npx tsx src/cli.ts history
npx tsx src/cli.ts history <screen-id>
```

---

## There is no demo mode

No fallback, no offline operation, no stub client reachable from the CLI. This is enforced structurally: the `RecordingClient` lives outside the production source tree (`test-support/`) and is proven unreachable from any CLI code path by an import-graph walk test (NF-6). Recorded fixtures exist only as an offline test suite and are labelled as such with `_offlineTestOnly: true` in every fixture file.

---

## API and service costs

Measured against `claude-sonnet-4-6` with 5 criteria and candidate texts of 500–800 bytes:

| Metric | Per screen |
|--------|-----------|
| Prompt size | ~3,400 chars (~1,000 tokens) |
| Response size | ~700 chars (~180 tokens) |
| Estimated cost | ~$0.005 |
| Latency | 3–5 seconds |
| Model calls per screen | exactly 1 |

**Rate limits:** No rate-limit issues observed in sequential testing. The pipeline makes exactly one model call per screen.

---

## Testing

```bash
# Run the full test suite (198 tests, offline, no API key needed)
npm test

# Type-check production and test-support code
npm run typecheck

# Build (compile TypeScript)
npm run build
```

The offline test suite uses **captured model response fixtures** in `test-support/fixtures/`. These are recorded responses from real model calls, labelled `_offlineTestOnly: true`. **They are a test suite and not the app running** — they prove the pipeline produces the same verdict deterministically from recorded output, without making network calls.

**Test credentials:** A working API key is supplied on the submission form and is never committed to the repository. `.env.example` shows the format.

---

## Known Limitations

**Judgement-call criteria are not deterministic across runs.** Found during this project's own build: a criterion asking whether a role is "maintenance-only with no greenfield work" was evaluated differently on consecutive calls against the same candidate. Criteria whose violation is stated explicitly in the text are stable; criteria requiring interpretation are not. Write one rule per criterion, and prefer rules a sentence can settle.

**Compound statements with exceptions evaluate less reliably** than simple ones. The `hasException` mechanism is supported and correct, but the model must identify that an exception applies rather than that the rule simply was not triggered — which is a harder question. Exceptions are supported and cost accuracy.

**Whitespace normalisation is the only tolerance** in evidence checking. A model that paraphrases a quote, adds a word, removes punctuation, or changes case will have that finding demoted to `indeterminate`. This is by design — the guarantee is that the model did not invent the sentence, and paraphrase tolerance would destroy it. The cost is occasional false demotions on correct findings, visible in the screen record.

**Single user, no authentication, no state beyond files.** The tool writes to `candidates/` and `screens/` in the working directory. No locking, no concurrency, no multi-user access control.

**No scoring, ever.** This is a deliberate refusal, not a missing feature. The `Verdict` type has no `score`, `rating`, `fit`, or `recommended` field — and a comment in the shipped code says so. AC-5.2 exists to make this structural. Any proposal to add an aggregate number is a contradiction of the product's premise.

**The `holdsReason: "not-violated"` path has not been exercised by a live model call.** It is exercised by unit tests. The corpus candidates trigger the `exception-applied` path instead. A candidate that never mentions the excepted topic would exercise it live.

---

## How Kiro was used

This project was built spec-first through Kiro's spec → task cycle across 10 sections:

- **Specifications:** [`.kiro/specs/criteria-model/`](.kiro/specs/criteria-model/) — requirements, design, and tasks defined before any code was written.
- **Steering rules:** [`.kiro/steering/`](.kiro/steering/) — 8 engineering rules and product principles applied across every section.

Each section went through a correction round before implementation. The trail of corrections — AC-3.7 rewritten twice (from over-broad to `holdsReason`), AC-5.6 found to contradict AC-4.2, a banned-terms test that rejected correct copy three times, a decode invariant filed in the only cuttable section — is the evidence that the spec was read against itself, not just followed.

PRs produced:
1. [§1 skeleton + spec amendment](https://github.com/anjitha-mekkayil-anand/Apophasis/pull/2)
2. [§2 criteria model + spec corrections](https://github.com/anjitha-mekkayil-anand/Apophasis/pull/3)
3. [§3 candidate accept + spec corrections](https://github.com/anjitha-mekkayil-anand/Apophasis/pull/4)
4. [§4 model interface](https://github.com/anjitha-mekkayil-anand/Apophasis/pull/5)
5. [§5 screen prompt + task reclassification](https://github.com/anjitha-mekkayil-anand/Apophasis/pull/6)
6. [§6 verification + AC-3.7 correction](https://github.com/anjitha-mekkayil-anand/Apophasis/pull/7)
7. [§7 verdict assembly + AC-5.6 correction](https://github.com/anjitha-mekkayil-anand/Apophasis/pull/8)
8. [§8 rendering](https://github.com/anjitha-mekkayil-anand/Apophasis/pull/9)
9. [§9 history + banned-list correction](https://github.com/anjitha-mekkayil-anand/Apophasis/pull/10)
10. [§10 corpus proof](https://github.com/anjitha-mekkayil-anand/Apophasis/pull/11)

---

## Attribution

| Dependency | Licence |
|------------|---------|
| [@anthropic-ai/sdk](https://github.com/anthropics/anthropic-sdk-typescript) | MIT |
| [yaml](https://github.com/eemeli/yaml) | ISC |
| [tsx](https://github.com/privatenumber/tsx) | MIT |
| [TypeScript](https://github.com/microsoft/TypeScript) | Apache-2.0 |
| [Vitest](https://github.com/vitest-dev/vitest) | MIT |

---

## Deliberately out of scope

Scraping · integrations with job boards or marketplaces · multi-user · authentication · scoring or ranking of any kind · recommendations · auto-apply · a graphical interface beyond the CLI's output · candidate formats beyond text and markdown.

*A named cut list reads as judgment. An unnamed one reads as an unfinished app.*
