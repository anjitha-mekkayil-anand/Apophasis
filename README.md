# Apophasis

**ἀπόφασις** — defining a thing by what it is not.

A screening tool that evaluates candidates against written disqualifying criteria and returns what fails and which criterion decided. It refuses. It never recommends.

## Status

This project is spec-driven. The specifications live in `.kiro/specs/` and define the requirements, design, and implementation tasks before any code is written.

## Cost per screen

Measured against `claude-sonnet-4-6` with 3 criteria and ~600-800 byte candidate texts:

| Metric | Refusal run | Clean run |
|--------|-------------|-----------|
| Prompt size | ~3,300 chars | ~3,240 chars |
| Response size | ~540 chars | ~520 chars |
| Estimated tokens (in) | ~1,000 | ~980 |
| Estimated tokens (out) | ~150 | ~140 |
| Estimated cost | ~$0.004 | ~$0.004 |
| Latency | ~5s | ~5s |

**Rate limits:** No rate-limit issues observed in testing with sequential calls. The pipeline makes exactly one model call per screen.

**Model:** Configurable via `ANTHROPIC_MODEL` environment variable. Default: `claude-sonnet-4-6`.

## Setup

```bash
npm install
cp .env.example .env
# Edit .env to add your ANTHROPIC_API_KEY
```

## Usage

```bash
# Validate criteria file
npx tsx src/cli.ts criteria validate

# Screen a candidate
npx tsx src/cli.ts screen <file.txt> <label>

# View screen history
npx tsx src/cli.ts history
npx tsx src/cli.ts history <screen-id>
```

## Deliberately out of scope

Scraping · integrations with job boards or marketplaces · multi-user · authentication · scoring or ranking of any kind · recommendations · auto-apply · a graphical interface beyond the CLI's output · candidate formats beyond text and markdown.
