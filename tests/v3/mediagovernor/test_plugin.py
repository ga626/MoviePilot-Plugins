"""MediaGovernor S1 的官方 V3 目录与零副作用合同测试。"""

from __future__ import annotations

import ast
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "plugins.v3/mediagovernor/__init__.py"


def test_v3_directory_manifest_and_version_contract() -> None:
    """V3 目录、类名、市场索引与版本必须严格对应。"""
    manifest = json.loads((ROOT / "package.v3.json").read_text(encoding="utf-8"))["MediaGovernor"]
    source = SOURCE.read_text(encoding="utf-8")

    assert manifest["version"] == "0.1.0"
    assert manifest["system_version"] == ">=3.0.0"
    assert manifest["release"] is False
    assert "class MediaGovernor(_PluginBase):" in source
    assert 'plugin_version = "0.1.0"' in source


def test_s1_uses_only_minimal_official_plugin_contract() -> None:
    """S1 只保留官方最小生命周期入口，不注册动作、服务或 API。"""
    tree = ast.parse(SOURCE.read_text(encoding="utf-8"))
    modules = {
        node.module or ""
        for node in ast.walk(tree)
        if isinstance(node, ast.ImportFrom)
    }
    methods = {
        node.name
        for node in ast.walk(tree)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    }

    assert "app.plugins" in modules
    assert not any(module.startswith(("app.core.", "app.helper.", "app.utils.", "app.db")) for module in modules)
    assert {"init_plugin", "get_state", "get_api", "get_form", "get_page", "stop_service"} <= methods
    assert "get_actions" not in methods
    assert "get_service" not in methods


def test_s1_has_no_media_network_or_filesystem_side_effects() -> None:
    """S1 不得暗含整理、网络、文件、数据库或后台任务操作。"""
    source = SOURCE.read_text(encoding="utf-8")
    forbidden_tokens = (
        "TransferChain",
        "StorageChain",
        "RequestUtils",
        "AsyncRequestUtils",
        "eventmanager.register",
        "threading.",
        "open(",
        ".write_",
        ".unlink(",
        ".rename(",
        ".replace(",
        "shutil.",
        "os.remove",
        "save_data(",
        "update_config(",
    )

    assert all(token not in source for token in forbidden_tokens)
    assert "不移动、改名或删除任何文件" in source
