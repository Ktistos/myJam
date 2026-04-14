#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_ENV_FILE="${IMAGE_ENV_FILE:-${ROOT_DIR}/.k8s-images.env}"

usage() {
  cat <<EOF
Usage: bash scripts/publish-and-redeploy.sh [backend|frontend|all]

Required for registry pushes:
  BACKEND_IMAGE_REPO
  FRONTEND_IMAGE_REPO

Optional:
  IMAGE_TAG              defaults to current git short SHA
  RUN_BACKEND_MIGRATION  defaults to 1
EOF
}

TARGET="${1:-all}"
case "${TARGET}" in
  backend|frontend|all) ;;
  -h|--help)
    usage
    exit 0
    ;;
  *)
    usage >&2
    exit 1
    ;;
esac

if [[ "${TARGET}" == "backend" ]]; then
  : "${BACKEND_IMAGE_REPO:?Set BACKEND_IMAGE_REPO, e.g. ghcr.io/your-org/myjam-backend}"
fi
if [[ "${TARGET}" == "frontend" ]]; then
  : "${FRONTEND_IMAGE_REPO:?Set FRONTEND_IMAGE_REPO, e.g. ghcr.io/your-org/myjam-frontend}"
fi
if [[ "${TARGET}" == "all" ]]; then
  : "${BACKEND_IMAGE_REPO:?Set BACKEND_IMAGE_REPO, e.g. ghcr.io/your-org/myjam-backend}"
  : "${FRONTEND_IMAGE_REPO:?Set FRONTEND_IMAGE_REPO, e.g. ghcr.io/your-org/myjam-frontend}"
fi

PUSH_IMAGES=1 bash "${ROOT_DIR}/scripts/build-images.sh" "${TARGET}"

# shellcheck disable=SC1090
source "${IMAGE_ENV_FILE}"

bash "${ROOT_DIR}/scripts/redeploy-images.sh" "${TARGET}"
