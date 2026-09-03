"""MediaGovernor V3 发布合同测试；不访问 NAS、模型或真实媒体数据。"""

from __future__ import annotations

import ast
import asyncio
from abc import ABC, abstractmethod
import importlib.util
import json
from pathlib import Path
import sys
import types


ROOT = Path(__file__).resolve().parents[3]
PLUGIN = ROOT / "plugins.v3/mediagovernor/__init__.py"
PAGE = ROOT / "plugins.v3/mediagovernor/src/components/AppPage.vue"
RULES = ROOT / "plugins.v3/mediagovernor/src/lib/governance.js"


class _FakeLLMHelper:
    @staticmethod
    def get_llm(*_args, **_kwargs):
        return _FakeLLM()

    @staticmethod
    def extract_text_content(content, **_kwargs):
        return str(content or "")


class _FakeLLM:
    calls = 0

    async def ainvoke(self, _prompt):
        type(self).calls += 1
        return types.SimpleNamespace(content='''{"classification":"media","title":"Cowboy Bebop","original_title":"Cowboy Bebop","year":"1998","media_type":"tv","season":1,"expected_episodes":[1,2,3,26],"confidence":0.92,"evidence_indexes":[0,1],"reasons":["文件名与集号一致"],"abstain":false}''')


def _load_plugin():
    app = types.ModuleType("app")
    plugins = types.ModuleType("app.plugins")
    agent = types.ModuleType("app.agent")
    llm = types.ModuleType("app.agent.llm")
    helper = types.ModuleType("app.agent.llm.helper")
    fastapi = types.ModuleType("fastapi")

    class PluginBase(ABC):
        @abstractmethod
        def stop_service(self) -> None:
            pass

    plugins._PluginBase = PluginBase
    helper.LLMHelper = _FakeLLMHelper
    fastapi.Request = type("Request", (), {})
    saved = {name: sys.modules.get(name) for name in ("app", "app.plugins", "app.agent", "app.agent.llm", "app.agent.llm.helper", "fastapi")}
    sys.modules.update({"app": app, "app.plugins": plugins, "app.agent": agent, "app.agent.llm": llm, "app.agent.llm.helper": helper, "fastapi": fastapi})
    try:
        spec = importlib.util.spec_from_file_location("mediagovernor_plugin", PLUGIN)
        assert spec and spec.loader
        module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = module
        spec.loader.exec_module(module)
        return module
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
    assert manifest["version"] == package["version"] == "1.7.0"
    assert list(manifest["history"])[0] == "v1.7.0"
    assert 'plugin_version = "1.7.0"' in source
    assert 'return "vue", "dist/v1.7.0/assets"' in source
    assert "assetsDir: 'v1.7.0/assets'" in (ROOT / "plugins.v3/mediagovernor/vite.config.js").read_text(encoding="utf-8")


def test_plugin_exposes_only_authenticated_readonly_bundle_analysis() -> None:
    module = _load_plugin()
    instance = module.MediaGovernor()
    assert module.MediaGovernor.get_render_mode() == ("vue", "dist/v1.7.0/assets")
    instance.init_plugin({"enabled": True})
    assert instance.get_state() is True
    api = instance.get_api()
    assert len(api) == 1
    assert api[0]["path"] == "/bundle_analyze"
    assert api[0]["auth"] == "bear"
    assert api[0]["response_model"] is module.BundleAnalysisResponse
    assert instance.get_command() == instance.get_service() == []
    assert instance.stop_service() is None
    modules = {node.module or "" for node in ast.walk(ast.parse(PLUGIN.read_text(encoding="utf-8"))) if isinstance(node, ast.ImportFrom)}
    forbidden = ("app.db", "app.chain", "app.application", "app.core", "app.helper", "app.utils", "app.sdk._legacy")
    assert not any(module_name.startswith(forbidden) for module_name in modules)
    assert "app.agent.llm.helper" in modules


def test_bundle_evidence_is_bounded_and_has_no_path_field() -> None:
    module = _load_plugin()
    evidence = module.MediaGovernor._normalise_evidence({
        "title_hints": ["[Cowboy_Bebop]", "x" * 1000],
        "entries": [{"name": "Cowboy_Bebop.[01].mkv", "type": "file", "depth": 1, "path": "/must/not/leave"}] * 600,
        "episodes": [1, "26", 0, 1000],
        "video_count": 2,
    })
    assert len(evidence["entries"]) == 500
    assert evidence["entries"][0] == {"name": "Cowboy_Bebop.[01].mkv", "type": "file", "depth": 1}
    assert evidence["episodes"] == [1, 26]
    assert all("path" not in entry for entry in evidence["entries"])
    assert len(evidence["title_hints"][1]) == 120


def test_model_output_is_structured_and_remains_only_a_diagnosis() -> None:
    module = _load_plugin()
    instance = module.MediaGovernor()
    diagnosis = asyncio.run(instance._invoke_bundle_model({"title_hints": ["Cowboy Bebop"], "entries": [{"name": "Cowboy.Bebop.S01E26.mkv", "type": "file", "depth": 1}], "episodes": [26], "video_count": 1, "subtitle_count": 0, "nfo_count": 0}))
    assert diagnosis.title == "Cowboy Bebop"
    assert diagnosis.expected_episodes == [1, 2, 3, 26]
    assert diagnosis.abstain is False
    uncertain = module.MediaGovernor._diagnosis_from_model({"classification": "media", "title": "", "confidence": 0.99}, 0)
    assert uncertain.abstain is True


def test_same_sanitized_bundle_reuses_in_memory_model_diagnosis() -> None:
    module = _load_plugin()
    instance = module.MediaGovernor()
    instance.init_plugin({"enabled": True})
    _FakeLLM.calls = 0

    class Request:
        async def json(self):
            return {"evidence": {"title_hints": ["Cowboy Bebop"], "entries": [{"name": "Cowboy.Bebop.S01E01.mkv", "type": "file", "depth": 1}], "episodes": [1], "video_count": 1}}

    async def run():
        first = await instance.api_bundle_analyze(Request())
        second = await instance.api_bundle_analyze(Request())
        assert first.success and second.success

    asyncio.run(run())
    assert _FakeLLM.calls == 1


def test_frontend_uses_one_bundle_tree_then_model_and_official_verification() -> None:
    page = PAGE.read_text(encoding="utf-8")
    for endpoint in ("history/transfer?status=${status}", "storage/directories?directory_type=all", "storage/list", "plugin/MediaGovernor/bundle_analyze", "media/source", "media/recognize", "media/recognize_file", "media/search", "transfer/manual/history", "transfer/manual/target-path", "transfer/manual"):
        assert endpoint in page
    assert "inventoryGroups(roots)" in page
    assert "groupsFromFiles(current, children)" in page
    assert "mergeExactHistory(inventory, failureGroups)" in page
    assert "card.state !== 'clear'" in page
    assert "slice(0, 2)" in page
    assert "当前库存" in page and "历史仅作为交叉线索" in page
    assert "inventoryNodeLimit" in page
    assert "replace(/[\\[\\]【】()]/g, ' ')" in page
    assert "name.match(/\\[(\\d{1,3})\\]" in page
    assert "bundlePayload" in page and "diagnoseBundle" in page and "diagnosisText" in page
    assert "整包模型判断" in page and "查看发送给模型的目录结构" in page
    assert "候选总集数" in page and "hardReject" in page
    assert "videoSource" in page and "music|audio" in page
    assert "organizationIssues" in page and "acceptanceFixtures" in page
    rules = RULES.read_text(encoding="utf-8")
    assert "发现重复集号" in rules and "集号缺失" in rules
    assert "acceptanceFixtures" in page and "验收样例" in page
    assert "dedupeRoots" in page and "scopeLimit" in page
    assert "fetch(" not in page and "axios" not in page


def test_organization_is_preview_only_and_cannot_hide_old_link_deletion() -> None:
    page = PAGE.read_text(encoding="utf-8")
    payload = page[page.index("function previewPayload"):page.index("function previewIssues")]
    assert "preview: true" in payload
    assert "reorganize: false" in payload
    assert "官方逐文件计划" in page and "旧硬链接清理仍锁定" in page
    assert "确认执行官方重整" not in page
    assert "function repair" not in page


def test_release_sources_do_not_ship_legacy_private_governor() -> None:
    assert not (ROOT / "plugins.v3/mediagovernor/governor.py").exists()
