# Kubernetes Deployment

This repository has two Kubernetes paths:

- `k8s/base`: portable Kubernetes manifests using standard Postgres, Redis, MinIO, jobs, services, deployments, and ingress.
- `k8s/minikube`: existing Minikube-focused manifests and scripts, including the MinIO Operator path.

## Images

Current pushed multi-arch images:

- `docker.io/ktistos/myjam-backend:dev-204a4ab-20260419191921`
- `docker.io/ktistos/myjam-frontend:dev-204a4ab-20260419191921`

The checked-in `k8s/base` and `k8s/minikube` manifests default to those registry
images. The deploy scripts still let you override them with `BACKEND_IMAGE` and
`FRONTEND_IMAGE`.

The frontend should be built with a relative API URL when it is served behind
the same ingress as the backend:

```bash
docker build -t jam-backend:latest backend

docker build -t jam-frontend:latest \
  --build-arg VITE_FIREBASE_API_KEY="$VITE_FIREBASE_API_KEY" \
  --build-arg VITE_FIREBASE_AUTH_DOMAIN="$VITE_FIREBASE_AUTH_DOMAIN" \
  --build-arg VITE_FIREBASE_PROJECT_ID="$VITE_FIREBASE_PROJECT_ID" \
  --build-arg VITE_FIREBASE_STORAGE_BUCKET="$VITE_FIREBASE_STORAGE_BUCKET" \
  --build-arg VITE_FIREBASE_MESSAGING_SENDER_ID="$VITE_FIREBASE_MESSAGING_SENDER_ID" \
  --build-arg VITE_FIREBASE_APP_ID="$VITE_FIREBASE_APP_ID" \
  --build-arg VITE_API_URL= \
  front-end
```

To publish a new tag to the same Docker Hub repositories:

```bash
BACKEND_IMAGE_REPO=docker.io/ktistos/myjam-backend \
FRONTEND_IMAGE_REPO=docker.io/ktistos/myjam-frontend \
IMAGE_PLATFORMS=linux/amd64,linux/arm64 \
PUSH_IMAGES=1 \
bash scripts/build-images.sh all
```

The build writes the exact refs to `.k8s-images.env`.

## ARM64 / Oracle Ampere Nodes

Oracle Kubernetes clusters often use ARM64 Ampere nodes. The app images support ARM through Docker Buildx:

```bash
BACKEND_IMAGE_REPO=docker.io/ktistos/myjam-backend \
FRONTEND_IMAGE_REPO=docker.io/ktistos/myjam-frontend \
IMAGE_PLATFORMS=linux/amd64,linux/arm64 \
PUSH_IMAGES=1 \
bash scripts/build-images.sh all
```

For an ARM-only registry publish, use:

```bash
IMAGE_PLATFORMS=linux/arm64 PUSH_IMAGES=1 bash scripts/build-images.sh all
```

`scripts/publish-and-redeploy.sh` forwards the same `IMAGE_PLATFORMS` value. In GitHub Actions, the build job sets up QEMU and Docker Buildx and defaults to:

```text
linux/amd64,linux/arm64
```

You can override that with the repository variable `IMAGE_PLATFORMS`.

For local Minikube builds, the image is built for the Minikube node architecture by default. To force a platform:

```bash
MINIKUBE_IMAGE_PLATFORM=linux/arm64 bash scripts/minikube-build-images.sh
```

## Configure

Before applying, edit or overlay:

- `k8s/base/app-config.yaml`: public URLs, Firebase project id, Spotify redirect URL.
- `k8s/base/app-secret.yaml`: database password, `DATABASE_URL`, MinIO credentials, Spotify credentials.

Do not use the committed placeholder secret values outside local development.

## Apply

For a normal cluster:

```bash
BACKEND_IMAGE=registry.example.com/jam-backend:tag \
FRONTEND_IMAGE=registry.example.com/jam-frontend:tag \
bash scripts/k8s-apply.sh
```

If `.k8s-images.env` exists and you use `scripts/minikube-env.sh` or
`scripts/redeploy-images.sh`, the scripts reuse the last published image refs.

`scripts/k8s-apply.sh` defaults to `KUBE_CONTEXT=minikube` to avoid accidentally applying local manifests to another cluster. Override `KUBE_CONTEXT` only when you intentionally target a different cluster. The older `scripts/minikube-deploy.sh` also now passes `--context minikube` explicitly.

The script applies resources in dependency order:

1. Namespace, config, secrets.
2. Postgres, Redis, MinIO StatefulSets/Deployments and Services.
3. `minio-init` Job to create the `avatars` bucket and public download policy.
4. `backend-migrate` Job to run `alembic upgrade head`.
5. Backend and frontend Deployments/Services.
6. Ingress.

## Hosts

The base ingress defaults are:

- App: `http://jam.local`
- MinIO API: `http://minio.local`
- MinIO Console: `http://minio-console.local`

Point those hostnames at your ingress controller address, or create an overlay that changes the ingress hosts and matching config values.

If Spotify login is enabled, set the Spotify redirect URI to:

```text
http://jam.local/spotify/callback
```

or the equivalent URL for your actual app host.

## Minikube Tests

Static Minikube manifest/script checks run without a live cluster:

```bash
python3 -m pytest tests/test_minikube_deployment.py -q
```

Live Minikube smoke tests are gated so normal test runs do not fail when Minikube is stopped:

```bash
RUN_MINIKUBE_TESTS=1 python3 -m pytest tests/test_minikube_deployment.py -q
```

The live tests verify the `minikube` context, app workloads, migration and MinIO init jobs, the app ingress, backend `/health`, and MinIO ingress health.
