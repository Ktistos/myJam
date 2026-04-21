#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PUSH_IMAGES="${PUSH_IMAGES:-0}"
IMAGE_TAG="${IMAGE_TAG:-$(git -C "${ROOT_DIR}" rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)}"
IMAGE_ENV_FILE="${IMAGE_ENV_FILE:-${ROOT_DIR}/.k8s-images.env}"
IMAGE_PLATFORMS="${IMAGE_PLATFORMS:-${DOCKER_PLATFORMS:-}}"

if [[ -z "${IMAGE_PLATFORMS}" && "${PUSH_IMAGES}" == "1" ]]; then
  IMAGE_PLATFORMS="linux/amd64,linux/arm64"
fi

usage() {
  cat <<EOF
Usage: bash scripts/build-images.sh [backend|frontend|all]

Optional:
  IMAGE_PLATFORMS  Comma-separated platforms for docker buildx.
                   Defaults to linux/amd64,linux/arm64 when PUSH_IMAGES=1.
                   Use linux/arm64 for ARM-only clusters.
  PUSH_IMAGES      1 pushes images. Multi-platform builds require PUSH_IMAGES=1.
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

ensure_buildx_builder() {
  local builder_name="${BUILDX_BUILDER:-jam-multiarch-builder}"

  if docker buildx inspect "${builder_name}" >/dev/null 2>&1; then
    docker buildx use "${builder_name}" >/dev/null
    return
  fi

  docker buildx create \
    --name "${builder_name}" \
    --driver docker-container \
    --use >/dev/null
}

build_image() {
  local image="$1"
  local context="$2"
  shift 2

  if [[ -z "${IMAGE_PLATFORMS}" ]]; then
    docker build -t "${image}" "$@" "${context}"
    return
  fi

  if [[ "${PUSH_IMAGES}" != "1" && "${IMAGE_PLATFORMS}" == *,* ]]; then
    echo "Multi-platform builds cannot be loaded into the local Docker image store." >&2
    echo "Set PUSH_IMAGES=1, or use a single IMAGE_PLATFORMS value such as linux/arm64." >&2
    exit 1
  fi

  ensure_buildx_builder

  local output_flag="--load"
  if [[ "${PUSH_IMAGES}" == "1" ]]; then
    output_flag="--push"
  fi

  docker buildx build \
    --platform "${IMAGE_PLATFORMS}" \
    -t "${image}" \
    "${output_flag}" \
    "$@" \
    "${context}"
}

if [[ "${TARGET}" == "backend" || "${TARGET}" == "all" ]]; then
  if [[ -n "${BACKEND_IMAGE_REPO:-}" ]]; then
    BACKEND_IMAGE="${BACKEND_IMAGE_REPO}:${IMAGE_TAG}"
  else
    BACKEND_IMAGE="${BACKEND_IMAGE:-jam-backend:${IMAGE_TAG}}"
  fi

  build_image "${BACKEND_IMAGE}" "${ROOT_DIR}/backend"
fi

if [[ "${TARGET}" == "frontend" || "${TARGET}" == "all" ]]; then
  if [[ -n "${FRONTEND_IMAGE_REPO:-}" ]]; then
    FRONTEND_IMAGE="${FRONTEND_IMAGE_REPO}:${IMAGE_TAG}"
  else
    FRONTEND_IMAGE="${FRONTEND_IMAGE:-jam-frontend:${IMAGE_TAG}}"
  fi

  build_image "${FRONTEND_IMAGE}" "${ROOT_DIR}/front-end" \
    --build-arg "VITE_FIREBASE_API_KEY=${VITE_FIREBASE_API_KEY}" \
    --build-arg "VITE_FIREBASE_AUTH_DOMAIN=${VITE_FIREBASE_AUTH_DOMAIN}" \
    --build-arg "VITE_FIREBASE_PROJECT_ID=${VITE_FIREBASE_PROJECT_ID}" \
    --build-arg "VITE_FIREBASE_STORAGE_BUCKET=${VITE_FIREBASE_STORAGE_BUCKET}" \
    --build-arg "VITE_FIREBASE_MESSAGING_SENDER_ID=${VITE_FIREBASE_MESSAGING_SENDER_ID}" \
    --build-arg "VITE_FIREBASE_APP_ID=${VITE_FIREBASE_APP_ID}" \
    --build-arg "VITE_API_URL=${API_URL}"
fi

if [[ "${PUSH_IMAGES}" == "1" && -z "${IMAGE_PLATFORMS}" ]]; then
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
IMAGE_PLATFORMS=${IMAGE_PLATFORMS}
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
if [[ -n "${IMAGE_PLATFORMS}" ]]; then
  echo "Image platforms: ${IMAGE_PLATFORMS}"
fi
echo "Wrote image references to ${IMAGE_ENV_FILE}."
