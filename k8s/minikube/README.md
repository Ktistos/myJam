# Minikube Kubernetes Deployment

This folder contains a Minikube-first deployment layout for `myJam`.

## Topology

- Namespace `jam`: app workloads plus Postgres and Redis.
- Namespace `jam-storage`: MinIO Tenant managed by the MinIO Operator.
- Namespace `minio-operator`: operator control plane.

## One-Time Initialization

The app needs two bootstrap actions before the API Deployment starts serving traffic:

1. Database schema migration via Alembic.
2. Object storage bootstrap for the `avatars` bucket plus anonymous download policy.

Those actions are modeled as Kubernetes Jobs:

- [backend-migrate-job.yaml](./backend-migrate-job.yaml)
- [minio-bucket-policy-job.yaml](./minio-bucket-policy-job.yaml)

## Why MinIO Uses a Tenant

The app uses direct S3-compatible object uploads and public object URLs. For Minikube we deploy:

- MinIO Operator in `minio-operator`
- one MinIO Tenant in `jam-storage`
- the cluster's existing `standard` storage class by default

That layout matches MinIO's current Operator guidance more closely than a plain Deployment, while still keeping the local footprint small. On this Minikube setup, the deploy script uses the working `standard` storage class by default instead of the custom `WaitForFirstConsumer` class.

## Local Hosts

The helper script derives the ingress hosts from your current Minikube IP, for example when `minikube ip` is `192.168.49.2`:

- App: `http://jam.192.168.49.2.nip.io`
- MinIO API / public objects: `http://minio.jam.192.168.49.2.nip.io`
- MinIO Console: `http://minio-console.jam.192.168.49.2.nip.io`

The frontend image is built with `VITE_API_URL=""`, so the browser talks to the backend through the same app ingress host.

## Deploy Flow

Use the repo scripts:

```bash
source scripts/minikube-env.sh
bash scripts/minikube-build-images.sh
bash scripts/minikube-deploy.sh
```

The deploy script applies the static manifests and then sets the backend/frontend
image references from `BACKEND_IMAGE` and `FRONTEND_IMAGE`. The defaults are:

- `jam-backend:minikube`
- `jam-frontend:minikube`

## Images and Registries

For Minikube, you do not need an external registry if you build directly into
the Minikube Docker daemon:

```bash
bash scripts/minikube-build-images.sh
```

For a real Kubernetes cluster, you should assume that you do need registry-hosted
images. The common pattern is:

```bash
export BACKEND_IMAGE_REPO=ghcr.io/your-org/myjam-backend
export FRONTEND_IMAGE_REPO=ghcr.io/your-org/myjam-frontend
export IMAGE_TAG=$(git rev-parse --short HEAD)
export VITE_API_URL=https://jam.example.com
bash scripts/publish-and-redeploy.sh all
```

If you only changed one component:

```bash
bash scripts/publish-and-redeploy.sh backend
bash scripts/publish-and-redeploy.sh frontend
```

For non-Minikube clusters, reuse the same manifests but point them at registry
images instead of local Minikube ones.

The scripts write the last published image refs to `.k8s-images.env`, and
`scripts/redeploy-images.sh` reuses that file so you can redeploy without
retyping the exact tags.

For GitHub Actions + GHCR deployment to a reachable cluster, see
[docs/github-actions.md](../../docs/github-actions.md).

## Required Environment

The simplest path is to source the repo helper first:

```bash
source scripts/minikube-env.sh
```

That helper loads Firebase values from `.env` and `front-end/.env.local`, then
exports the Minikube-local defaults:

- `MINIKUBE_IP=$(minikube ip)`
- `APP_HOST=jam.${MINIKUBE_IP}.nip.io`
- `MINIO_API_HOST=minio.jam.${MINIKUBE_IP}.nip.io`
- `MINIO_CONSOLE_HOST=minio-console.jam.${MINIKUBE_IP}.nip.io`
- `POSTGRES_PASSWORD=password`
- `MINIO_ROOT_USER=minioadmin`
- `MINIO_ROOT_PASSWORD=minioadmin123`

The build/deploy scripts still expect these Firebase variables in your shell:

- `FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

Optional:

- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `SPOTIFY_MARKET` (defaults to `US`)
- `POSTGRES_PASSWORD` (defaults to `password`)
- `MINIO_ROOT_USER` (defaults to `minioadmin`)
- `MINIO_ROOT_PASSWORD` (defaults to `minioadmin123`)

## Notes

- The backend image no longer runs `alembic upgrade head` on startup. Compose still does that explicitly so the existing local Docker workflow keeps working.
- No seed data job is required. Users are created lazily through the existing auth-driven API flow.
- The app stack resources are declarative YAML, while config/secrets are rendered
  at deploy time because they are environment-specific.
