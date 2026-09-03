"""MediaGovernor V3 发布合同测试；不访问 NAS 或真实媒体数据。"""

from __future__ import annotations

import ast
from abc import ABC, abstractmethod
import importlib.util
import json
from pathlib import Path
import sys
import types


ROOT = Path(__file__).resolve().parents[3]
PLUGIN = ROOT / "plugins.v3/mediagovernor/__init__.py"
PAGE = ROOT / "plugins.v3/mediagovernor/src/components/AppPage.vue"


def _load_plugin():
    app = types.ModuleType("app")
    plugins = types.ModuleType("app.plugins")

    class PluginBase(ABC):
        @abstractmethod
        def stop_service(self) -> None:
            pass

    plugins._PluginBase = PluginBase
    saved = {name: sys.modules.get(name) for name in ("app", "app.plugins")}
    sys.modules["app"] = app
    sys.modules["app.plugins"] = plugins
    try:
        spec = importlib.util.spec_from_file_location("mediagovernor_plugin", PLUGIN)
        assert spec and spec.loader
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module.MediaGovernor
    finally:
        for name, value in saved.items():
            if value is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = value


def test_versions_and_federation_assets_are_synced() -> None:
    manifest = json.loads((ROOT / "package.v3.json").read_text(encoding="utf-8"))["MediaGovernor"]
    package = json.loads((ROOT / "plugins.v3/mediagovernor/package.json").read_text(encoding="utf-8"))
    source = PLUGIN.read_text(encoding="utf-8")
    assert manifest["version"] == package["version"] == "1.3.0"
    assert list(manifest["history"])[0] == "v1.3.0"
    assert 'plugin_version = "1.3.0"' in source
    assert 'return "vue", "dist/v1.3.0/assets"' in source
    assert "assetsDir: 'v1.3.0/assets'" in (ROOT / "plugins.v3/mediagovernor/vite.config.js").read_text(encoding="utf-8")


def test_plugin_remains_a_thin_public_host_contract() -> None:
    plugin_class = _load_plugin()
    instance = plugin_class()
    assert plugin_class.get_render_mode() == ("vue", "dist/v1.3.0/assets")
    instance.init_plugin({"enabled": True})
    assert instance.get_state() is True
    assert instance.get_command() == instance.get_api() == instance.get_service() == []
    assert instance.stop_service() is None
    modules = {node.module or "" for node in ast.walk(ast.parse(PLUGIN.read_text(encoding="utf-8"))) if isinstance(node, ast.ImportFrom)}
    forbidden = ("app.db", "app.chain", "app.application", "app.core", "app.helper", "app.utils", "app.sdk._legacy")
    assert not any(module.startswith(forbidden) for module in modules)


def test_frontend_builds_a_true_scope_and_complete_evidence_ledger() -> None:
    page = PAGE.read_text(encoding="utf-8")
    for endpoint in ("history/transfer?status=${status}", "storage/directories", "storage/list", "media/source", "media/recognize", "media/recognize_file", "media/search", "transfer/manual/history", "transfer/manual/target-path", "transfer/manual"):
        assert endpoint in page
    assert "props.api" in page
    assert "fetch(" not in page and "axios" not in page
    assert "historyRows(false" in page and "historyRows(true" in page
    assert "treeEvidence" in page and "while (queue.length)" in page
    assert "entries" in page and "fingerprint" in page
    assert "maxDirs" not in page and "maxDepth" not in page and "maxCandidates" not in page
    assert "直接父目录" in page and "失败后已成功" in page
    assert "原名：" in page and "候选标题与完整包名称线索没有交集" in page


def test_organization_is_preview_only_and_cannot_hide_old_link_deletion() -> None:
    page = PAGE.read_text(encoding="utf-8")
    payload = page[page.index("function previewPayload"):page.index("function previewIssues")]
    assert "preview: true" in payload
    assert "reorganize: false" in payload
    assert "transfer/manual/history" in page and "transfer/manual/target-path" in page
    assert "官方逐文件计划" in page and "旧硬链接清理仍锁定" in page
    assert "确认执行官方重整" not in page
    assert "function repair" not in page
    assert "payload(selected.value, false" not in page


def test_release_sources_do_not_ship_legacy_private_governor() -> None:
    assert not (ROOT / "plugins.v3/mediagovernor/governor.py").exists()
