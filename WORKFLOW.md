# Codex + Claude Workflow

This repo now has a simple split of responsibilities:

- Codex writes code, runs tests, and reports what changed.
- Claude critiques the plan or the diff for bugs, race conditions, regressions, and missing tests.

## Default Loop

1. Ask Codex to inspect, plan, implement, and test the change.
2. Ask Codex for:
   - a short change summary
   - tests run
   - remaining uncertainty
3. Run Claude automatically:
   - `bash scripts/claude_check.sh review`
   - `bash scripts/claude_check.sh plan --task-file /tmp/task.txt --plan-file /tmp/plan.txt`
4. Give Codex the Claude findings file or paste the findings back here.
5. Let Codex fix the findings and rerun tests.
6. If the change was risky, run one final Claude review pass.

## When To Use Each Packet

- `plan`: before code changes, for edge cases, races, auth holes, and safer implementation ideas.
- `review`: after code changes, for bugs, regressions, stale UI state, concurrency issues, and missing tests.

## Important Rules

- Do not have Codex and Claude edit the same change in parallel.
- Use Claude as a reviewer by default, not a second implementer.
- Treat `No blocking findings` as good, not as proof the code is perfect.
- Paste the full finding text back to Codex, including file and line references.

## Quick Commands

Run an automatic diff review:

```bash
bash scripts/claude_check.sh review
```

Write the Claude review result to a custom file:

```bash
bash scripts/claude_check.sh review /tmp/jam-review-result.md
```

Run a focused review on only the files touched in the change:

```bash
bash scripts/claude_check.sh review /tmp/jam-review-result.md -- backend/app/api/routers/jams.py backend/app/api/routers/songs.py front-end/src/App.jsx
```

Generate only the packet without calling Claude:

```bash
bash scripts/claude_packet.sh review /tmp/jam-review-packet.md
```

Run a plan critique automatically:

```bash
bash scripts/claude_check.sh plan --task-file /tmp/task.txt --plan-file /tmp/plan.txt
```

Compare the current branch to a base ref instead of the working tree:

```bash
CLAUDE_PACKET_BASE=main bash scripts/claude_check.sh review
```

Control model and effort:

```bash
CLAUDE_MODEL=sonnet CLAUDE_EFFORT=high bash scripts/claude_check.sh review
```

## Recommended Operating Pattern

For ordinary changes:

1. Codex implements.
2. Claude reviews through `scripts/claude_check.sh review`.
3. Codex patches findings.

For risky changes:

1. Claude critiques the plan through `scripts/claude_check.sh plan`.
2. Codex implements.
3. Claude reviews the diff through `scripts/claude_check.sh review`.
4. Codex patches findings.
5. Claude does a final pass if needed.

## What To Ask Codex For

Before review, ask Codex to include:

- changed files
- tests run
- known gaps
- any assumptions that were not proven

That makes Claude's review sharper.
