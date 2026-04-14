#!/usr/bin/env bash

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

load_env_file() {
  local file="$1"

  if [[ -f "${file}" ]]; then
    # shellcheck disable=SC1090
    set -a
    source "${file}"
    set +a
  fi
}

load_env_file "${ROOT_DIR}/.env"
load_env_file "${ROOT_DIR}/front-end/.env.local"

: "${VITE_FIREBASE_PROJECT_ID:=${FIREBASE_PROJECT_ID:-}}"

export MINIKUBE_PROFILE="${MINIKUBE_PROFILE:-minikube}"
export BACKEND_IMAGE="${BACKEND_IMAGE:-jam-backend:minikube}"
export FRONTEND_IMAGE="${FRONTEND_IMAGE:-jam-frontend:minikube}"
export APP_HOST="${APP_HOST:-jam.127.0.0.1.nip.io}"
export MINIO_API_HOST="${MINIO_API_HOST:-minio.jam.127.0.0.1.nip.io}"
export MINIO_CONSOLE_HOST="${MINIO_CONSOLE_HOST:-minio-console.jam.127.0.0.1.nip.io}"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-password}"
export MINIO_ROOT_USER="${MINIO_ROOT_USER:-minioadmin}"
export MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-minioadmin123}"
export SPOTIFY_MARKET="${SPOTIFY_MARKET:-US}"

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  cat <<EOF
Source this file before building or deploying to Minikube:

  source scripts/minikube-env.sh

Current Minikube values:
  MINIKUBE_PROFILE=${MINIKUBE_PROFILE}
  BACKEND_IMAGE=${BACKEND_IMAGE}
  FRONTEND_IMAGE=${FRONTEND_IMAGE}
  APP_HOST=${APP_HOST}
  MINIO_API_HOST=${MINIO_API_HOST}
  MINIO_CONSOLE_HOST=${MINIO_CONSOLE_HOST}
  POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
  MINIO_ROOT_USER=${MINIO_ROOT_USER}
  MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD}
  SPOTIFY_MARKET=${SPOTIFY_MARKET}

Firebase values loaded:
  FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID:+set}
  VITE_FIREBASE_API_KEY=${VITE_FIREBASE_API_KEY:+set}
  VITE_FIREBASE_AUTH_DOMAIN=${VITE_FIREBASE_AUTH_DOMAIN:+set}
  VITE_FIREBASE_PROJECT_ID=${VITE_FIREBASE_PROJECT_ID:+set}
  VITE_FIREBASE_STORAGE_BUCKET=${VITE_FIREBASE_STORAGE_BUCKET:+set}
  VITE_FIREBASE_MESSAGING_SENDER_ID=${VITE_FIREBASE_MESSAGING_SENDER_ID:+set}
  VITE_FIREBASE_APP_ID=${VITE_FIREBASE_APP_ID:+set}
EOF
fi
