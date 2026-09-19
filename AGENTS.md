# OhMyProof — Project Instructions

Before structural or public-facing changes, read `README.md`, `CONTRIBUTING.md`, and `SECURITY.md` when execution/security boundaries are involved.

## Core principle

AI suggestions are hypotheses, not answers. Prefer executable evidence over another model opinion whenever the claim can be measured by running code.

## Product boundaries

- Keep the core small and provider-agnostic.
- Do not lock the project to one coding agent, model provider, retrieval technique, framework, or application domain.
- Separate proposal/question → hypotheses → candidates → worlds → simulation → evidence → human decision.
- Preserve the distinction between measured evidence, regressions/failures, and unknowns.
- Do not present synthetic or held-out synthetic results as production proof.

## Change discipline

- A feature belongs in core only when it improves reproducibility, falsifiability, observability, or safety across projects; otherwise prefer a project-specific adapter/example.
- Keep PR-sized changes focused.
- Do not weaken planner/candidate isolation or secret-redaction/execution-boundary safeguards without explicitly updating `SECURITY.md`.
- Do not commit `.ohmyproof/reports/`, credentials, private datasets, or proprietary fixtures.

## Verification

Relevant checks:

```bash
npm test
npm run public:check
npm run check
```

For experiment-semantics changes, also run the relevant demo/campaign and inspect the generated report rather than relying only on unit tests.
