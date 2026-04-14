# GitHub Repo and CI/CD Setup

This repo is ready to host a `GitHub Actions + GHCR + Kubernetes` pipeline even
before the GitHub repository exists. The workflow file is:

- [build-and-deploy.yml](../.github/workflows/build-and-deploy.yml)
- [bootstrap-github-actions.sh](../scripts/bootstrap-github-actions.sh)

The pipeline does two things on every push to `main`:

1. Builds the backend and frontend images.
2. Pushes both images to GHCR and deploys the app stack to your cluster.

If the repository is not configured yet, the workflow now exits cleanly and
marks build/deploy as skipped instead of failing hard on missing secrets.

## Before You Push

Create the GitHub repository first, then add it as the remote for this local
git repo:

```bash
git remote add origin git@github.com:OWNER/REPO.git
git push -u origin main
```

If you prefer HTTPS:

```bash
git remote add origin https://github.com/OWNER/REPO.git
git push -u origin main
```

## Fastest Repo Bootstrap

If you install GitHub CLI, you can seed most Actions variables and secrets from
your local env files instead of clicking through the GitHub UI:

```bash
bash scripts/bootstrap-github-actions.sh build
bash scripts/bootstrap-github-actions.sh deploy
```

The script reads:

- `.env`
- `front-end/.env.local`

What still must exist in your shell before `deploy`:

- `APP_HOST`
- `MINIO_API_HOST`
- `MINIO_CONSOLE_HOST`
- `POSTGRES_PASSWORD`
- `MINIO_ROOT_USER`
- `MINIO_ROOT_PASSWORD`
- `KUBECONFIG_B64`

If `gh` is not installed, use the manual variables/secrets sections below.

## Important Constraint

GitHub-hosted runners cannot normally reach your local Minikube cluster. That
means:

- use the existing Minikube scripts for local deployment
- use the GitHub Actions workflow for a real reachable cluster

If you want GitHub Actions to deploy to Minikube, you need a self-hosted runner
on the same machine or network as Minikube.

## Repository Variables

Set these in `Settings -> Secrets and variables -> Actions -> Variables`.

Required:

- `BACKEND_IMAGE_REPO`
  - example: `ghcr.io/OWNER/myjam-backend`
- `FRONTEND_IMAGE_REPO`
  - example: `ghcr.io/OWNER/myjam-frontend`
- `APP_HOST`
  - example: `jam.example.com`
- `MINIO_API_HOST`
  - example: `minio.jam.example.com`
- `MINIO_CONSOLE_HOST`
  - example: `minio-console.jam.example.com`

Optional:

- `K8S_NAMESPACE`
  - default: `jam`
- `K8S_STORAGE_NAMESPACE`
  - default: `jam-storage`
- `MINIO_OPERATOR_NAMESPACE`
  - default: `minio-operator`
- `INGRESS_CLASS_NAME`
  - default: `nginx`
- `INSTALL_MINIO_OPERATOR`
  - default: `1`
- `APPLY_MINIO_INGRESS`
  - default: `1`
- `MINIO_OPERATOR_REF`
  - default: `v7.1.1`
- `MINIO_STORAGE_CLASS_NAME`
  - use your cluster storage class, or leave empty to use the default
- `MINIO_STORAGE_SIZE`
  - default: `10Gi`
- `APP_BASE_URL`
  - default: `https://APP_HOST`
- `VITE_API_URL`
  - leave empty for same-host ingress routing
- `MINIO_PUBLIC_URL`
  - default: `https://MINIO_API_HOST`
- `MINIO_CONSOLE_REDIRECT_URL`
  - default: `https://MINIO_CONSOLE_HOST`
- `SPOTIFY_MARKET`
  - default: `US`

Only if GHCR images stay private:

- `IMAGE_PULL_SECRET_NAME`
  - example: `ghcr-pull`
- `IMAGE_PULL_SERVER`
  - default: `ghcr.io`
- `IMAGE_PULL_EMAIL`
  - optional placeholder email for the registry secret

## Repository Secrets

Set these in `Settings -> Secrets and variables -> Actions -> Secrets`.

Required:

- `KUBECONFIG_B64`
  - base64-encoded kubeconfig for the target cluster
- `FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `POSTGRES_PASSWORD`
- `MINIO_ROOT_USER`
- `MINIO_ROOT_PASSWORD`

Optional:

- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`

Only if GHCR images stay private:

- `IMAGE_PULL_USERNAME`
- `IMAGE_PULL_PASSWORD`

For GHCR, `IMAGE_PULL_USERNAME` is usually your GitHub username and
`IMAGE_PULL_PASSWORD` is a token with `read:packages`.

## First Deploy

After the repo exists and the variables/secrets are set:

1. Push `main`.
2. GitHub Actions will build and push both images.
3. The deploy job will apply the Kubernetes resources and rerun the init jobs:
   - Alembic migration
   - MinIO `avatars` bucket bootstrap and public policy

The cluster deploy script used by the workflow is:

- [deploy-cluster.sh](../scripts/deploy-cluster.sh)

## Local Minikube Still Uses Local Scripts

For local Minikube development, keep using:

```bash
bash scripts/minikube-build-images.sh
bash scripts/minikube-deploy.sh
```
