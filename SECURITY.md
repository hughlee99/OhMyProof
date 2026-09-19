# Security

OhMyProof runs code and coding agents in order to produce executable evidence. Treat that capability as powerful, not as a security boundary.

## Current security model

OhMyProof v0.2 provides **experiment isolation**, not hostile-code isolation.

- Baseline, candidate, and planner states use separate Git worktrees.
- Simulation subprocesses receive a reduced environment by default instead of inheriting all parent secrets.
- Agent-generated planner work is rejected if it changes repository files outside the allowed `.ohmyproof/` experiment directory.
- Persisted reports and agent logs apply best-effort redaction for common credential patterns and secret-bearing environment variables.
- Simulation executables are limited to an explicit development-tool allowlist.

OhMyProof does **not** currently provide:

- a container, VM, or OS security sandbox;
- protection from malicious repositories or malicious package scripts;
- complete prevention of network access;
- guaranteed secret detection or redaction;
- safe execution of untrusted campaign bundles.

Only run OhMyProof on repositories, dependencies, campaign files, and coding agents you trust.

## Reporting a vulnerability

Please do not open a public issue containing an exploit, credential, or sensitive reproduction data.

Until a dedicated security contact is published, open a minimal GitHub issue stating that you found a security issue and request a private contact channel. Do not include sensitive details in the issue.

## Generated artifacts

Artifacts under `.ohmyproof/reports/` may contain source snippets, benchmark inputs, failure examples, paths, or application output. The directory is ignored by default. Review artifacts before sharing or attaching them to public issues.
