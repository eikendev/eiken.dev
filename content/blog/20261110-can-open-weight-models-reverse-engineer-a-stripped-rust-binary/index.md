---
title: "Can open-weight models reverse-engineer a stripped Rust binary?"
date: 2026-11-10T17:25:00Z
tags: ["ai", "llm", "reverse-engineering", "rust", "open-weight"]
chartjs: true
---

I took a stripped Rust binary from a small tool I've been maintaining since 2021, handed it to four open-weight models, and asked them to explain how one piece of its logic works.
Each model got its own sandbox and had to work alone, without running the binary.
I ran each one 3 times.
The best model was never wrong.
The rest were basically a coin flip, and not one of them ever came back with "I don't know".

<!--more-->

The binary is fully optimised and stripped (no symbols).
Most of the standard library is inlined into a handful of very large functions.
This means models have to actually read the code and reason out what it does.

## Results

| Model | Runs (1st, 2nd, 3rd) | Mean | Cost per run | Time per run |
|---|---|---|---|---|
| DeepSeek V4.1 Flash | ✓ ✗ ✓ | 0.50 | **$0.29** | 24 min |
| GLM 5.3 | ½ ✓ ✓ | **0.83** | $1.89 | 19 min |
| Kimi K3 | ✗ ✓ ✗ | 0.00 | $1.21 | 11 min |
| Mistral Large 4 | ✓ ✗ ✗ | 0.00 | $0.80 | 19 min |
{caption="✓ = right (1), ½ = mostly right (0.5), ✗ = wrong (−0.5). Saying “unknown” would have counted as 0."}

The twelve cost me about $12.60 in total.

## What stood out

The run-to-run spread inside a single model is bigger than the gap between models.
3/4 models had at least 1x fully correct run and 1x wrong run.
One run per model tells you almost nothing.

I know this would deserve more runs, across more questions, and more targets.
But it's sufficient to satisfy my own curiosity for now.

{{< chart id="runs" width=800 height=300 >}}

GLM seems to be careful.
It never got it wrong, and its one partial answer missed a single detail.
It's also the priciest model, and it hit the step limit twice.

DeepSeek wins on value: roughly a sixth of GLM's price for a mean of 0.5.
Its one bad run burned the whole budget and took 45 minutes.
It ran out of steps before finishing and handed in something "rushed".

{{< chart id="value" width=800 height=360 >}}

Kimi and Mistral quit too early.
Their wrong runs finished well inside the budget with a confident wrong answer, while their right runs took longer.
It's not that they can't do it; they just decide they're done before they've checked.[^prompt]

No model said "I don't know".
All twelve runs gave a confident answer, even though the models know a wrong one scores worse than "unknown".

At least every run found the correct function.
The wrong answers all misread what that function does with the data, and they got it wrong in one of the same handful of ways.

## How I ran it

Each run is a single [OpenCode](https://opencode.ai) agent session inside a [Podman](https://podman.io) container:

- No network, apart from the model API.[^proxy]
- The binary isn't executable, and the prompt forbids running or emulating it.
  The harness flags any attempt, and a flagged run is thrown out.
- Static tools only: the usual binutils, plus a decompiler, a disassembler and a binary analysis framework, each with a short guide.[^tools]
- At most 100 steps (model turns).[^budget]

All models went through [OpenRouter](https://openrouter.ai) with [zero data retention](https://openrouter.ai/docs/features/zdr), at high reasoning effort.

An LLM judge (Gemini 4 Argon) grades each answer against a "solution" I wrote myself.

## Caveats

- 1x binary, 1x question, 3x runs per model.
  Read the outcomes here as a tendency: a single lucky or unlucky run would move any model's mean a lot.
- The source is public, so a model could in theory know the tool from training.
  Nothing in the transcripts points that way, and the wrong answers don't read like recalled memory, but I also can't rule it out.
- Everything ran in one harness, OpenCode, with its tool set and its way of counting steps.
  A different agent harness could change the results.
- The runs aren't fully isolated.
  All containers share OpenCode's session database, so in theory a run could read an earlier run's answer.
  The transcripts show no sign of it, but nothing prevents it.

[^prompt]: Maybe could be solved through a better prompt?

[^proxy]: Solved with my own [tinyproxy](https://tinyproxy.github.io) gateway.

[^tools]: [kuna](https://github.com/Noelo-Lab/kuna) 1.993, [rizin](https://rizin.re) 0.9.1, and [angr](https://angr.io) 10.0.5, plus [binwalk](https://github.com/ReFirmLabs/binwalk).

[^budget]: In trial runs with 50 steps every model got the question wrong, so the budget is deliberately generous.
