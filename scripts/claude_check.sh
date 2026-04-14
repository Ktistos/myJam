#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  bash scripts/claude_check.sh review [response-file] [-- pathspec...]
  bash scripts/claude_check.sh plan --task-file PATH --plan-file PATH [response-file]

Environment:
  CLAUDE_PACKET_BASE=<git-ref>
    Optional git base ref. If set, include diff from <git-ref>...HEAD.

  CLAUDE_MODEL=<model>
    Claude model alias or full model name. Default: inherited Claude CLI default.

  CLAUDE_EFFORT=<low|medium|high|max>
    Claude effort level. Default: medium.

Examples:
  bash scripts/claude_check.sh review
  bash scripts/claude_check.sh review /tmp/jam-review-result.md
  bash scripts/claude_check.sh review /tmp/jam-review-result.md -- backend/app/api/routers/jams.py front-end/src/App.jsx
  bash scripts/claude_check.sh plan --task-file /tmp/task.txt --plan-file /tmp/plan.txt
  CLAUDE_PACKET_BASE=main bash scripts/claude_check.sh review
EOF
}

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

mode="$1"
shift

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

packet_path=""
response_path=""
task_file=""
plan_file=""
review_pathspec=()

append_diff_sections() {
  local base_ref="${CLAUDE_PACKET_BASE:-}"

  printf '## Git Status\n\n'
  printf '```text\n'
  git status --short || true
  printf '```\n\n'

  if [[ -n "$base_ref" ]]; then
    printf '## Diff Stat\n\n'
    printf '```text\n'
    git diff --stat "${base_ref}...HEAD" -- . || true
    printf '```\n\n'

    printf '## Changed Files\n\n'
    printf '```text\n'
    git diff --name-only "${base_ref}...HEAD" -- . || true
    printf '```\n\n'

    printf '## Patch\n\n'
    printf '```diff\n'
    git diff "${base_ref}...HEAD" -- . || true
    printf '```\n'
  else
    printf '## Staged Diff Stat\n\n'
    printf '```text\n'
    git diff --cached --stat -- . || true
    printf '```\n\n'

    printf '## Unstaged Diff Stat\n\n'
    printf '```text\n'
    git diff --stat -- . || true
    printf '```\n\n'

    printf '## Staged Patch\n\n'
    printf '```diff\n'
    git diff --cached -- . || true
    printf '```\n\n'

    printf '## Unstaged Patch\n\n'
    printf '```diff\n'
    git diff -- . || true
    printf '```\n'
  fi
}

generate_plan_packet() {
  local out_path="$1"
  local timestamp branch diff_label base_ref

  timestamp="$(date -Is)"
  branch="$(git branch --show-current 2>/dev/null || true)"
  branch="${branch:-detached}"
  base_ref="${CLAUDE_PACKET_BASE:-}"
  if [[ -n "$base_ref" ]]; then
    diff_label="${base_ref}...HEAD"
  else
    diff_label="working tree"
  fi

  {
    printf '# Claude Plan Review Packet\n\n'
    printf '%s\n' "- Generated: \`$timestamp\`"
    printf '%s\n' "- Repository: \`$(basename "$repo_root")\`"
    printf '%s\n' "- Branch: \`$branch\`"
    printf '%s\n\n' "- Diff source: \`$diff_label\`"

    cat <<'EOF'
## Prompt

You are reviewing a proposed change to the `Jam` repo before implementation.

Your job is to critique the plan aggressively. Do not implement fixes unless explicitly asked.

Project context:

- Backend: FastAPI + SQLAlchemy + Postgres
- Frontend: React/Vite
- Real-time: Redis-backed SSE
- Users may open two browsers with the same account and act concurrently

Focus on:

- hidden edge cases
- concurrency and idempotency
- stale UI and multi-browser behavior
- auth and permission mistakes
- transaction boundaries
- missing row locks
- missing DB constraints
- destructive edge cases and data loss
- missing tests
- simpler or safer implementation strategies

Reply with:

1. blockers
2. likely bugs
3. missing tests
4. safer plan

Be skeptical. If something is only "probably fine," treat that as unproven and call it out.

## Task

EOF
    cat "$task_file"
    printf '\n\n## Proposed Plan\n\n'
    cat "$plan_file"
    printf '\n\n'
    append_diff_sections
  } > "$out_path"
}

case "$mode" in
  review)
    if [[ $# -gt 0 && "$1" != "--" ]]; then
      response_path="$1"
      shift
    else
      response_path="/tmp/claude-review-result.md"
    fi

    if [[ $# -gt 0 ]]; then
      if [[ "$1" != "--" ]]; then
        printf 'review mode pathspecs must follow --\n\n' >&2
        usage >&2
        exit 1
      fi
      shift
      review_pathspec=("$@")
    fi

    packet_path="$(mktemp /tmp/claude-review-packet.XXXXXX.md)"
    bash scripts/claude_packet.sh review "$packet_path" "${review_pathspec[@]:+--}" "${review_pathspec[@]}" >/dev/null
    ;;
  plan)
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --task-file)
          task_file="${2:-}"
          shift 2
          ;;
        --plan-file)
          plan_file="${2:-}"
          shift 2
          ;;
        -*)
          printf 'Unknown option: %s\n\n' "$1" >&2
          usage >&2
          exit 1
          ;;
        *)
          response_path="$1"
          shift
          ;;
      esac
    done

    if [[ -z "$task_file" || -z "$plan_file" ]]; then
      printf 'plan mode requires --task-file and --plan-file\n\n' >&2
      usage >&2
      exit 1
    fi
    if [[ ! -f "$task_file" || ! -f "$plan_file" ]]; then
      printf 'Task file or plan file not found\n' >&2
      exit 1
    fi

    response_path="${response_path:-/tmp/claude-plan-result.md}"
    packet_path="$(mktemp /tmp/claude-plan-packet.XXXXXX.md)"
    generate_plan_packet "$packet_path"
    ;;
  *)
    usage
    exit 1
    ;;
esac

claude_cmd=(claude -p --output-format text --permission-mode dontAsk --tools "" --no-session-persistence)
if [[ -n "${CLAUDE_MODEL:-}" ]]; then
  claude_cmd+=(--model "$CLAUDE_MODEL")
fi
claude_cmd+=(--effort "${CLAUDE_EFFORT:-medium}")

set +e
"${claude_cmd[@]}" < "$packet_path" > "$response_path"
status=$?
set -e

if [[ "$status" -ne 0 ]]; then
  printf 'Claude %s failed with exit code %s\n' "$mode" "$status" >&2
  printf 'Packet saved at %s\n' "$packet_path" >&2
  exit "$status"
fi

printf 'Claude %s completed.\n' "$mode"
printf 'Packet: %s\n' "$packet_path"
printf 'Response: %s\n' "$response_path"
