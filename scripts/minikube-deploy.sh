#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MINIKUBE_PROFILE="${MINIKUBE_PROFILE:-minikube}"
MINIKUBE_IP="${MINIKUBE_IP:-$(minikube -p "${MINIKUBE_PROFILE}" ip 2>/dev/null || echo 127.0.0.1)}"
APP_NAMESPACE="jam"
STORAGE_NAMESPACE="jam-storage"
OPERATOR_NAMESPACE="minio-operator"
BACKEND_IMAGE="${BACKEND_IMAGE:-jam-backend:minikube}"
FRONTEND_IMAGE="${FRONTEND_IMAGE:-jam-frontend:minikube}"
APP_HOST="${APP_HOST:-jam.${MINIKUBE_IP}.nip.io}"
MINIO_API_HOST="${MINIO_API_HOST:-minio.jam.${MINIKUBE_IP}.nip.io}"
MINIO_CONSOLE_HOST="${MINIO_CONSOLE_HOST:-minio-console.jam.${MINIKUBE_IP}.nip.io}"
MINIO_OPERATOR_REF="${MINIO_OPERATOR_REF:-v7.1.1}"
MINIO_OPERATOR_REPLICAS="${MINIO_OPERATOR_REPLICAS:-1}"
MINIO_STORAGE_CLASS_NAME="${MINIO_STORAGE_CLASS_NAME:-standard}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-password}"
MINIO_ROOT_USER="${MINIO_ROOT_USER:-minioadmin}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-minioadmin123}"
SPOTIFY_CLIENT_ID="${SPOTIFY_CLIENT_ID:-}"
SPOTIFY_CLIENT_SECRET="${SPOTIFY_CLIENT_SECRET:-}"
SPOTIFY_MARKET="${SPOTIFY_MARKET:-US}"

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: $name" >&2
    exit 1
  fi
}

require_env FIREBASE_PROJECT_ID

render_ingress_manifest() {
  local src="$1"

  sed \
    -e "s/host: jam.127.0.0.1.nip.io/host: ${APP_HOST}/g" \
    -e "s/host: minio.jam.127.0.0.1.nip.io/host: ${MINIO_API_HOST}/g" \
    -e "s/host: minio-console.jam.127.0.0.1.nip.io/host: ${MINIO_CONSOLE_HOST}/g" \
    "${src}"
}

apply_backend_config() {
  kubectl -n "${APP_NAMESPACE}" create configmap jam-backend-config \
    --from-literal=REDIS_URL="redis://redis:6379" \
    --from-literal=MINIO_ENDPOINT="minio.${STORAGE_NAMESPACE}.svc.cluster.local" \
    --from-literal=MINIO_PUBLIC_URL="http://${MINIO_API_HOST}" \
    --from-literal=MINIO_BUCKET="avatars" \
    --from-literal=MINIO_SECURE="false" \
    --from-literal=FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID}" \
    --from-literal=SPOTIFY_MARKET="${SPOTIFY_MARKET}" \
    --from-literal=SPOTIFY_REDIRECT_URI="http://${APP_HOST}/spotify/callback" \
    --from-literal=FRONTEND_URL="http://${APP_HOST}" \
    --dry-run=client -o yaml | kubectl apply -f -

  kubectl -n "${APP_NAMESPACE}" create secret generic jam-backend-secrets \
    --from-literal=DATABASE_URL="postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/jam" \
    --from-literal=MINIO_ACCESS_KEY="${MINIO_ROOT_USER}" \
    --from-literal=MINIO_SECRET_KEY="${MINIO_ROOT_PASSWORD}" \
    --from-literal=SPOTIFY_CLIENT_ID="${SPOTIFY_CLIENT_ID}" \
    --from-literal=SPOTIFY_CLIENT_SECRET="${SPOTIFY_CLIENT_SECRET}" \
    --dry-run=client -o yaml | kubectl apply -f -
}

apply_postgres_secret() {
  kubectl -n "${APP_NAMESPACE}" create secret generic jam-postgres-secrets \
    --from-literal=POSTGRES_PASSWORD="${POSTGRES_PASSWORD}" \
    --dry-run=client -o yaml | kubectl apply -f -
}

apply_minio_tenant_secret() {
  kubectl -n "${STORAGE_NAMESPACE}" create secret generic jam-minio-env-configuration \
    --from-literal=accesskey="${MINIO_ROOT_USER}" \
    --from-literal=secretkey="${MINIO_ROOT_PASSWORD}" \
    --from-literal=config.env=$'export MINIO_ROOT_USER="'"${MINIO_ROOT_USER}"$'"\nexport MINIO_ROOT_PASSWORD="'"${MINIO_ROOT_PASSWORD}"$'"\nexport MINIO_BROWSER_REDIRECT_URL="http://'"${MINIO_CONSOLE_HOST}"$'"' \
    --dry-run=client -o yaml | kubectl apply -f -
}

echo "Enabling Minikube ingress addon..."
minikube -p "${MINIKUBE_PROFILE}" addons enable ingress

echo "Applying namespaces and storage class..."
kubectl apply -f "${ROOT_DIR}/k8s/minikube/namespaces.yaml"

echo "Installing/refreshing MinIO Operator ${MINIO_OPERATOR_REF}..."
kubectl apply -k "github.com/minio/operator?ref=${MINIO_OPERATOR_REF}"
kubectl -n "${OPERATOR_NAMESPACE}" scale deployment/minio-operator --replicas="${MINIO_OPERATOR_REPLICAS}"
kubectl -n "${OPERATOR_NAMESPACE}" rollout status deployment/minio-operator --timeout=5m

echo "Creating app configuration..."
apply_postgres_secret
apply_backend_config
apply_minio_tenant_secret

echo "Deploying Postgres and Redis..."
kubectl apply -f "${ROOT_DIR}/k8s/minikube/postgres.yaml"
kubectl apply -f "${ROOT_DIR}/k8s/minikube/redis.yaml"
kubectl -n "${APP_NAMESPACE}" rollout status statefulset/postgres --timeout=5m
kubectl -n "${APP_NAMESPACE}" rollout status deployment/redis --timeout=5m

echo "Deploying MinIO tenant..."
sed "s/storageClassName: minio-wffc/storageClassName: ${MINIO_STORAGE_CLASS_NAME}/" \
  "${ROOT_DIR}/k8s/minikube/minio-tenant.yaml" | kubectl apply -f -
until kubectl -n "${STORAGE_NAMESPACE}" get pod -l v1.min.io/tenant=jam-minio -o name | grep -q .; do
  sleep 2
done
kubectl -n "${STORAGE_NAMESPACE}" wait --for=condition=Ready pod -l v1.min.io/tenant=jam-minio --timeout=10m
render_ingress_manifest "${ROOT_DIR}/k8s/minikube/minio-ingress.yaml" | kubectl apply -f -

echo "Running MinIO bucket bootstrap job..."
kubectl -n "${STORAGE_NAMESPACE}" delete job jam-minio-public-bucket --ignore-not-found
kubectl apply -f "${ROOT_DIR}/k8s/minikube/minio-bucket-policy-job.yaml"
kubectl -n "${STORAGE_NAMESPACE}" wait --for=condition=complete job/jam-minio-public-bucket --timeout=5m

echo "Running database migration job..."
kubectl -n "${APP_NAMESPACE}" delete job jam-backend-migrate --ignore-not-found
sed "s|image: jam-backend:minikube|image: ${BACKEND_IMAGE}|" \
  "${ROOT_DIR}/k8s/minikube/backend-migrate-job.yaml" | kubectl apply -f -
kubectl -n "${APP_NAMESPACE}" wait --for=condition=complete job/jam-backend-migrate --timeout=5m

echo "Deploying backend and frontend..."
kubectl apply -f "${ROOT_DIR}/k8s/minikube/backend.yaml"
kubectl apply -f "${ROOT_DIR}/k8s/minikube/frontend.yaml"
kubectl -n "${APP_NAMESPACE}" set image deployment/jam-backend backend="${BACKEND_IMAGE}"
kubectl -n "${APP_NAMESPACE}" set image deployment/jam-frontend frontend="${FRONTEND_IMAGE}"
render_ingress_manifest "${ROOT_DIR}/k8s/minikube/app-ingress.yaml" | kubectl apply -f -
kubectl -n "${APP_NAMESPACE}" rollout status deployment/jam-backend --timeout=5m
kubectl -n "${APP_NAMESPACE}" rollout status deployment/jam-frontend --timeout=5m

cat <<EOF
Deployment applied.

App:            http://${APP_HOST}
MinIO API:      http://${MINIO_API_HOST}
MinIO Console:  http://${MINIO_CONSOLE_HOST}

If Spotify login is enabled, add this redirect URI to the Spotify app:
  http://${APP_HOST}/spotify/callback
EOF
