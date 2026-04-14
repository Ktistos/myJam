#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAMESPACE="${APP_NAMESPACE:-jam}"
IMAGE_ENV_FILE="${IMAGE_ENV_FILE:-${ROOT_DIR}/.k8s-images.env}"
RUN_BACKEND_MIGRATION="${RUN_BACKEND_MIGRATION:-1}"

usage() {
  cat <<EOF
Usage: bash scripts/redeploy-images.sh [backend|frontend|all]

Uses BACKEND_IMAGE / FRONTEND_IMAGE from the environment or from:
  ${IMAGE_ENV_FILE}
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

if [[ -f "${IMAGE_ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${IMAGE_ENV_FILE}"
fi

if [[ "${TARGET}" == "backend" || "${TARGET}" == "all" ]]; then
  : "${BACKEND_IMAGE:?Set BACKEND_IMAGE or create ${IMAGE_ENV_FILE} first.}"
fi
if [[ "${TARGET}" == "frontend" || "${TARGET}" == "all" ]]; then
  : "${FRONTEND_IMAGE:?Set FRONTEND_IMAGE or create ${IMAGE_ENV_FILE} first.}"
fi

if [[ "${TARGET}" == "backend" || "${TARGET}" == "all" ]]; then
  if [[ "${RUN_BACKEND_MIGRATION}" == "1" ]]; then
    kubectl -n "${APP_NAMESPACE}" delete job jam-backend-migrate --ignore-not-found
    kubectl set image -f "${ROOT_DIR}/k8s/minikube/backend-migrate-job.yaml" migrate="${BACKEND_IMAGE}" --local -o yaml | kubectl apply -f -
    kubectl -n "${APP_NAMESPACE}" wait --for=condition=complete job/jam-backend-migrate --timeout=5m
  fi

  kubectl -n "${APP_NAMESPACE}" set image deployment/jam-backend backend="${BACKEND_IMAGE}"
  kubectl -n "${APP_NAMESPACE}" rollout status deployment/jam-backend --timeout=5m
fi

if [[ "${TARGET}" == "frontend" || "${TARGET}" == "all" ]]; then
  kubectl -n "${APP_NAMESPACE}" set image deployment/jam-frontend frontend="${FRONTEND_IMAGE}"
  kubectl -n "${APP_NAMESPACE}" rollout status deployment/jam-frontend --timeout=5m
fi

echo "Redeployed target: ${TARGET}"
