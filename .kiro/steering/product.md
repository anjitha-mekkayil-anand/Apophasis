# Apophasis — product steering

## What this is

**Apophasis** — ἀπόφασις, defining a thing by what it is not.

A screening tool that evaluates candidates against written disqualifying criteria and returns **what fails and which criterion decided**. It refuses. It never recommends.

## The governing principle

**The model produces findings. Code produces the verdict.**

The model answers one narrow question per criterion: does this candidate violate this rule, and if so which sentence shows it. Everything after that — the verdict, which criterion is named as deciding, whether the screen is incomplete — is deterministic code.

This is not a prompt engineering preference. It is the load-bearing architectural decision. A prompt that says "never recommend" is a request. A verdict type with no field to hold a recommendation is a guarantee.

## The absence that is a feature

The `Verdict` type deliberately has no `score`, `rating`, `fit`, or `recommended` field. This absence is a feature to be defended, not an omission to be fixed. There is nothing to populate, and therefore nothing a model or a future contributor can fill in. AC-5.2 exists to make this structural.

Any proposal to add an aggregate number, a ranking, or a recommendation mechanism is a contradiction of the product's premise and must be refused, not discussed as a trade-off.
