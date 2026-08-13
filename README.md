# Apophasis

**ἀπόφασις** — defining a thing by what it is not.

A screening tool that evaluates candidates against written disqualifying criteria and returns **what fails and which criterion decided**. It refuses. It never recommends.

---

## What it is and the problem it solves

Every recommender optimises for *yes*, which is why a single fatal criterion disappears inside an aggregate score. Apophasis screens a candidate text against an ordered set of disqualifying rules and returns one of exactly two verdicts:

- **REFUSED** — naming the deciding criterion, quoting the evidence sentence, listing all others that also failed.
- **NO DISQUALIFIER FOUND** — which is not a recommendation. Nothing here endorses the candidate; it means none of your disqualifying criteria fired.

The model produces findings. Code produces the verdict. A prompt that says "never recommend" is a request. A verdict type with no field to hold a recommendation is a guarantee.

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

The model id is `claude-sonnet-4-6` and it is overridable via `ANTHROPIC_MODEL`. A judge whose key cannot reach that model should set the variable to a model their key supports (e.g. `claude-sonnet-4-5-20250929`).

`criteria.yaml` at the project root defines the screening rules. Edit it to change what the tool screens for.

---

## Usage

```bash
# Validate criteria file
npx tsx src/cli.ts criteria validate

# Screen a candidate
npx tsx src/cli.ts screen path/to/candidate.txt "label-for-this-candidate"

# View screen history
npx tsx src/cli.ts history
npx tsx src/cli.ts history <screen-id>
```

---

## There is no demo mode

No fallback, no offline operation, no stub client reachable from the CLI. This is enforced structurally: the `RecordingClient` lives outside the production source tree (`test-support/`) and is proven unreachable from any CLI code path by an import-graph walk test (NF-6). Recorded fixtures exist only as an offline test suite and are labelled as such with `_offlineTestOnly: true` in every fixture file.

---

## API and service costs

Measured against `claude-sonnet-4-6` with 4 criteria and candidate texts of 500–800 bytes:

| Metric | Per screen |
|--------|-----------|
| Prompt size | ~3,300 chars (~1,000 tokens) |
| Response size | ~600 chars (~150 tokens) |
| Estimated cost | ~$0.004 |
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

## How Kiro was used

This project was built spec-first through Kiro's spec → task cycle across 10 sections:

- **Specifications:** [`.kiro/specs/criteria-model/`](.kiro/specs/criteria-model/) — requirements, design, and tasks defined before any code was written.
- **Steering rules:** [`.kiro/steering/`](.kiro/steering/) — engineering rules (8 total) and product principles applied across every section.

Each section went through a correction round before implementation. The trail of corrections — AC-3.7 rewritten twice (from over-broad to holdsReason), AC-5.6 found to contradict AC-4.2, a banned-terms test that rejected correct copy three times — is the evidence that the spec was read against itself, not just followed.

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

## Provenance

The practice behind Apophasis is a written disqualifier list applied by hand before deciding on a role — including a real refusal in August 2026 of a role that matched on nine of ten skills, on the one criterion that decides. No code from that practice exists; it was a document and a habit. First commit 13 August 2026, inside the competition period.

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
