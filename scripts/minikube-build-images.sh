#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MINIKUBE_PROFILE="${MINIKUBE_PROFILE:-minikube}"
BACKEND_IMAGE="${BACKEND_IMAGE:-jam-backend:minikube}"
FRONTEND_IMAGE="${FRONTEND_IMAGE:-jam-frontend:minikube}"
MINIKUBE_IMAGE_PLATFORM="${MINIKUBE_IMAGE_PLATFORM:-}"

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: $name" >&2
    exit 1
  fi
}

: "${VITE_FIREBASE_PROJECT_ID:=${FIREBASE_PROJECT_ID:-}}"

require_env FIREBASE_PROJECT_ID
require_env VITE_FIREBASE_API_KEY
require_env VITE_FIREBASE_AUTH_DOMAIN
require_env VITE_FIREBASE_PROJECT_ID
require_env VITE_FIREBASE_STORAGE_BUCKET
require_env VITE_FIREBASE_MESSAGING_SENDER_ID
require_env VITE_FIREBASE_APP_ID

eval "$(minikube -p "${MINIKUBE_PROFILE}" docker-env)"

platform_args=()
if [[ -n "${MINIKUBE_IMAGE_PLATFORM}" ]]; then
  platform_args=(--platform "${MINIKUBE_IMAGE_PLATFORM}")
fi

docker build \
  "${platform_args[@]}" \
  -t "${BACKEND_IMAGE}" \
  "${ROOT_DIR}/backend"

docker build \
  "${platform_args[@]}" \
  -t "${FRONTEND_IMAGE}" \
  --build-arg "VITE_FIREBASE_API_KEY=${VITE_FIREBASE_API_KEY}" \
  --build-arg "VITE_FIREBASE_AUTH_DOMAIN=${VITE_FIREBASE_AUTH_DOMAIN}" \
  --build-arg "VITE_FIREBASE_PROJECT_ID=${VITE_FIREBASE_PROJECT_ID}" \
  --build-arg "VITE_FIREBASE_STORAGE_BUCKET=${VITE_FIREBASE_STORAGE_BUCKET}" \
  --build-arg "VITE_FIREBASE_MESSAGING_SENDER_ID=${VITE_FIREBASE_MESSAGING_SENDER_ID}" \
  --build-arg "VITE_FIREBASE_APP_ID=${VITE_FIREBASE_APP_ID}" \
  --build-arg "VITE_API_URL=" \
  "${ROOT_DIR}/front-end"

if [[ -n "${MINIKUBE_IMAGE_PLATFORM}" ]]; then
  echo "Built ${BACKEND_IMAGE} and ${FRONTEND_IMAGE} for ${MINIKUBE_IMAGE_PLATFORM} inside Minikube profile ${MINIKUBE_PROFILE}."
else
  echo "Built ${BACKEND_IMAGE} and ${FRONTEND_IMAGE} for the Minikube node architecture inside profile ${MINIKUBE_PROFILE}."
fi
