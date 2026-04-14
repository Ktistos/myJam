#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PUSH_IMAGES="${PUSH_IMAGES:-0}"
IMAGE_TAG="${IMAGE_TAG:-$(git -C "${ROOT_DIR}" rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)}"
IMAGE_ENV_FILE="${IMAGE_ENV_FILE:-${ROOT_DIR}/.k8s-images.env}"

usage() {
  cat <<EOF
Usage: bash scripts/build-images.sh [backend|frontend|all]
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

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: $name" >&2
    exit 1
  fi
}

: "${VITE_FIREBASE_PROJECT_ID:=${FIREBASE_PROJECT_ID:-}}"

if [[ -f "${IMAGE_ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${IMAGE_ENV_FILE}"
fi

if [[ "${TARGET}" == "frontend" || "${TARGET}" == "all" ]]; then
  require_env FIREBASE_PROJECT_ID
  require_env VITE_FIREBASE_API_KEY
  require_env VITE_FIREBASE_AUTH_DOMAIN
  require_env VITE_FIREBASE_PROJECT_ID
  require_env VITE_FIREBASE_STORAGE_BUCKET
  require_env VITE_FIREBASE_MESSAGING_SENDER_ID
  require_env VITE_FIREBASE_APP_ID
fi

API_URL="${VITE_API_URL:-}"

if [[ "${TARGET}" == "backend" || "${TARGET}" == "all" ]]; then
  if [[ -n "${BACKEND_IMAGE_REPO:-}" ]]; then
    BACKEND_IMAGE="${BACKEND_IMAGE_REPO}:${IMAGE_TAG}"
  else
    BACKEND_IMAGE="${BACKEND_IMAGE:-jam-backend:${IMAGE_TAG}}"
  fi

  docker build \
    -t "${BACKEND_IMAGE}" \
    "${ROOT_DIR}/backend"
fi

if [[ "${TARGET}" == "frontend" || "${TARGET}" == "all" ]]; then
  if [[ -n "${FRONTEND_IMAGE_REPO:-}" ]]; then
    FRONTEND_IMAGE="${FRONTEND_IMAGE_REPO}:${IMAGE_TAG}"
  else
    FRONTEND_IMAGE="${FRONTEND_IMAGE:-jam-frontend:${IMAGE_TAG}}"
  fi

  docker build \
    -t "${FRONTEND_IMAGE}" \
    --build-arg "VITE_FIREBASE_API_KEY=${VITE_FIREBASE_API_KEY}" \
    --build-arg "VITE_FIREBASE_AUTH_DOMAIN=${VITE_FIREBASE_AUTH_DOMAIN}" \
    --build-arg "VITE_FIREBASE_PROJECT_ID=${VITE_FIREBASE_PROJECT_ID}" \
    --build-arg "VITE_FIREBASE_STORAGE_BUCKET=${VITE_FIREBASE_STORAGE_BUCKET}" \
    --build-arg "VITE_FIREBASE_MESSAGING_SENDER_ID=${VITE_FIREBASE_MESSAGING_SENDER_ID}" \
    --build-arg "VITE_FIREBASE_APP_ID=${VITE_FIREBASE_APP_ID}" \
    --build-arg "VITE_API_URL=${API_URL}" \
    "${ROOT_DIR}/front-end"
fi

if [[ "${PUSH_IMAGES}" == "1" ]]; then
  if [[ "${TARGET}" == "backend" || "${TARGET}" == "all" ]]; then
    docker push "${BACKEND_IMAGE}"
  fi
  if [[ "${TARGET}" == "frontend" || "${TARGET}" == "all" ]]; then
    docker push "${FRONTEND_IMAGE}"
  fi
fi

cat > "${IMAGE_ENV_FILE}" <<EOF
BACKEND_IMAGE=${BACKEND_IMAGE:-}
FRONTEND_IMAGE=${FRONTEND_IMAGE:-}
IMAGE_TAG=${IMAGE_TAG}
EOF

echo "Built target ${TARGET}."
if [[ -n "${BACKEND_IMAGE:-}" ]]; then
  echo "Backend image:  ${BACKEND_IMAGE}"
fi
if [[ -n "${FRONTEND_IMAGE:-}" ]]; then
  echo "Frontend image: ${FRONTEND_IMAGE}"
fi
if [[ "${PUSH_IMAGES}" == "1" ]]; then
  echo "Pushed target ${TARGET} to the configured registry."
fi
echo "Wrote image references to ${IMAGE_ENV_FILE}."
