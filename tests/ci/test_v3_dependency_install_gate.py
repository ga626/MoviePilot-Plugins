"""V3 插件依赖真实安装门禁测试。"""

from __future__ import annotations

import importlib.util
import sys
import os
import shutil
import subprocess
from pathlib import Path

import pytest
import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
INSTALL_SCRIPT = REPO_ROOT / "scripts/check_v3_dependency_install.py"
PR_WORKFLOW = REPO_ROOT / ".github/workflows/plugin-gate.yml"


def _load_install_module():
    """按文件路径导入安装门禁脚本。"""
    spec = importlib.util.spec_from_file_location(
        "check_v3_dependency_install",
        INSTALL_SCRIPT,
    )
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_manifest_discovery_covers_every_v3_pyproject() -> None:
    """门禁必须自动覆盖全部 V3 modern manifest。"""
    module = _load_install_module()
    expected = sorted((REPO_ROOT / "plugins.v3").glob("*/pyproject.toml"))

    assert expected
    assert module.discover_manifests() == expected


def test_manifest_platforms_default_to_product_matrix() -> None:
    """未声明窄平台的普通插件必须覆盖 V3 标准五平台。"""
    module = _load_install_module()
    manifest = REPO_ROOT / "plugins.v3/agentresourceofficer/pyproject.toml"

    assert module.manifest_platforms(manifest) == module.SUPPORTED_PLATFORMS


def test_animeupscale_dependency_gate_matches_linux_cuda_contract() -> None:
    """AnimeUpscale 的大体积 CUDA 依赖只在真实支持的 Linux x64 安装。"""
    module = _load_install_module()
    manifest = REPO_ROOT / "plugins.v3/animeupscale/pyproject.toml"

    assert module.manifest_platforms(manifest) == frozenset({"linux-x64"})


def test_autosubv2_dependency_gate_excludes_unsupported_macos_intel() -> None:
    """AutoSubv2 只在 Python 3.14 依赖可安装的平台进入真实安装门禁。"""
    module = _load_install_module()
    manifest = REPO_ROOT / "plugins.v3/autosubv2/pyproject.toml"

    assert module.manifest_platforms(manifest) == frozenset(
        {"linux-x64", "linux-arm64", "windows-x64", "macos-arm64"}
    )


def test_installation_uses_fresh_environment_and_host_manifest_semantics(
    tmp_path: Path,
) -> None:
    """安装命令必须面向隔离解释器并通过 -r 消费原始 pyproject。"""
    module = _load_install_module()
    environment = tmp_path / ".venv"
    manifest = REPO_ROOT / "plugins.v3/agentresourceofficer/pyproject.toml"

    create, install, healthcheck = module.installation_commands(
        uv_bin="uv",
        python_spec="3.14",
        environment=environment,
        manifest=manifest,
        windows=False,
    )

    python_bin = environment / "bin/python"
    assert create == ["uv", "venv", "--python", "3.14", str(environment)]
    assert install == [
        "uv",
        "pip",
        "install",
        "--python",
        str(python_bin),
        "-r",
        str(manifest),
    ]
    assert healthcheck == ["uv", "pip", "check", "--python", str(python_bin)]


def test_windows_environment_uses_scripts_python(tmp_path: Path) -> None:
    """Windows runner 必须把依赖安装到目标 venv，而不是 runner 全局环境。"""
    module = _load_install_module()

    assert module.venv_python(tmp_path / ".venv", windows=True) == (
        tmp_path / ".venv/Scripts/python.exe"
    )


def test_workflow_runs_scoped_five_platform_install_matrix() -> None:
    """PR 门禁应在相关变更时按平台执行真实安装脚本。"""
    jobs = yaml.safe_load(PR_WORKFLOW.read_text(encoding="utf-8"))["jobs"]
    install_job = jobs["plugin-dependency-install-gate"]

    expected_targets = {
        "ubuntu-latest": "linux-x64",
        "ubuntu-24.04-arm": "linux-arm64",
        "windows-latest": "windows-x64",
        "macos-15-intel": "macos-x64",
        "macos-15": "macos-arm64",
    }
    assert {
        item["os"]: item["platform"]
        for item in install_job["strategy"]["matrix"]["include"]
    } == expected_targets
    assert install_job["runs-on"] == "${{ matrix.os }}"
    assert install_job["needs"] == "plugin-dependency-scope"
    assert install_job["if"] == "needs.plugin-dependency-scope.outputs.run == 'true'"
    assert not any("if" in step for step in install_job["steps"])
    assert '--platform "${{ matrix.platform }}"' in install_job["steps"][-1]["run"]
    scope_job = jobs["plugin-dependency-scope"]
    assert scope_job["runs-on"] == "ubuntu-latest"
    assert scope_job["steps"][0]["with"]["fetch-depth"] == 0
    assert scope_job["outputs"]["run"] == "${{ steps.dependency-scope.outputs.run }}"
    assert jobs["plugin-dependency-gate"]["if"] == "always()"
    assert set(jobs["plugin-dependency-gate"]["needs"]) == {
        "plugin-dependency-scope", "plugin-dependency-install-gate",
    }


def _bash() -> str:
    """Windows 优先使用已有 Git Bash，不调用 WSL。"""
    if os.name == "nt":
        git_bash = Path(os.environ.get("ProgramFiles", "C:/Program Files")) / "Git/bin/bash.exe"
        if git_bash.is_file():
            return str(git_bash)
    bash = shutil.which("bash")
    assert bash, "CI 合同测试需要 Bash"
    return bash


def _workflow_script(job: str) -> str:
    jobs = yaml.safe_load(PR_WORKFLOW.read_text(encoding="utf-8"))["jobs"]
    return jobs[job]["steps"][-1]["run"]


@pytest.mark.parametrize("changed_path,deleted,required", [
    ("plugins.v3/mediagovernor/governor.py", False, False),
    (".github/workflows/plugin-gate.yml", False, False),
    ("tests/ci/test_v3_dependency_install_gate.py", False, False),
    ("plugins.v3/example/pyproject.toml", False, True),
    ("plugins.v3/example/pyproject.toml", True, True),
    ("scripts/check_v3_dependency_install.py", False, True),
])
def test_scope_uses_real_git_changes_before_requesting_platforms(
    tmp_path: Path, changed_path: str, deleted: bool, required: bool,
) -> None:
    """执行真实 workflow 脚本，验证新增、修改、删除及无关差异。"""
    def git(*args: str) -> str:
        return subprocess.check_output(
            ["git", "-C", str(tmp_path), *args], text=True, encoding="utf-8",
        ).strip()

    git("init", "-q")
    git("config", "user.name", "CI fixture")
    git("config", "user.email", "ci@example.invalid")
    target = tmp_path / changed_path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text("before\n", encoding="utf-8")
    git("add", "--", changed_path)
    git("commit", "-qm", "before")
    base = git("rev-parse", "HEAD")
    if deleted:
        target.unlink()
    else:
        target.write_text("after\n", encoding="utf-8")
    git("add", "-A")
    git("commit", "-qm", "after")
    output = tmp_path / "github-output"
    result = subprocess.run(
        [_bash(), "-c", _workflow_script("plugin-dependency-scope")],
        cwd=tmp_path, env={**os.environ, "BASE_SHA": base, "GITHUB_OUTPUT": output.as_posix()},
        text=True, capture_output=True,
    )
    assert result.returncode == 0, result.stderr
    assert output.read_text(encoding="utf-8").strip() == f"run={str(required).lower()}"
    # 无效基线必须失败，不能把无法读取差异解释成无需安装。
    output.unlink()
    result = subprocess.run(
        [_bash(), "-c", _workflow_script("plugin-dependency-scope")],
        cwd=tmp_path, env={**os.environ, "BASE_SHA": "invalid-baseline", "GITHUB_OUTPUT": output.as_posix()},
        text=True, capture_output=True,
    )
    assert result.returncode != 0
    assert not output.exists()


@pytest.mark.parametrize("scope,required,install,success", [
    ("success", "false", "skipped", True),
    ("success", "true", "success", True),
    ("success", "true", "failure", False),
    ("success", "true", "cancelled", False),
    ("success", "true", "skipped", False),
    ("failure", "false", "skipped", False),
    ("cancelled", "false", "skipped", False),
    ("success", "", "skipped", False),
    ("success", "false", "success", False),
])
def test_dependency_summary_rejects_failure_or_unexpected_skip(
    scope: str, required: str, install: str, success: bool,
) -> None:
    """执行汇总脚本，未知输出、取消和误跳过均不能通过。"""
    result = subprocess.run(
        [_bash(), "-c", _workflow_script("plugin-dependency-gate")],
        env={**os.environ, "SCOPE_RESULT": scope, "INSTALL_REQUIRED": required, "INSTALL_RESULT": install},
        text=True, capture_output=True,
    )
    assert (result.returncode == 0) is success
