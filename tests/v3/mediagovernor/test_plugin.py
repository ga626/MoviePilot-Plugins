"""MediaGovernor V3 的发布合同测试；不访问 NAS 或真实媒体数据。"""

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

    class PluginBase(ABC):  # pragma: no cover - only supplies the host base contract.
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


def test_manifest_plugin_and_frontend_versions_are_synced() -> None:
    manifest = json.loads((ROOT / "package.v3.json").read_text(encoding="utf-8"))["MediaGovernor"]
    package = json.loads((ROOT / "plugins.v3/mediagovernor/package.json").read_text(encoding="utf-8"))
    source = PLUGIN.read_text(encoding="utf-8")
    assert manifest["version"] == package["version"] == "1.0.1"
    assert list(manifest["history"])[0] == "v1.0.1"
    assert 'plugin_version = "1.0.1"' in source
    assert 'return "vue", "dist/v1.0.1/assets"' in source
    assert "assetsDir: 'v1.0.1/assets'" in (ROOT / "plugins.v3/mediagovernor/vite.config.js").read_text(encoding="utf-8")


def test_plugin_is_a_thin_host_contract_without_private_backend_dependencies() -> None:
    plugin_class = _load_plugin()
    instance = plugin_class()
    assert plugin_class.plugin_name == "媒体治理"
    assert plugin_class.get_render_mode() == ("vue", "dist/v1.0.1/assets")
    instance.init_plugin({"enabled": True})
    assert instance.get_state() is True
    assert instance.get_command() == instance.get_api() == instance.get_service() == []
    assert instance.stop_service() is None

    modules = {
        node.module or ""
        for node in ast.walk(ast.parse(PLUGIN.read_text(encoding="utf-8")))
        if isinstance(node, ast.ImportFrom)
    }
    forbidden = ("app.db", "app.chain", "app.application", "app.core", "app.helper", "app.utils", "app.sdk._legacy")
    assert not any(module.startswith(forbidden) for module in modules)


def test_frontend_uses_injected_authenticated_api_and_all_recovery_endpoints() -> None:
    page = PAGE.read_text(encoding="utf-8")
    for endpoint in ("history/transfer", "storage/list", "media/recognize_file", "media/search", "transfer/manual"):
        assert endpoint in page
    assert "props.api" in page
    assert "fetch(" not in page and "axios" not in page
    assert "开始检查全部" in page and "搜索官方候选" in page and "生成官方预览" in page
    assert "function sourcePackage" in page and "async function packageEvidence" in page
    assert "maxPackageDirectories" in page and "maxPackageDepth" in page


def test_repair_payload_is_preview_then_confirmed_link_without_history_cleanup() -> None:
    page = PAGE.read_text(encoding="utf-8")
    payload = page[page.index("function manualPayload"):page.index("async function makePreview")]
    assert "fileitem: item.source" in payload
    assert "transfer_type: 'link'" in payload
    assert "preview: previewMode" in payload
    assert "reorganize: false" in payload
    assert "logid" not in payload and "historyId" not in payload
    assert "manualPayload(selected.value, true)" in page
    assert "manualPayload(preview.value.item, false)" in page
    assert "确认创建正确硬链接" in page and "确认执行" in page


def test_release_sources_do_not_ship_legacy_private_governor() -> None:
    assert not (ROOT / "plugins.v3/mediagovernor/governor.py").exists()
    assert (ROOT / "plugins.v3/mediagovernor/dist/v1.0.1/assets/remoteEntry.js").is_file()
