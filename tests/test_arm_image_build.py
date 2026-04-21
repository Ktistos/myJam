from __future__ import annotations

import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def test_build_images_supports_multi_platform_buildx_pushes() -> None:
    script = read("scripts/build-images.sh")

    assert "IMAGE_PLATFORMS" in script
    assert "DOCKER_PLATFORMS" in script
    assert "linux/amd64,linux/arm64" in script
    assert "docker buildx build" in script
    assert '--platform "${IMAGE_PLATFORMS}"' in script
    assert "--driver docker-container" in script
    assert "jam-multiarch-builder" in script
    assert '--push"' in script
    assert "Multi-platform builds cannot be loaded" in script


def test_publish_and_redeploy_documents_platform_forwarding() -> None:
    script = read("scripts/publish-and-redeploy.sh")

    assert "IMAGE_PLATFORMS" in script
    assert "linux/amd64,linux/arm64" in script
    assert "linux/arm64" in script
    assert 'PUSH_IMAGES=1 bash "${ROOT_DIR}/scripts/build-images.sh" "${TARGET}"' in script


def test_minikube_build_can_force_arm64_platform() -> None:
    script = read("scripts/minikube-build-images.sh")

    assert "MINIKUBE_IMAGE_PLATFORM" in script
    assert '--platform "${MINIKUBE_IMAGE_PLATFORM}"' in script
    assert "Minikube node architecture" in script


def test_github_actions_builds_multi_arch_images() -> None:
    workflow = read(".github/workflows/build-and-deploy.yml")

    assert "IMAGE_PLATFORMS" in workflow
    assert "linux/amd64,linux/arm64" in workflow
    assert "docker/setup-qemu-action@v3" in workflow
    assert "platforms: arm64,amd64" in workflow
    assert "docker/setup-buildx-action@v3" in workflow


def test_image_scripts_have_valid_shell_syntax() -> None:
    for script in [
        "scripts/build-images.sh",
        "scripts/deploy-cluster.sh",
        "scripts/k8s-apply.sh",
        "scripts/minikube-build-images.sh",
        "scripts/minikube-deploy.sh",
        "scripts/publish-and-redeploy.sh",
        "scripts/redeploy-images.sh",
    ]:
        result = subprocess.run(
            ["bash", "-n", script],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        assert result.returncode == 0, result.stderr
