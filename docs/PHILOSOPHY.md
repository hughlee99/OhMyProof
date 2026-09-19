# Evidence-driven Vibe Coding

## First principle

**AI suggestions are hypotheses, not answers.**

OhMyProof exists to insert a scientific-method loop between an AI proposal and a human decision:

```text
Proposal
→ explicit claims
→ falsifiable experiment
→ isolated baseline and candidate worlds
→ identical simulations
→ measurements
→ evidence
→ human decision
```

## Separation of powers

AI may inspect the repository, formulate claims, design adversarial simulations, and implement the candidate.

AI should not be the primary source of truth for whether its own proposal worked. Prefer executable observations such as tests, workloads, traces, latency, I/O, resource use, state changes, browser behavior, and failure behavior.

## Falsification first

The experiment should ask:

> If this proposal is wrong, where would it fail?

A strong proof therefore contains the claimed benefit, regression coverage, counterexamples or edge conditions, and explicit unknowns.

## Evidence states

- **SUPPORTED**: the defined executable evidence threshold was met.
- **CONTRADICTED**: measured evidence materially moved against the claim.
- **REGRESSION**: an independent guardrail got worse.
- **UNKNOWN**: the available experiment cannot decide.

OhMyProof does not turn those states into an automatic product decision. The human keeps that authority.
