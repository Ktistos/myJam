#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  cat <<'EOF'
Usage: bash scripts/bootstrap-github-actions.sh [build|deploy|all]

Reads local env files and pushes GitHub Actions variables and secrets to the
repository configured as git origin. Requires GitHub CLI (`gh`) to be installed
and authenticated.

Targets:
  build   configure image repos and frontend build secrets
  deploy  configure cluster/deploy variables and secrets
  all     configure both build and deploy settings

Expected local files:
  .env
  front-end/.env.local

Important:
  GitHub-hosted runners cannot deploy to local Minikube. Use deploy settings
  here only for a reachable cluster.
EOF
}

TARGET="${1:-all}"
case "${TARGET}" in
  build|deploy|all) ;;
  -h|--help)
    usage
    exit 0
    ;;
  *)
    usage >&2
    exit 1
    ;;
esac

if ! command -v gh >/dev/null 2>&1; then
  echo "Missing required command: gh" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI is not authenticated. Run: gh auth login" >&2
  exit 1
fi

repo_slug_from_remote() {
  local remote_url
  remote_url="$(git -C "${ROOT_DIR}" remote get-url origin 2>/dev/null || true)"
  if [[ -z "${remote_url}" ]]; then
    return 1
  fi

  if [[ "${remote_url}" =~ ^git@github\.com:([^/]+)/(.+)\.git$ ]]; then
    printf '%s/%s\n' "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}"
    return 0
  fi

  if [[ "${remote_url}" =~ ^https://github\.com/([^/]+)/(.+)\.git$ ]]; then
    printf '%s/%s\n' "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}"
    return 0
  fi

  return 1
}

REPO="${GITHUB_REPO:-$(repo_slug_from_remote || true)}"
if [[ -z "${REPO}" ]]; then
  echo "Could not determine GitHub repository from origin remote. Set GITHUB_REPO=owner/repo." >&2
  exit 1
fi

load_env_file() {
  local file="$1"
  if [[ -f "${file}" ]]; then
    # shellcheck disable=SC1090
    set -a && source "${file}" && set +a
  fi
}

load_env_file "${ROOT_DIR}/.env"
load_env_file "${ROOT_DIR}/front-end/.env.local"

: "${VITE_FIREBASE_PROJECT_ID:=${FIREBASE_PROJECT_ID:-}}"
: "${K8S_NAMESPACE:=jam}"
: "${K8S_STORAGE_NAMESPACE:=jam-storage}"
: "${MINIO_OPERATOR_NAMESPACE:=minio-operator}"
: "${INGRESS_CLASS_NAME:=nginx}"
: "${INSTALL_MINIO_OPERATOR:=1}"
: "${APPLY_MINIO_INGRESS:=1}"
: "${MINIO_OPERATOR_REF:=v7.1.1}"
: "${MINIO_STORAGE_SIZE:=10Gi}"
: "${SPOTIFY_MARKET:=US}"
: "${IMAGE_PULL_SERVER:=ghcr.io}"

owner="${REPO%%/*}"
repo_name="${REPO#*/}"
owner_lc="$(printf '%s' "${owner}" | tr '[:upper:]' '[:lower:]')"
repo_lc="$(printf '%s' "${repo_name}" | tr '[:upper:]' '[:lower:]')"

: "${BACKEND_IMAGE_REPO:=ghcr.io/${owner_lc}/${repo_lc}-backend}"
: "${FRONTEND_IMAGE_REPO:=ghcr.io/${owner_lc}/${repo_lc}-frontend}"

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: ${name}" >&2
    exit 1
  fi
}

set_repo_variable() {
  local name="$1"
  local value="$2"
  gh variable set "${name}" --body "${value}" --repo "${REPO}"
}

set_repo_secret() {
  local name="$1"
  local value="$2"
  gh secret set "${name}" --body "${value}" --repo "${REPO}"
}

if [[ "${TARGET}" == "build" || "${TARGET}" == "all" ]]; then
  require_env BACKEND_IMAGE_REPO
  require_env FRONTEND_IMAGE_REPO
  require_env FIREBASE_PROJECT_ID
  require_env VITE_FIREBASE_API_KEY
  require_env VITE_FIREBASE_AUTH_DOMAIN
  require_env VITE_FIREBASE_PROJECT_ID
  require_env VITE_FIREBASE_STORAGE_BUCKET
  require_env VITE_FIREBASE_MESSAGING_SENDER_ID
  require_env VITE_FIREBASE_APP_ID

  set_repo_variable BACKEND_IMAGE_REPO "${BACKEND_IMAGE_REPO}"
  set_repo_variable FRONTEND_IMAGE_REPO "${FRONTEND_IMAGE_REPO}"
  set_repo_variable VITE_API_URL "${VITE_API_URL:-}"

  set_repo_secret FIREBASE_PROJECT_ID "${FIREBASE_PROJECT_ID}"
  set_repo_secret VITE_FIREBASE_API_KEY "${VITE_FIREBASE_API_KEY}"
  set_repo_secret VITE_FIREBASE_AUTH_DOMAIN "${VITE_FIREBASE_AUTH_DOMAIN}"
  set_repo_secret VITE_FIREBASE_PROJECT_ID "${VITE_FIREBASE_PROJECT_ID}"
  set_repo_secret VITE_FIREBASE_STORAGE_BUCKET "${VITE_FIREBASE_STORAGE_BUCKET}"
  set_repo_secret VITE_FIREBASE_MESSAGING_SENDER_ID "${VITE_FIREBASE_MESSAGING_SENDER_ID}"
  set_repo_secret VITE_FIREBASE_APP_ID "${VITE_FIREBASE_APP_ID}"
fi

if [[ "${TARGET}" == "deploy" || "${TARGET}" == "all" ]]; then
  require_env APP_HOST
  require_env MINIO_API_HOST
  require_env POSTGRES_PASSWORD
  require_env MINIO_ROOT_USER
  require_env MINIO_ROOT_PASSWORD
  require_env KUBECONFIG_B64

  set_repo_variable K8S_NAMESPACE "${K8S_NAMESPACE}"
  set_repo_variable K8S_STORAGE_NAMESPACE "${K8S_STORAGE_NAMESPACE}"
  set_repo_variable MINIO_OPERATOR_NAMESPACE "${MINIO_OPERATOR_NAMESPACE}"
  set_repo_variable INGRESS_CLASS_NAME "${INGRESS_CLASS_NAME}"
  set_repo_variable INSTALL_MINIO_OPERATOR "${INSTALL_MINIO_OPERATOR}"
  set_repo_variable APPLY_MINIO_INGRESS "${APPLY_MINIO_INGRESS}"
  set_repo_variable MINIO_OPERATOR_REF "${MINIO_OPERATOR_REF}"
  set_repo_variable MINIO_STORAGE_CLASS_NAME "${MINIO_STORAGE_CLASS_NAME:-}"
  set_repo_variable MINIO_STORAGE_SIZE "${MINIO_STORAGE_SIZE}"
  set_repo_variable APP_HOST "${APP_HOST}"
  set_repo_variable APP_BASE_URL "${APP_BASE_URL:-}"
  set_repo_variable MINIO_API_HOST "${MINIO_API_HOST}"
  set_repo_variable MINIO_PUBLIC_URL "${MINIO_PUBLIC_URL:-}"
  set_repo_variable SPOTIFY_MARKET "${SPOTIFY_MARKET}"

  if [[ -n "${MINIO_CONSOLE_HOST:-}" ]]; then
    set_repo_variable MINIO_CONSOLE_HOST "${MINIO_CONSOLE_HOST}"
  fi
  if [[ -n "${MINIO_CONSOLE_REDIRECT_URL:-}" ]]; then
    set_repo_variable MINIO_CONSOLE_REDIRECT_URL "${MINIO_CONSOLE_REDIRECT_URL}"
  fi

  set_repo_secret KUBECONFIG_B64 "${KUBECONFIG_B64}"
  set_repo_secret POSTGRES_PASSWORD "${POSTGRES_PASSWORD}"
  set_repo_secret MINIO_ROOT_USER "${MINIO_ROOT_USER}"
  set_repo_secret MINIO_ROOT_PASSWORD "${MINIO_ROOT_PASSWORD}"

  if [[ -n "${SPOTIFY_CLIENT_ID:-}" ]]; then
    set_repo_secret SPOTIFY_CLIENT_ID "${SPOTIFY_CLIENT_ID}"
  fi
  if [[ -n "${SPOTIFY_CLIENT_SECRET:-}" ]]; then
    set_repo_secret SPOTIFY_CLIENT_SECRET "${SPOTIFY_CLIENT_SECRET}"
  fi

  if [[ -n "${IMAGE_PULL_SECRET_NAME:-}" ]]; then
    set_repo_variable IMAGE_PULL_SECRET_NAME "${IMAGE_PULL_SECRET_NAME}"
    set_repo_variable IMAGE_PULL_SERVER "${IMAGE_PULL_SERVER}"
    set_repo_variable IMAGE_PULL_EMAIL "${IMAGE_PULL_EMAIL:-devnull@example.com}"
    require_env IMAGE_PULL_USERNAME
    require_env IMAGE_PULL_PASSWORD
    set_repo_secret IMAGE_PULL_USERNAME "${IMAGE_PULL_USERNAME}"
    set_repo_secret IMAGE_PULL_PASSWORD "${IMAGE_PULL_PASSWORD}"
  fi
fi

echo "Configured GitHub Actions ${TARGET} settings for ${REPO}."
