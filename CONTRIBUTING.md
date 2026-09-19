# Contributing to OhMyProof

OhMyProof is an experimental open-source harness for evidence-driven AI-assisted software development.

## Before contributing

Keep the core principle intact:

> AI suggestions are hypotheses, not answers.

A contribution should make experiments more reproducible, falsifiable, observable, or safe. Avoid features that merely add another LLM opinion where executable evidence is available.

## Development

Requirements:

- Node.js 20+
- Git

Run the test suite:

```bash
npm test
```

Run the local retrieval campaign:

```bash
node ./bin/ohmyproof.js campaign \
  --campaign examples/retrieval-campaign/campaign.json \
  --repo .
```

Check the CLI:

```bash
node ./bin/ohmyproof.js help
node ./bin/ohmyproof.js doctor
```

## Pull requests

Please keep pull requests focused. Include:

- the problem being solved;
- why the change belongs in the core rather than a project-specific adapter;
- tests for deterministic behavior;
- any security or execution-boundary implications;
- a before/after example when changing reports or experiment semantics.

Do not commit generated `.ohmyproof/reports/` artifacts, credentials, private datasets, or proprietary repository fixtures.

## Design direction

Current stable concepts are intentionally small:

```text
Proposal / Question
→ Hypotheses
→ Candidates
→ Worlds
→ Simulation
→ Evidence
→ Human decision
```

Execution backends and experiment primitives may evolve. Avoid locking the project to a single coding agent, model provider, retrieval technique, framework, or application domain.
