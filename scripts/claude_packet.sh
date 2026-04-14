#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  bash scripts/claude_packet.sh <plan|review> [output-file] [-- pathspec...]

Environment:
  CLAUDE_PACKET_BASE=<git-ref>
    If set, generate a branch-vs-base packet using <git-ref>...HEAD.
    If unset, generate a packet from the current staged and unstaged worktree.

Examples:
  bash scripts/claude_packet.sh plan
  bash scripts/claude_packet.sh review /tmp/jam-review.md
  bash scripts/claude_packet.sh review /tmp/jam-review.md -- backend/app/api/routers/jams.py front-end/src/App.jsx
  CLAUDE_PACKET_BASE=main bash scripts/claude_packet.sh review
EOF
}

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

mode="$1"
shift
output_path="/tmp/claude-${mode}-packet.md"
pathspec=()

if [[ $# -gt 0 && "$1" != "--" ]]; then
  output_path="$1"
  shift
fi

if [[ $# -gt 0 ]]; then
  if [[ "$1" != "--" ]]; then
    usage
    exit 1
  fi
  shift
  pathspec=("$@")
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

case "$mode" in
  plan)
    prompt_file="PLAN_PROMPT.md"
    title="Claude Plan Review Packet"
    ;;
  review)
    prompt_file="REVIEW_PROMPT.md"
    title="Claude Diff Review Packet"
    ;;
  *)
    usage
    exit 1
    ;;
esac

base_ref="${CLAUDE_PACKET_BASE:-}"
timestamp="$(date -Is)"
branch="$(git branch --show-current 2>/dev/null || true)"
branch="${branch:-detached}"

if [[ -n "$base_ref" ]]; then
  diff_label="${base_ref}...HEAD"
else
  diff_label="working tree"
fi

git_paths=(--)
if [[ ${#pathspec[@]} -gt 0 ]]; then
  diff_label="${diff_label} scoped to ${pathspec[*]}"
  git_paths+=( "${pathspec[@]}" )
fi

untracked_files=()
if [[ ${#pathspec[@]} -gt 0 ]]; then
  while IFS= read -r line; do
    untracked_files+=("$line")
  done < <(git ls-files --others --exclude-standard -- "${pathspec[@]}" || true)
else
  while IFS= read -r line; do
    untracked_files+=("$line")
  done < <(git ls-files --others --exclude-standard || true)
fi

{
  printf '# %s\n\n' "$title"
  printf '%s\n' "- Generated: \`$timestamp\`"
  printf '%s\n' "- Repository: \`$(basename "$repo_root")\`"
  printf '%s\n' "- Branch: \`$branch\`"
  printf '%s\n\n' "- Diff source: \`$diff_label\`"

  printf '## Prompt\n\n'
  cat "$prompt_file"
  printf '\n\n'

  printf '## Git Status\n\n'
  printf '```text\n'
  git status --short "${git_paths[@]}" || true
  printf '```\n\n'

  if [[ -n "$base_ref" ]]; then
    printf '## Diff Stat\n\n'
    printf '```text\n'
    git diff --stat "${base_ref}...HEAD" "${git_paths[@]}" || true
    printf '```\n\n'

    printf '## Changed Files\n\n'
    printf '```text\n'
    git diff --name-only "${base_ref}...HEAD" "${git_paths[@]}" || true
    printf '```\n\n'

    printf '## Patch\n\n'
    printf '```diff\n'
    git diff "${base_ref}...HEAD" "${git_paths[@]}" || true
    printf '```\n'
  else
    printf '## Staged Diff Stat\n\n'
    printf '```text\n'
    git diff --cached --stat "${git_paths[@]}" || true
    printf '```\n\n'

    printf '## Unstaged Diff Stat\n\n'
    printf '```text\n'
    git diff --stat "${git_paths[@]}" || true
    printf '```\n\n'

    printf '## Staged Patch\n\n'
    printf '```diff\n'
    git diff --cached "${git_paths[@]}" || true
    printf '```\n\n'

    printf '## Unstaged Patch\n\n'
    printf '```diff\n'
    git diff "${git_paths[@]}" || true
    printf '```\n'
  fi

  if [[ ${#untracked_files[@]} -gt 0 ]]; then
    printf '\n## Untracked Files\n\n'
    printf '```text\n'
    printf '%s\n' "${untracked_files[@]}"
    printf '```\n\n'

    printf '## Untracked Patch\n\n'
    printf '```diff\n'
    for file_path in "${untracked_files[@]}"; do
      git diff --no-index -- /dev/null "$file_path" || true
    done
    printf '```\n'
  fi
} > "$output_path"

printf 'Wrote %s packet to %s\n' "$mode" "$output_path"
