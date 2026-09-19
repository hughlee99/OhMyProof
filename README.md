# OhMyProof

[English](README.md) | [한국어](README.ko.md)

You've probably heard something like this from a coding agent:

> "Add Redis. It'll be faster."
>
> "Use a vector DB here."
>
> "This architecture will scale better."

The code runs. The explanation sounds right. And usually nobody actually runs the old version and the new one side by side to see if it was worth it.

I kept running into that, so I made OhMyProof.

**OhMyProof takes technical suggestions from AI and tests them against the actual project.**

A suggestion is not the answer. It's a hypothesis. Put it next to the baseline, add other reasonable options when there are any, run the same workload, and look at what happened.

```text
"Redis is better"
        ↓
     is it?
        ↓
Baseline / Redis / other options
        ↓
    same workload
        ↓
performance · cost · failures · regressions
        ↓
       Evidence
```

Vibe coding already makes building things ridiculously fast. The harder part now is figuring out which of those suggestions are actually worth keeping.

---

## 30 seconds

To test one suggestion:

```bash
node ./bin/ohmyproof.js prove \
  "Add Redis caching to reduce API latency" \
  --repo . \
  --agent codex
```

The planner decides how to test the claim first. Then OhMyProof keeps the current code and the AI-modified version separate and runs the same simulation against both.

Say you get this:

```text
Latency        487ms  → 201ms
DB queries     12.4   → 3.1
Memory         221MB  → 514MB

Claim          SUPPORTED
Regression     FOUND
Unknown        production ops cost
```

Great, latency dropped a lot. Memory also more than doubled.

Now there is at least something real to make the decision from.

---

## Can't I just ask the AI again?

That's what I did at first.

"Are you sure this is the best approach?"
"Is there a simpler way?"

But what I wanted to know was not whether the model could come up with a better explanation. I wanted to know whether it was **actually better**.

If the question is measurable, I'd rather run it.

- Do more tests pass?
- Did latency go down?
- Did query count go down?
- How much memory did it add?
- Did the bundle get bigger?
- What breaks on edge cases?
- Does it still hold when the data gets larger?

That's basically what OhMyProof does: turn AI claims into **experiments you can actually run**.

---

## More than one candidate

The first version only compared a baseline and one candidate. That wasn't enough for long.

If an agent says "use a vector DB," I don't only want to know if the vector DB beats whatever I have now. There might be BM25, TF-IDF, FTS, embeddings, or a hybrid that does the job with less complexity.

So Campaign mode lets me run all of them against the same setup.

```text
Candidates
× Worlds / Seeds
× Parameters
× Repeats
```

```bash
node ./bin/ohmyproof.js campaign \
  --campaign examples/retrieval-campaign/campaign.json \
  --repo .
```

The demo in this repo compares:

- Full Context
- Token Match
- Character n-gram
- Character n-gram + Recent Context

It also sweeps `Top-K = 5 / 10 / 20` across multiple seeded worlds.

60 experiment cells in total.

---

## What happened when I ran it

On my latest local run, calibration picked:

```text
Character n-gram + Recent Context
Top-K = 5
```

```text
Calibration recall
mean     100.00%
worst    100.00%

Held-out recall
mean      99.875%
worst     99.75%

Held-out constraint
PASSED
```

That looks pretty clear until you look at the failures.

Token Match mostly broke on typos. Character n-gram mostly broke on follow-up queries. Adding Recent Context recovered most of those follow-up failures.

The winning number matters, but the failures usually tell me more about what to try next.

---

## Calibration can lie too

An experiment can overfit.

If the same agent writes the scenarios, implements the candidate, tunes the threshold, and then gets graded on the same cases, of course it can look good.

Campaigns can split worlds into:

```text
explore
calibration
heldout
```

Pick the candidate and parameters on calibration, freeze them, then run the same choice against held-out worlds.

If it still works, good. If it falls apart, the calibration set was probably rewarding something too specific.

Held-out synthetic data is still synthetic data. OhMyProof doesn't pretend otherwise. The report keeps track of what the experiment showed and what it still did not answer.

---

## Let the agent design the experiment

This part is still experimental.

```bash
node ./bin/ohmyproof.js investigate \
  "What simple retrieval architecture should this project use?" \
  --repo . \
  --agent codex
```

The agent does not get the job "answer this question."

It gets the repo and has to figure out what should be compared, how to compare it, and what cases are likely to break the candidates.

For example:

- candidate implementations
- synthetic worlds
- parameter sweeps
- failure cases
- calibration / held-out splits

Then OhMyProof runs what it came up with.

---

## Bring your own experiment

Metrics:

```text
OHMYPROOF_METRIC recall=0.998
OHMYPROOF_METRIC p95_ms=183.2
OHMYPROOF_METRIC memory_mb=412
```

Failures:

```text
OHMYPROOF_FAILURE {"type":"typo","case":"broken query"}
```

Campaigns also expose the current candidate, world, split, and parameters:

```text
OHMYPROOF_CANDIDATE
OHMYPROOF_WORLD
OHMYPROOF_SPLIT
OHMYPROOF_PARAM_<KEY>
```

There is no SDK. Node, Python, whatever — if it can run locally and print the expected lines to stdout, it works.

For now I prefer it that way.

---

## What I'm trying not to build

I don't want another eval tool where one LLM gives another LLM's output an 8.2 and that somehow becomes proof that the system improved.

Sometimes an LLM judge is the right tool. UI feel, writing quality, other genuinely subjective things — sure.

But if the program can answer the question by running, run the program first.

```text
can measure it by running  → run it
execution isn't enough     → use something else
```

---

## Install

- Node.js 20+
- Git
- Codex CLI or Claude Code if you want the agent to design experiments

No runtime npm dependencies right now.

```bash
git clone https://github.com/hughlee99/OhMyProof.git
cd OhMyProof

npm ci
npm test
npm run demo
```

It is not on npm yet, so for now:

```bash
node ./bin/ohmyproof.js help
```

The `ohmyproof` package name was still available the last time I checked. Once this is published, the install flow should get less ugly.

---

## Artifacts

Runs go here:

```text
.ohmyproof/reports/<run-id>/
```

A proof keeps:

```text
report.md
proof.json
experiment.json
candidate.diff
planner-agent.log
candidate-agent.log
```

A campaign keeps:

```text
report.md
campaign.json
matrix.json
summaries.json
failure-clusters.json
```

---

## Not a security sandbox

Right now OhMyProof uses Git worktrees to keep planner, baseline, and candidate states separate. Planner changes outside `.ohmyproof/` are rejected, simulation subprocesses do not inherit the full parent environment, and persisted logs get basic secret redaction.

That does **not** make untrusted code safe.

Package scripts run code. Agents run code. Simulations run code.

So don't point this at a repo or campaign you don't trust yet.

Container / VM isolation is still future work. The current model is documented in [SECURITY.md](SECURITY.md).

---

## Why I made this

The more I vibe coded, the more I noticed that better models did not really make bad technical suggestions disappear. They just made some of them harder to spot.

The code looked fine, the explanation sounded right, and then I'd ask, "Are you sure this is the best approach?" Sometimes the model would suddenly change its mind; other times it would come back with an even longer explanation. What I actually wanted to know was much simpler: whether the change was better **in this repo**.

So I started running the ideas whenever I could.

I still don't know whether OhMyProof ends up as a CLI, an MCP/CI tool, or something closer to production workload replay. I'll figure that out by using it.

---

## Contributing

This is early. A lot can still change.

See [CONTRIBUTING.md](CONTRIBUTING.md).

Reusable experiment primitives, better ways to falsify technical claims, or experiments showing that OhMyProof itself is doing something dumb are all welcome.

---

## License

MIT
