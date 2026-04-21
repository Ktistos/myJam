#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
K8S_DIR="${K8S_DIR:-${ROOT_DIR}/k8s/base}"
NAMESPACE="${NAMESPACE:-jam}"
KUBE_CONTEXT="${KUBE_CONTEXT:-minikube}"
BACKEND_IMAGE="${BACKEND_IMAGE:-}"
FRONTEND_IMAGE="${FRONTEND_IMAGE:-}"

usage() {
  cat <<EOF
Usage: bash scripts/k8s-apply.sh

Applies the portable Kubernetes base in dependency order:
  namespace/config/secrets -> Postgres/Redis/MinIO -> init jobs -> app deployments -> ingress

Optional environment:
  K8S_DIR          default: ${ROOT_DIR}/k8s/base
  NAMESPACE        default: jam
  KUBE_CONTEXT     default: minikube
  BACKEND_IMAGE    override backend image after applying manifests
  FRONTEND_IMAGE   override frontend image after applying manifests
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

kubectl_cmd() {
  kubectl --context "${KUBE_CONTEXT}" "$@"
}

render_backend_image_manifest() {
  local src="$1"

  if [[ -z "${BACKEND_IMAGE}" ]]; then
    cat "${src}"
    return
  fi

  sed -E \
    "s#^([[:space:]]*)image: (jam-backend:minikube|jam-backend:latest|docker[.]io/ktistos/myjam-backend:[^[:space:]]+)\$#\\1image: ${BACKEND_IMAGE}#" \
    "${src}"
}

kubectl_cmd create namespace "${NAMESPACE}" --dry-run=client -o yaml | kubectl_cmd apply -f -

echo "Applying config, secrets, and data stores..."
kubectl_cmd -n "${NAMESPACE}" apply -f "${K8S_DIR}/app-config.yaml"
kubectl_cmd -n "${NAMESPACE}" apply -f "${K8S_DIR}/app-secret.yaml"
kubectl_cmd -n "${NAMESPACE}" apply -f "${K8S_DIR}/postgres.yaml"
kubectl_cmd -n "${NAMESPACE}" apply -f "${K8S_DIR}/redis.yaml"
kubectl_cmd -n "${NAMESPACE}" apply -f "${K8S_DIR}/minio.yaml"

kubectl_cmd -n "${NAMESPACE}" rollout status statefulset/postgres --timeout=5m
kubectl_cmd -n "${NAMESPACE}" rollout status deployment/redis --timeout=5m
kubectl_cmd -n "${NAMESPACE}" rollout status statefulset/minio --timeout=5m

echo "Running init jobs..."
kubectl_cmd -n "${NAMESPACE}" delete job minio-init --ignore-not-found
kubectl_cmd -n "${NAMESPACE}" apply -f "${K8S_DIR}/minio-init-job.yaml"
kubectl_cmd -n "${NAMESPACE}" wait --for=condition=complete job/minio-init --timeout=5m

kubectl_cmd -n "${NAMESPACE}" delete job backend-migrate --ignore-not-found
render_backend_image_manifest "${K8S_DIR}/backend-migrate-job.yaml" | kubectl_cmd -n "${NAMESPACE}" apply -f -
kubectl_cmd -n "${NAMESPACE}" wait --for=condition=complete job/backend-migrate --timeout=5m

echo "Deploying app services..."
kubectl_cmd -n "${NAMESPACE}" apply -f "${K8S_DIR}/backend.yaml"
kubectl_cmd -n "${NAMESPACE}" apply -f "${K8S_DIR}/frontend.yaml"
if [[ -n "${BACKEND_IMAGE}" ]]; then
  kubectl_cmd -n "${NAMESPACE}" set image deployment/jam-backend backend="${BACKEND_IMAGE}"
fi
if [[ -n "${FRONTEND_IMAGE}" ]]; then
  kubectl_cmd -n "${NAMESPACE}" set image deployment/jam-frontend frontend="${FRONTEND_IMAGE}"
fi
kubectl_cmd -n "${NAMESPACE}" apply -f "${K8S_DIR}/ingress.yaml"

kubectl_cmd -n "${NAMESPACE}" rollout restart deployment/jam-backend
kubectl_cmd -n "${NAMESPACE}" rollout restart deployment/jam-frontend
kubectl_cmd -n "${NAMESPACE}" rollout status deployment/jam-backend --timeout=5m
kubectl_cmd -n "${NAMESPACE}" rollout status deployment/jam-frontend --timeout=5m

cat <<EOF
Kubernetes deployment applied.

Context:                ${KUBE_CONTEXT}
Default app host:       http://jam.local
Default MinIO API host: http://minio.local

If you use these default hosts, point them at your ingress controller address.
EOF
