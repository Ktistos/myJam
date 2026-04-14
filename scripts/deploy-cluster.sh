#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

APP_NAMESPACE="${APP_NAMESPACE:-jam}"
STORAGE_NAMESPACE="${STORAGE_NAMESPACE:-jam-storage}"
OPERATOR_NAMESPACE="${OPERATOR_NAMESPACE:-minio-operator}"
INGRESS_CLASS_NAME="${INGRESS_CLASS_NAME:-nginx}"
INSTALL_MINIO_OPERATOR="${INSTALL_MINIO_OPERATOR:-1}"
APPLY_MINIO_INGRESS="${APPLY_MINIO_INGRESS:-1}"
MINIO_OPERATOR_REF="${MINIO_OPERATOR_REF:-v7.1.1}"
MINIO_STORAGE_CLASS_NAME="${MINIO_STORAGE_CLASS_NAME:-}"
MINIO_STORAGE_SIZE="${MINIO_STORAGE_SIZE:-10Gi}"

BACKEND_IMAGE="${BACKEND_IMAGE:-}"
FRONTEND_IMAGE="${FRONTEND_IMAGE:-}"
APP_HOST="${APP_HOST:-}"
MINIO_API_HOST="${MINIO_API_HOST:-}"
MINIO_CONSOLE_HOST="${MINIO_CONSOLE_HOST:-}"
APP_BASE_URL="${APP_BASE_URL:-}"
MINIO_PUBLIC_URL="${MINIO_PUBLIC_URL:-}"
MINIO_CONSOLE_REDIRECT_URL="${MINIO_CONSOLE_REDIRECT_URL:-}"

POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"
MINIO_ROOT_USER="${MINIO_ROOT_USER:-}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-}"
FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID:-}"
SPOTIFY_CLIENT_ID="${SPOTIFY_CLIENT_ID:-}"
SPOTIFY_CLIENT_SECRET="${SPOTIFY_CLIENT_SECRET:-}"
SPOTIFY_MARKET="${SPOTIFY_MARKET:-US}"

IMAGE_PULL_SECRET_NAME="${IMAGE_PULL_SECRET_NAME:-}"
IMAGE_PULL_SERVER="${IMAGE_PULL_SERVER:-ghcr.io}"
IMAGE_PULL_USERNAME="${IMAGE_PULL_USERNAME:-}"
IMAGE_PULL_PASSWORD="${IMAGE_PULL_PASSWORD:-}"
IMAGE_PULL_EMAIL="${IMAGE_PULL_EMAIL:-devnull@example.com}"

usage() {
  cat <<EOF
Usage: bash scripts/deploy-cluster.sh

Required environment:
  BACKEND_IMAGE
  FRONTEND_IMAGE
  APP_HOST
  MINIO_API_HOST
  MINIO_CONSOLE_HOST
  POSTGRES_PASSWORD
  MINIO_ROOT_USER
  MINIO_ROOT_PASSWORD
  FIREBASE_PROJECT_ID

Optional:
  APP_NAMESPACE              default: jam
  STORAGE_NAMESPACE          default: jam-storage
  OPERATOR_NAMESPACE         default: minio-operator
  INGRESS_CLASS_NAME         default: nginx
  INSTALL_MINIO_OPERATOR     default: 1
  APPLY_MINIO_INGRESS        default: 1
  MINIO_OPERATOR_REF         default: v7.1.1
  MINIO_STORAGE_CLASS_NAME   default: cluster default storage class
  MINIO_STORAGE_SIZE         default: 10Gi
  APP_BASE_URL               default: https://APP_HOST
  MINIO_PUBLIC_URL           default: https://MINIO_API_HOST
  MINIO_CONSOLE_REDIRECT_URL default: https://MINIO_CONSOLE_HOST
  SPOTIFY_CLIENT_ID
  SPOTIFY_CLIENT_SECRET
  SPOTIFY_MARKET             default: US
  IMAGE_PULL_SECRET_NAME     create/apply imagePullSecret when set
  IMAGE_PULL_SERVER          default: ghcr.io
  IMAGE_PULL_USERNAME
  IMAGE_PULL_PASSWORD
  IMAGE_PULL_EMAIL           default: devnull@example.com
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: ${name}" >&2
    exit 1
  fi
}

render_manifest() {
  local src="$1"
  local dst="$2"
  shift 2

  sed \
    -e "s/^\\([[:space:]]*namespace: \\)jam-storage$/\\1${STORAGE_NAMESPACE}/" \
    -e "s/^\\([[:space:]]*namespace: \\)jam$/\\1${APP_NAMESPACE}/" \
    "$@" \
    "${src}" > "${dst}"
}

patch_image_pull_secret() {
  local resource="$1"

  if [[ -z "${IMAGE_PULL_SECRET_NAME}" ]]; then
    return
  fi

  kubectl -n "${APP_NAMESPACE}" patch "${resource}" --type=merge \
    -p "{\"spec\":{\"template\":{\"spec\":{\"imagePullSecrets\":[{\"name\":\"${IMAGE_PULL_SECRET_NAME}\"}]}}}}"
}

create_namespaces() {
  kubectl create namespace "${APP_NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -
  kubectl create namespace "${STORAGE_NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -

  if [[ "${INSTALL_MINIO_OPERATOR}" == "1" ]]; then
    kubectl create namespace "${OPERATOR_NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -
  fi
}

install_minio_operator() {
  if [[ "${INSTALL_MINIO_OPERATOR}" != "1" ]]; then
    return
  fi

  echo "Installing/refreshing MinIO Operator ${MINIO_OPERATOR_REF}..."
  kubectl apply -k "github.com/minio/operator?ref=${MINIO_OPERATOR_REF}"
  kubectl -n "${OPERATOR_NAMESPACE}" rollout status deployment/minio-operator --timeout=5m
}

create_image_pull_secret() {
  if [[ -z "${IMAGE_PULL_SECRET_NAME}" ]]; then
    return
  fi

  require_env IMAGE_PULL_USERNAME
  require_env IMAGE_PULL_PASSWORD

  kubectl -n "${APP_NAMESPACE}" create secret docker-registry "${IMAGE_PULL_SECRET_NAME}" \
    --docker-server="${IMAGE_PULL_SERVER}" \
    --docker-username="${IMAGE_PULL_USERNAME}" \
    --docker-password="${IMAGE_PULL_PASSWORD}" \
    --docker-email="${IMAGE_PULL_EMAIL}" \
    --dry-run=client -o yaml | kubectl apply -f -
}

apply_postgres_secret() {
  kubectl -n "${APP_NAMESPACE}" create secret generic jam-postgres-secrets \
    --from-literal=POSTGRES_PASSWORD="${POSTGRES_PASSWORD}" \
    --dry-run=client -o yaml | kubectl apply -f -
}

apply_backend_config() {
  kubectl -n "${APP_NAMESPACE}" create configmap jam-backend-config \
    --from-literal=REDIS_URL="redis://redis:6379" \
    --from-literal=MINIO_ENDPOINT="minio.${STORAGE_NAMESPACE}.svc.cluster.local" \
    --from-literal=MINIO_PUBLIC_URL="${MINIO_PUBLIC_URL}" \
    --from-literal=MINIO_BUCKET="avatars" \
    --from-literal=MINIO_SECURE="false" \
    --from-literal=FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID}" \
    --from-literal=SPOTIFY_MARKET="${SPOTIFY_MARKET}" \
    --from-literal=SPOTIFY_REDIRECT_URI="${APP_BASE_URL}/spotify/callback" \
    --from-literal=FRONTEND_URL="${APP_BASE_URL}" \
    --dry-run=client -o yaml | kubectl apply -f -

  kubectl -n "${APP_NAMESPACE}" create secret generic jam-backend-secrets \
    --from-literal=DATABASE_URL="postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/jam" \
    --from-literal=MINIO_ACCESS_KEY="${MINIO_ROOT_USER}" \
    --from-literal=MINIO_SECRET_KEY="${MINIO_ROOT_PASSWORD}" \
    --from-literal=SPOTIFY_CLIENT_ID="${SPOTIFY_CLIENT_ID}" \
    --from-literal=SPOTIFY_CLIENT_SECRET="${SPOTIFY_CLIENT_SECRET}" \
    --dry-run=client -o yaml | kubectl apply -f -
}

apply_minio_tenant_secret() {
  kubectl -n "${STORAGE_NAMESPACE}" create secret generic jam-minio-env-configuration \
    --from-literal=accesskey="${MINIO_ROOT_USER}" \
    --from-literal=secretkey="${MINIO_ROOT_PASSWORD}" \
    --from-literal=config.env=$'export MINIO_ROOT_USER="'"${MINIO_ROOT_USER}"$'"\nexport MINIO_ROOT_PASSWORD="'"${MINIO_ROOT_PASSWORD}"$'"\nexport MINIO_BROWSER_REDIRECT_URL="'"${MINIO_CONSOLE_REDIRECT_URL}"$'"' \
    --dry-run=client -o yaml | kubectl apply -f -
}

require_env BACKEND_IMAGE
require_env FRONTEND_IMAGE
require_env APP_HOST
require_env MINIO_API_HOST
require_env MINIO_CONSOLE_HOST
require_env POSTGRES_PASSWORD
require_env MINIO_ROOT_USER
require_env MINIO_ROOT_PASSWORD
require_env FIREBASE_PROJECT_ID

: "${APP_BASE_URL:=https://${APP_HOST}}"
: "${MINIO_PUBLIC_URL:=https://${MINIO_API_HOST}}"
: "${MINIO_CONSOLE_REDIRECT_URL:=https://${MINIO_CONSOLE_HOST}}"

tenant_args=(-e "s/storage: 10Gi/storage: ${MINIO_STORAGE_SIZE}/")
if [[ -n "${MINIO_STORAGE_CLASS_NAME}" ]]; then
  tenant_args+=(-e "s/storageClassName: minio-wffc/storageClassName: ${MINIO_STORAGE_CLASS_NAME}/")
else
  tenant_args+=(-e "/storageClassName: minio-wffc/d")
fi

render_manifest "${ROOT_DIR}/k8s/minikube/postgres.yaml" "${TMP_DIR}/postgres.yaml"
render_manifest "${ROOT_DIR}/k8s/minikube/redis.yaml" "${TMP_DIR}/redis.yaml"
render_manifest "${ROOT_DIR}/k8s/minikube/backend.yaml" "${TMP_DIR}/backend.yaml"
render_manifest "${ROOT_DIR}/k8s/minikube/frontend.yaml" "${TMP_DIR}/frontend.yaml"
render_manifest "${ROOT_DIR}/k8s/minikube/backend-migrate-job.yaml" "${TMP_DIR}/backend-migrate-job.yaml"
render_manifest "${ROOT_DIR}/k8s/minikube/minio-bucket-policy-job.yaml" "${TMP_DIR}/minio-bucket-policy-job.yaml"
render_manifest \
  "${ROOT_DIR}/k8s/minikube/minio-tenant.yaml" \
  "${TMP_DIR}/minio-tenant.yaml" \
  "${tenant_args[@]}"
render_manifest \
  "${ROOT_DIR}/k8s/minikube/minio-ingress.yaml" \
  "${TMP_DIR}/minio-ingress.yaml" \
  -e "s/ingressClassName: nginx/ingressClassName: ${INGRESS_CLASS_NAME}/g" \
  -e "s/host: minio.jam.127.0.0.1.nip.io/host: ${MINIO_API_HOST}/g" \
  -e "s/host: minio-console.jam.127.0.0.1.nip.io/host: ${MINIO_CONSOLE_HOST}/g"
render_manifest \
  "${ROOT_DIR}/k8s/minikube/app-ingress.yaml" \
  "${TMP_DIR}/app-ingress.yaml" \
  -e "s/ingressClassName: nginx/ingressClassName: ${INGRESS_CLASS_NAME}/g" \
  -e "s/host: jam.127.0.0.1.nip.io/host: ${APP_HOST}/g"

echo "Applying namespaces and app configuration..."
create_namespaces
install_minio_operator
create_image_pull_secret
apply_postgres_secret
apply_backend_config
apply_minio_tenant_secret

echo "Deploying Postgres and Redis..."
kubectl apply -f "${TMP_DIR}/postgres.yaml"
kubectl apply -f "${TMP_DIR}/redis.yaml"
kubectl -n "${APP_NAMESPACE}" rollout status statefulset/postgres --timeout=5m
kubectl -n "${APP_NAMESPACE}" rollout status deployment/redis --timeout=5m

echo "Deploying MinIO tenant..."
kubectl apply -f "${TMP_DIR}/minio-tenant.yaml"
kubectl -n "${STORAGE_NAMESPACE}" wait --for=condition=Ready pod -l v1.min.io/tenant=jam-minio --timeout=10m

if [[ "${APPLY_MINIO_INGRESS}" == "1" ]]; then
  kubectl apply -f "${TMP_DIR}/minio-ingress.yaml"
fi

echo "Running MinIO bucket bootstrap job..."
kubectl -n "${STORAGE_NAMESPACE}" delete job jam-minio-public-bucket --ignore-not-found
kubectl apply -f "${TMP_DIR}/minio-bucket-policy-job.yaml"
kubectl -n "${STORAGE_NAMESPACE}" wait --for=condition=complete job/jam-minio-public-bucket --timeout=5m

echo "Running database migration job..."
kubectl -n "${APP_NAMESPACE}" delete job jam-backend-migrate --ignore-not-found
kubectl set image -f "${TMP_DIR}/backend-migrate-job.yaml" migrate="${BACKEND_IMAGE}" --local -o yaml | kubectl apply -f -
patch_image_pull_secret job/jam-backend-migrate
kubectl -n "${APP_NAMESPACE}" wait --for=condition=complete job/jam-backend-migrate --timeout=5m

echo "Deploying backend and frontend..."
kubectl apply -f "${TMP_DIR}/backend.yaml"
kubectl apply -f "${TMP_DIR}/frontend.yaml"
patch_image_pull_secret deployment/jam-backend
patch_image_pull_secret deployment/jam-frontend
kubectl -n "${APP_NAMESPACE}" set image deployment/jam-backend backend="${BACKEND_IMAGE}"
kubectl -n "${APP_NAMESPACE}" set image deployment/jam-frontend frontend="${FRONTEND_IMAGE}"
kubectl apply -f "${TMP_DIR}/app-ingress.yaml"
kubectl -n "${APP_NAMESPACE}" rollout status deployment/jam-backend --timeout=5m
kubectl -n "${APP_NAMESPACE}" rollout status deployment/jam-frontend --timeout=5m

cat <<EOF
Deployment applied.

App:            ${APP_BASE_URL}
MinIO API:      ${MINIO_PUBLIC_URL}
MinIO Console:  ${MINIO_CONSOLE_REDIRECT_URL}

If Spotify login is enabled, add this redirect URI to the Spotify app:
  ${APP_BASE_URL}/spotify/callback
EOF
