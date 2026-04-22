from __future__ import annotations

import json
import os
import shutil
import subprocess
import urllib.request
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]
KUBE_CONTEXT = os.getenv("MINIKUBE_TEST_CONTEXT", "minikube")
MINIKUBE_PROFILE = os.getenv("MINIKUBE_PROFILE", "minikube")
APP_NAMESPACE = os.getenv("MINIKUBE_TEST_APP_NAMESPACE", "jam")
STORAGE_NAMESPACE = os.getenv("MINIKUBE_TEST_STORAGE_NAMESPACE", "jam-storage")
BACKEND_REGISTRY_IMAGE = "docker.io/ktistos/myjam-backend:dev-204a4ab-20260419191921"
FRONTEND_REGISTRY_IMAGE = "docker.io/ktistos/myjam-frontend:dev-204a4ab-20260419191921"


def run_command(args: list[str], *, timeout: int = 30) -> str:
    try:
        result = subprocess.run(
            args,
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except FileNotFoundError:
        pytest.skip(f"{args[0]} is not installed")

    if result.returncode != 0:
        output = "\n".join(part for part in [result.stdout, result.stderr] if part)
        pytest.fail(f"Command failed: {' '.join(args)}\n{output}")

    return result.stdout


def run_kubectl(args: list[str], *, timeout: int = 30) -> str:
    return run_command(["kubectl", "--context", KUBE_CONTEXT, *args], timeout=timeout)


def kubectl_json(namespace: str | None, resources: list[str]) -> dict:
    args = []
    if namespace:
        args.extend(["-n", namespace])
    args.extend(["get", *resources, "-o", "json"])
    return json.loads(run_kubectl(args))


def require_live_minikube() -> None:
    if os.getenv("RUN_MINIKUBE_TESTS") != "1":
        pytest.skip("Set RUN_MINIKUBE_TESTS=1 to run live Minikube smoke tests")
    if not shutil.which("kubectl"):
        pytest.skip("kubectl is not installed")
    if not shutil.which("minikube"):
        pytest.skip("minikube is not installed")


def item(resources: dict, kind: str, name: str) -> dict:
    if resources.get("kind") == kind and resources.get("metadata", {}).get("name") == name:
        return resources
    for candidate in resources.get("items", []):
        if candidate.get("kind") == kind and candidate.get("metadata", {}).get("name") == name:
            return candidate
    pytest.fail(f"Missing {kind}/{name}")


def condition_is_true(resource: dict, condition_type: str) -> bool:
    return any(
        condition.get("type") == condition_type and condition.get("status") == "True"
        for condition in resource.get("status", {}).get("conditions", [])
    )


def assert_workload_ready(resource: dict) -> None:
    replicas = resource.get("spec", {}).get("replicas", 1)
    status = resource.get("status", {})
    assert status.get("observedGeneration") == resource.get("metadata", {}).get("generation")
    assert status.get("readyReplicas", 0) >= replicas
    assert status.get("availableReplicas", status.get("readyReplicas", 0)) >= replicas


def minikube_ip() -> str:
    configured = os.getenv("MINIKUBE_IP")
    if configured:
        return configured
    return run_command(["minikube", "-p", MINIKUBE_PROFILE, "ip"], timeout=20).strip()


def fetch(url: str) -> tuple[int, bytes]:
    with urllib.request.urlopen(url, timeout=10) as response:
        return response.status, response.read()


def test_minikube_scripts_pin_kubectl_context_and_force_rollouts() -> None:
    minikube_deploy = (ROOT / "scripts/minikube-deploy.sh").read_text()
    portable_apply = (ROOT / "scripts/k8s-apply.sh").read_text()
    cluster_deploy = (ROOT / "scripts/deploy-cluster.sh").read_text()

    assert 'KUBE_CONTEXT="${KUBE_CONTEXT:-${MINIKUBE_PROFILE}}"' in minikube_deploy
    assert 'KUBE_CONTEXT="${KUBE_CONTEXT:-minikube}"' in portable_apply
    assert ".k8s-images.env" in minikube_deploy
    assert "render_backend_image_manifest" in minikube_deploy
    assert "render_backend_image_manifest" in portable_apply
    assert 'kubectl --context "${KUBE_CONTEXT}" "$@"' in minikube_deploy
    assert 'kubectl --context "${KUBE_CONTEXT}" "$@"' in portable_apply
    assert "rollout restart deployment/jam-backend" in minikube_deploy
    assert "rollout restart deployment/jam-frontend" in minikube_deploy
    assert 'MINIO_OPERATOR_REPLICAS="${MINIO_OPERATOR_REPLICAS:-1}"' in cluster_deploy
    assert 'scale deployment/minio-operator --replicas="${MINIO_OPERATOR_REPLICAS}"' in cluster_deploy
    assert 'get pod -l v1.min.io/tenant=jam-minio -o name | grep -q .' in cluster_deploy
    assert 'ENABLE_TLS="${ENABLE_TLS:-0}"' in cluster_deploy
    assert 'ENABLE_TLS_REDIRECT="${ENABLE_TLS_REDIRECT:-true}"' in cluster_deploy
    assert "kind: ClusterIssuer" in cluster_deploy
    assert "cert-manager.io/cluster-issuer" in cluster_deploy
    assert "nginx.ingress.kubernetes.io/ssl-redirect" in cluster_deploy
    assert "patch_ingress_tls" in cluster_deploy
    assert "rollout restart deployment/jam-backend" in cluster_deploy
    assert "rollout restart deployment/jam-frontend" in cluster_deploy


def test_kubernetes_manifests_default_to_pushed_registry_images() -> None:
    for manifest in [
        "k8s/base/backend.yaml",
        "k8s/base/backend-migrate-job.yaml",
        "k8s/minikube/backend.yaml",
        "k8s/minikube/backend-migrate-job.yaml",
    ]:
        assert BACKEND_REGISTRY_IMAGE in (ROOT / manifest).read_text()

    for manifest in [
        "k8s/base/frontend.yaml",
        "k8s/minikube/frontend.yaml",
    ]:
        assert FRONTEND_REGISTRY_IMAGE in (ROOT / manifest).read_text()

    kustomization = (ROOT / "k8s/base/kustomization.yaml").read_text()
    assert "docker.io/ktistos/myjam-backend" in kustomization
    assert "docker.io/ktistos/myjam-frontend" in kustomization


def test_minikube_manifests_include_required_init_and_migration_jobs() -> None:
    migrate_job = (ROOT / "k8s/minikube/backend-migrate-job.yaml").read_text()
    bucket_job = (ROOT / "k8s/minikube/minio-bucket-policy-job.yaml").read_text()
    app_ingress = (ROOT / "k8s/minikube/app-ingress.yaml").read_text()

    assert "kind: Job" in migrate_job
    assert "name: jam-backend-migrate" in migrate_job
    assert "alembic" in migrate_job
    assert "upgrade" in migrate_job
    assert "head" in migrate_job

    assert "kind: Job" in bucket_job
    assert "name: jam-minio-public-bucket" in bucket_job
    assert "mc mb --ignore-existing jam/avatars" in bucket_job
    assert "mc anonymous set download jam/avatars" in bucket_job

    assert "path: /docs" in app_ingress
    assert "path: /openapi.json" in app_ingress
    assert "pathType: Exact" in app_ingress


def test_portable_kubernetes_base_renders_required_resources() -> None:
    if not shutil.which("kubectl"):
        pytest.skip("kubectl is not installed")

    rendered = run_kubectl(["kustomize", "k8s/base"], timeout=30)

    for expected in [
        "name: backend-migrate",
        "name: minio-init",
        "name: jam-backend",
        "name: jam-frontend",
        "name: postgres",
        "name: redis",
        "name: minio",
        "name: jam-app",
    ]:
        assert expected in rendered


def test_live_minikube_node_is_ready() -> None:
    require_live_minikube()

    nodes = json.loads(run_kubectl(["get", "nodes", "-o", "json"], timeout=20))

    assert nodes["items"], "expected at least one Minikube node"
    assert any(condition_is_true(node, "Ready") for node in nodes["items"])


def test_live_minikube_app_workloads_and_jobs_are_ready() -> None:
    require_live_minikube()

    resources = kubectl_json(
        APP_NAMESPACE,
        [
            "deployment/jam-backend",
            "deployment/jam-frontend",
            "deployment/redis",
            "statefulset/postgres",
            "job/jam-backend-migrate",
        ],
    )

    assert_workload_ready(item(resources, "Deployment", "jam-backend"))
    assert_workload_ready(item(resources, "Deployment", "jam-frontend"))
    assert_workload_ready(item(resources, "Deployment", "redis"))
    assert_workload_ready(item(resources, "StatefulSet", "postgres"))
    assert condition_is_true(item(resources, "Job", "jam-backend-migrate"), "Complete")


def test_live_minikube_minio_tenant_and_bucket_job_are_ready() -> None:
    require_live_minikube()

    pods = kubectl_json(STORAGE_NAMESPACE, ["pod", "-l", "v1.min.io/tenant=jam-minio"])
    assert pods["items"], "expected MinIO tenant pod"
    assert all(condition_is_true(pod, "Ready") for pod in pods["items"])

    jobs = kubectl_json(STORAGE_NAMESPACE, ["job/jam-minio-public-bucket"])
    assert condition_is_true(item(jobs, "Job", "jam-minio-public-bucket"), "Complete")


def test_live_minikube_ingress_serves_frontend_and_backend_health() -> None:
    require_live_minikube()

    host = os.getenv("MINIKUBE_APP_HOST", f"jam.{minikube_ip()}.nip.io")

    status, body = fetch(f"http://{host}")
    assert status == 200
    assert b"<html" in body.lower()

    status, body = fetch(f"http://{host}/health")
    assert status == 200
    assert json.loads(body.decode("utf-8")) == {"status": "ok"}


def test_live_minikube_minio_ingress_serves_health() -> None:
    require_live_minikube()

    host = os.getenv("MINIKUBE_MINIO_HOST", f"minio.jam.{minikube_ip()}.nip.io")

    status, _body = fetch(f"http://{host}/minio/health/live")
    assert status == 200
