"""MediaGovernor v5 合同与同路回放测试；不访问 NAS、网络或真实媒体。"""
from __future__ import annotations

import importlib.util
import inspect
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
import types
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
PLUGIN_DIR = ROOT / "plugins.v3/mediagovernor"
GOVERNOR = PLUGIN_DIR / "governor.py"
PLUGIN = PLUGIN_DIR / "__init__.py"
PAGE = PLUGIN_DIR / "src/components/AppPage.vue"
MANIFEST = ROOT / "package.v3.json"
GOLDENS = [
    ROOT / "tests/v3/mediagovernor/fixtures/golden/v1/cases.json",
    ROOT / "tests/v3/mediagovernor/fixtures/golden/v1/live-baseline.json",
]


def load_governor():
    name = "mediagovernor_v5_governor"
    spec = importlib.util.spec_from_file_location(name, GOVERNOR)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


G = load_governor()


def load_plugin_with_host_boundary():
    app = types.ModuleType("app")
    plugins = types.ModuleType("app.plugins")
    class Base:
        def __init__(self): self.path = Path(tempfile.mkdtemp())
        def get_data_path(self): return self.path
    plugins._PluginBase = Base
    saved = {name: sys.modules.get(name) for name in ("app", "app.plugins")}
    sys.modules.update({"app": app, "app.plugins": plugins})
    name = "mediagovernor_v5_plugin"
    try:
        spec = importlib.util.spec_from_file_location(name, PLUGIN, submodule_search_locations=[str(PLUGIN_DIR)])
        module = importlib.util.module_from_spec(spec)
        assert spec and spec.loader
        sys.modules[name] = module
        spec.loader.exec_module(module)
        return module
    finally:
        for key, value in saved.items():
            if value is None: sys.modules.pop(key, None)
            else: sys.modules[key] = value


class FakeAdapter:
    def __init__(self):
        self.present: dict[str, dict] = {}
        self.preview_value: dict = {"summary": {"total": 0, "success": 0, "failed": 0}, "items": []}
        self.preview_calls = 0
        self.rebuild_calls: list[dict] = []

    def get_item(self, storage, path):
        return self.present.get(G.normal_path(path))

    def preview(self, source, identity):
        self.preview_calls += 1
        return json.loads(json.dumps(self.preview_value))

    def relationship(self, source, target):
        # 旧 golden 专门回放路径判断，文件关联在 fixture 中视为已知；
        # 真实同对象、复制和读取失败由后面的独立临时文件用例验证。
        return {"status": "verified", "method": "fixture_relation"}

    def rebuild(self, entry, identity):
        self.rebuild_calls.append(entry)
        self.present[G.normal_path(entry["expected"])] = {"path": entry["expected"], "type": "file"}
        if entry.get("cleanup_attributable"):
            self.present.pop(G.normal_path(entry.get("current")), None)


def inventory(roots=None):
    return G.Inventory([], roots or [{"path": "/fixture/library/movie", "name": "电影"}, {"path": "/fixture/library/tv", "name": "电视剧"}, {"path": "/fixture/library/anime", "name": "动漫"}], [], [])


def object_for(case):
    unit = case["input"]["unit"]
    entries = [{"storage": "local", "type": "file", **row} for row in unit.get("entries") or []]
    return {"id": unit.get("id", "case"), "label": unit.get("id", "case"), "root": {"path": entries[0]["path"] if len(entries) == 1 else str(Path(entries[0]["path"]).parent), "storage": "local", "type": "dir"}, "entries": entries, "complete": unit.get("complete", True), "fingerprint": G.fingerprint(entries)}


def test_versions_api_and_frontend_contract_are_v5():
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))["MediaGovernor"]
    package = json.loads((PLUGIN_DIR / "package.json").read_text(encoding="utf-8"))
    source = PLUGIN.read_text(encoding="utf-8")
    page = PAGE.read_text(encoding="utf-8")
    assert manifest["version"] == package["version"] == "5.1.0"
    assert next(iter(manifest["history"])) == "v5.1.0"
    assert 'plugin_version = "5.1.0"' in source
    assert 'return "vue", "dist/v5.1.0/assets"' in source
    for endpoint in ("/audit/start", "/audit/status", "/findings", "/objects/{object_id}", "/identity/confirm", "/repair/{object_id}"):
        assert endpoint in source
    for forbidden in ("storage/list", "transfer/manual", "bundle_analyze_batch", "experiment_run", "map_commit"):
        assert forbidden not in page
    assert "检查现在" in page and "重建全部基线" in page and "确认修复" in page
    assert "background:white" not in page and "background: white" not in page
    assert "--v-theme-surface" in page and "--v-theme-on-surface" in page and "--v-theme-primary" in page
    assert ".governor-shell h1,.governor-shell h2,.governor-shell h3" in page
    assert "正在停止…" in page and "检查已停止" in page
    module = load_plugin_with_host_boundary()
    plugin = module.MediaGovernor(); plugin.init_plugin({"enabled": False})
    assert plugin.get_render_mode() == ("vue", "dist/v5.1.0/assets")
    assert [row["path"] for row in plugin.get_api()] == ["/audit/start", "/audit/status", "/findings", "/objects/{object_id}", "/identity/confirm", "/identity/search", "/repair/{object_id}"]
    assert all(row["auth"] == "bear" for row in plugin.get_api())


def test_real_moviepilot_v3_runtime_constructs_initializes_and_stops_plugin():
    from app.application.chain.context import (
        ChainRuntimeContext,
        configure_chain_runtime_context_provider,
    )
    from app.application.configuration import ChainRuntimeConfig
    from app.chain.storage import StorageChain
    from app.chain.transfer import TransferChain
    from app.plugins import mediagovernor
    from app.runtime.stop import runtime_stop_state
    from app.sdk.queries import list_transfer_history

    queue = types.SimpleNamespace(bind=lambda _callback: types.SimpleNamespace())
    context = ChainRuntimeContext(
        module_manager=types.SimpleNamespace(), plugin_manager=types.SimpleNamespace(), event_manager=types.SimpleNamespace(),
        message_oper=types.SimpleNamespace(), message_helper=types.SimpleNamespace(), file_cache=types.SimpleNamespace(), async_file_cache=types.SimpleNamespace(),
        message_queue=queue, module_dispatcher_factory=lambda **_kwargs: types.SimpleNamespace(), site_repository=None,
        subscription_repository=None, subscription_search_repository=None, subscription_mutation_scope=None, sync_subscription_mutation_scope=None,
        subscription_delete_scope=None, sync_subscription_delete_scope=None, subscription_completion_scope=None, rule_group_mutation_scope=None,
        site_reference_mutation_scope=None, download_history_repository=None, transfer_history_repository=None, transfer_admission_repository=None,
        transfer_execution_repository=None, media_server_repository=None, download_failure_repository=None,
        user_repository=None, configuration=ChainRuntimeConfig(media_extensions=()), stop_state=runtime_stop_state,
    )
    configure_chain_runtime_context_provider(lambda: context)
    try:
        required = {"fileitem", "target_storage", "target_path", "media_source", "media_id", "mtype", "season", "transfer_type", "preview", "reorganize", "cleanup_dest_fileitem"}
        assert required <= set(inspect.signature(TransferChain.manual_transfer).parameters)
        assert "storage" in inspect.signature(StorageChain.get_file_item_strict).parameters
        assert callable(list_transfer_history)
        plugin = mediagovernor.MediaGovernor()
        plugin.init_plugin({"enabled": False})
        assert plugin.get_state() is False and plugin.get_render_mode() == ("vue", "dist/v5.1.0/assets")
        plugin.stop_service()
    finally:
        configure_chain_runtime_context_provider(None)


def test_sqlite_ledger_has_five_tables_and_does_not_touch_legacy_map(tmp_path):
    legacy = tmp_path / "media_map.json"
    legacy.write_text('{"keep":true}', encoding="utf-8")
    ledger = G.Ledger(tmp_path / "governor-v5.sqlite3")
    tables = {row["name"] for row in ledger.query("SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"objects", "identities", "observations", "findings", "jobs"} <= tables
    assert legacy.read_text(encoding="utf-8") == '{"keep":true}'


def test_reinitialization_never_duplicates_event_listeners():
    module = load_plugin_with_host_boundary()
    active = set()
    module.EventType = types.SimpleNamespace(TransferComplete="complete", TransferFailed="failed")
    module.eventmanager = types.SimpleNamespace(
        add_event_listener=lambda event, handler: active.add((event, handler)),
        remove_event_listener=lambda event, handler: active.discard((event, handler)),
    )
    plugin = module.MediaGovernor()
    plugin.init_plugin({"enabled": True}); plugin.init_plugin({"enabled": True})
    assert len(active) == 2
    plugin.stop_service()
    assert active == set()


def test_download_hash_is_the_primary_work_boundary_and_unmatched_is_not_guessed():
    top = {"path": "/fixture/download/mixed", "name": "mixed", "type": "dir", "storage": "local"}
    entries = [
        {"path": "/fixture/download/mixed/A.mkv", "name": "A.mkv", "type": "file"},
        {"path": "/fixture/download/mixed/B.mkv", "name": "B.mkv", "type": "file"},
        {"path": "/fixture/download/mixed/loose.mkv", "name": "loose.mkv", "type": "file"},
    ]
    histories = [
        {"src": entries[0]["path"], "download_hash": "one", "media_source": "themoviedb", "media_id": "1", "type": "电影"},
        {"src": entries[1]["path"], "download_hash": "two", "media_source": "themoviedb", "media_id": "2", "type": "电影"},
    ]
    groups = G.partition_entries(top, entries, histories)
    assert {row["group_key"] for row in groups} == {"hash:one", "hash:two", "unmatched"}
    assert sum(len(row["entries"]) for row in groups) == 3


def test_configured_roots_reject_container_root_and_deduplicate():
    rows = [types.SimpleNamespace(download_path="/", storage="local"), types.SimpleNamespace(download_path="/downloads", storage="local"), types.SimpleNamespace(download_path="/downloads", storage="local")]
    adapter = G.MoviePilotAdapter()
    adapter._loaded = {"dirs": types.SimpleNamespace(get_download_dirs=lambda: rows)}
    assert [row["path"] for row in adapter.directories("download")] == ["/downloads"]


def test_bdmv_is_walked_as_one_atomic_object_and_samples_are_ignored():
    assert G.is_sample({"path": "/fixture/download/Film/Sample/sample.mkv"})
    assert "bdmv" in G.DISC_DIRECTORIES
    top = {"path": "/fixture/download/Disc", "name": "Disc", "type": "dir"}
    entries = [{"path": "/fixture/download/Disc/movie.iso", "name": "movie.iso", "type": "file"}]
    groups = G.partition_entries(top, entries, [])
    assert len(groups) == 1 and groups[0]["group_key"] == "unmatched"


def test_structural_fallback_splits_movie_collections_but_not_tv_seasons():
    top = {"path": "/fixture/download/Collection", "name": "Collection", "type": "dir"}
    movies = [
        {"path": "/fixture/download/Collection/Film A/A.mkv", "name": "A.mkv", "type": "file"},
        {"path": "/fixture/download/Collection/Film B/B.mkv", "name": "B.mkv", "type": "file"},
    ]
    seasons = [
        {"path": "/fixture/download/Collection/Season 1/Show.S01E01.mkv", "name": "Show.S01E01.mkv", "type": "file"},
        {"path": "/fixture/download/Collection/Season 2/Show.S02E01.mkv", "name": "Show.S02E01.mkv", "type": "file"},
    ]
    assert {row["group_key"] for row in G.partition_entries(top, movies, [])} == {"folder:Film A", "folder:Film B"}
    assert [row["group_key"] for row in G.partition_entries(top, seasons, [])] == ["unmatched"]


def test_native_history_agreement_is_a_candidate_not_independent_confirmation(tmp_path):
    class Adapter(FakeAdapter):
        def recognize(self, path): return {"title": "Film", "media_type": "movie", "media_source": "themoviedb", "media_id": "7"}
        def ai_queries(self, evidence): return []
        def search(self, query): return []
    service = G.GovernorService(tmp_path, Adapter())
    obj = {"id": "one", "fingerprint": "fp", "root": {"path": "/fixture/download/Film"}, "entries": [{"path": "/fixture/download/Film.mkv"}]}
    agree = [{"src": "/fixture/download/Film.mkv", "media_source": "themoviedb", "media_id": "7", "type": "电影"}]
    conflict = [{**agree[0], "media_id": "8"}]
    state, identity, candidates, provenance = service._resolve_identity(obj, agree)
    assert state == "candidate" and identity == {}
    assert [row["media_id"] for row in candidates] == ["7"]
    assert provenance == "native_and_history_agree"
    state, identity, candidates, _ = service._resolve_identity({**obj, "id": "two"}, conflict)
    assert state == "candidate" and identity == {} and {row["media_id"] for row in candidates} == {"7", "8"}


def test_async_only_llm_is_supported_and_limited_to_three_queries(monkeypatch):
    class Model:
        async def ainvoke(self, prompt):
            return types.SimpleNamespace(content='{"queries":[{"title":"A","year":"2024"},{"title":"B"},{"title":"C"},{"title":"D"}]}')
    class Helper:
        get_llm = staticmethod(lambda streaming=False: Model())
        extract_text_content = staticmethod(lambda value: value)
    app = types.ModuleType("app"); agent = types.ModuleType("app.agent"); llm = types.ModuleType("app.agent.llm"); helper = types.ModuleType("app.agent.llm.helper")
    helper.LLMHelper = Helper
    monkeypatch.setitem(sys.modules, "app", app); monkeypatch.setitem(sys.modules, "app.agent", agent); monkeypatch.setitem(sys.modules, "app.agent.llm", llm); monkeypatch.setitem(sys.modules, "app.agent.llm.helper", helper)
    assert G.MoviePilotAdapter().ai_queries({"names": ["A.mkv"]}) == ["A 2024", "B", "C"]


def test_current_async_get_llm_contract_is_supported(monkeypatch):
    class Model:
        async def ainvoke(self, prompt): return types.SimpleNamespace(content='{"one":{"queries":[{"title":"Film"}]}}')
    class Helper:
        @staticmethod
        async def get_llm(streaming=False): return Model()
        extract_text_content = staticmethod(lambda value: value)
    helper = types.ModuleType("app.agent.llm.helper"); helper.LLMHelper = Helper
    monkeypatch.setitem(sys.modules, "app.agent.llm.helper", helper)
    assert G.MoviePilotAdapter().ai_queries({"names": ["Film.mkv"]}) == ["Film"]


def test_golden_audit_cases_replay_through_v5_classifier(tmp_path):
    service = G.GovernorService(tmp_path, FakeAdapter())
    checked = 0
    for fixture in GOLDENS:
        for case in json.loads(fixture.read_text(encoding="utf-8"))["cases"]:
            if case.get("operation") not in {"audit", "state_audit"} or "preview" not in case["input"]:
                continue
            obj = object_for(case)
            data = case["input"]
            preview = json.loads(json.dumps(data["preview"]))
            for index, row in enumerate(preview.get("items") or []):
                row.setdefault("source", obj["entries"][min(index, len(obj["entries"]) - 1)]["path"])
                row.setdefault("target_storage", "local")
            adapter = service.adapter
            adapter.present = {G.normal_path(path): {"path": path, "type": "file"} for path in data.get("present") or []}
            adapter.present.update({G.normal_path(row["path"]): row for row in obj["entries"]})
            inv = G.Inventory([], data.get("library_roots") or inventory().library_roots, [], [])
            findings = service._findings(obj, data["unit"].get("history") or [], "confirmed", data["identity"], preview, inv)
            expected = case["expected"]
            if expected.get("disposition") == "normal":
                # 正常对象的反证样本含故意错误的 preview：可以拒绝预览，不能报媒体故障。
                intended = G.expected_category(data["identity"])
                conflicting_preview = intended not in {"unknown", "other"} and any(G.root_category(row["target"], inv.library_roots) not in {"other", intended} for row in preview["items"])
                if conflicting_preview:
                    assert {row["kind"] for row in findings} == {"preview_error"}, case["id"]
                else:
                    assert findings == [], case["id"]
            elif expected.get("kind") in {"native_failure", "category_error", "identity_error", "episode_error", "hierarchy_error"}:
                kinds = {row["kind"] for row in findings}
                issue_kinds = {kind for row in findings for kind in (row.get("evidence") or {}).get("issue_kinds", [])}
                if expected["kind"] == "native_failure":
                    assert expected["kind"] in kinds | issue_kinds, case["id"]
                else:
                    # 旧基线仅凭目录/季集/名称偏差标记错放，没有独立语义证据。
                    # 保留检测召回，但不能把这个旧标签当成已经证明的身份错误。
                    assert "path_deviation" in kinds and "false_success" not in kinds, case["id"]
            checked += 1
    assert checked >= 10


def test_one_object_failure_does_not_abort_later_objects(tmp_path):
    class Adapter(FakeAdapter):
        def directories(self, kind): return []
        def histories(self): return []
    service = G.GovernorService(tmp_path, Adapter())
    objects = [{"id": value, "label": value, "fingerprint": value, "root": {"path": f"/fixture/{value}"}, "entries": [], "complete": True} for value in ("bad", "good")]
    service._discover = lambda job_id: G.Inventory(objects, [], [], [])
    seen = []
    def process(job_id, obj, inv, resolved=None, force_preview=False):
        seen.append(obj["id"])
        if obj["id"] == "bad": raise RuntimeError("boom")
        service.ledger.replace_findings(obj["id"], [])
    service._process = process
    job = service.ledger.begin_job("full")
    service._run(job, "full", None)
    assert seen == ["bad", "good"]
    assert service.ledger.current_job()["status"] == "completed"


def test_ambiguous_identity_queries_are_batched_by_four(tmp_path):
    class Adapter(FakeAdapter):
        def recognize(self, path): return {}
        def ai_queries_batch(self, items):
            batches.append(len(items)); return {key: [] for key, _ in items}
        def search(self, query): return []
    batches = []
    service = G.GovernorService(tmp_path, Adapter(), ai_enabled=True)
    objects = [{"id": str(index), "label": str(index), "fingerprint": str(index), "root": {"path": f"/fixture/{index}"}, "entries": [{"path": f"/fixture/{index}.mkv"}], "complete": True} for index in range(9)]
    service._discover = lambda job_id: G.Inventory(objects, [], [], [])
    job = service.ledger.begin_job("full")
    service._run(job, "full", None)
    assert batches == [4, 4, 1]
    assert len(service.findings()["confirmations"]) == 9


def test_first_batch_is_saved_before_second_ai_batch_starts(tmp_path):
    class Adapter(FakeAdapter):
        def recognize(self, path): return {}
        def ai_queries_batch(self, items):
            batches.append([key for key, _ in items])
            if len(batches) == 2:
                assert service.ledger.current_job()["done"] == 4
                assert len(service.findings()["confirmations"]) == 4
            return {key: [] for key, _ in items}
        def search(self, query): return []
    batches = []
    service = G.GovernorService(tmp_path, Adapter(), ai_enabled=True)
    objects = [{"id": str(index), "label": str(index), "fingerprint": str(index), "root": {"path": f"/fixture/{index}"}, "entries": [{"path": f"/fixture/{index}.mkv"}], "complete": True} for index in range(9)]
    service._discover = lambda job_id: G.Inventory(objects, [], [], [])
    job = service.ledger.begin_job("full")
    service._run(job, "full", None)
    assert [len(batch) for batch in batches] == [4, 4, 1]
    assert service.ledger.current_job()["done"] == 9


def test_blocked_ai_can_be_cancelled_and_cancel_is_not_failure(tmp_path):
    entered = threading.Event()
    release = threading.Event()
    class Adapter(FakeAdapter):
        def recognize(self, path): return {}
        def ai_queries_batch(self, items):
            entered.set(); release.wait(5)
            return {key: [] for key, _ in items}
        def search(self, query): return []
    service = G.GovernorService(tmp_path, Adapter(), ai_enabled=True)
    obj = {"id": "one", "label": "one", "fingerprint": "fp", "root": {"path": "/fixture/one"}, "entries": [{"path": "/fixture/one.mkv"}], "complete": True}
    service._discover = lambda job_id: G.Inventory([obj], [], [], [])
    service.start("full")
    assert entered.wait(1)
    service.start("cancel")
    deadline = time.monotonic() + 1
    while service.status()["job"]["status"] == "running" and time.monotonic() < deadline:
        time.sleep(0.02)
    release.set()
    job = service.status()["job"]
    assert job["status"] == "cancelled" and job["phase"] == "CANCELLED"
    assert not job["error"]
    deadline = time.monotonic() + 1
    while service._thread and service._thread.is_alive() and time.monotonic() < deadline:
        time.sleep(0.02)
    service._discover = lambda job_id: G.Inventory([], [], [], [])
    assert service.start("incremental")["job"]["status"] in {"running", "completed"}
    deadline = time.monotonic() + 1
    while service.status()["job"]["status"] == "running" and time.monotonic() < deadline:
        time.sleep(0.02)
    assert service.status()["job"]["status"] == "completed"


def test_incremental_reuses_unchanged_candidate_without_ai(tmp_path):
    class Adapter(FakeAdapter):
        def recognize(self, path): raise AssertionError("未变化候选不应重新原生识别")
        def ai_queries_batch(self, items): raise AssertionError("未变化候选不应再次调用 AI")
        def search(self, query): raise AssertionError("未变化候选不应再次搜索")
    service = G.GovernorService(tmp_path, Adapter())
    obj = {"id": "one", "label": "one", "fingerprint": "fp", "root": {"path": "/fixture/one"}, "entries": [{"path": "/fixture/one.mkv"}], "complete": True}
    candidate = {"title": "One", "media_type": "movie", "media_source": "themoviedb", "media_id": "1"}
    service.ledger.save_identity("one", "candidate", "fp", {}, [candidate], "needs_user_confirmation")
    service._discover = lambda job_id: G.Inventory([obj], [], [], [])
    job = service.ledger.begin_job("incremental")
    service._run(job, "incremental", None)
    assert service.status()["job"]["status"] == "completed"
    assert service.detail("one")["candidates"] == [candidate]


def test_directory_rule_change_invalidates_configuration_fingerprint():
    before = {"path": "/fixture/library/movie", "storage": "local", "type": "dir", "rename_format": "A"}
    after = {**before, "rename_format": "B"}
    assert G.fingerprint([before]) != G.fingerprint([after])


def test_failed_preview_is_not_reused_as_a_successful_cache(tmp_path):
    adapter = FakeAdapter()
    service = G.GovernorService(tmp_path, adapter)
    source = {"path": "/fixture/download/Film.mkv", "storage": "local", "type": "file", "name": "Film.mkv", "size": 10}
    obj = {"id": "one", "label": "Film", "fingerprint": G.fingerprint([source]), "root": source, "entries": [source], "preview_sources": [source], "complete": True}
    identity = {"title": "Film", "media_type": "movie", "media_source": "themoviedb", "media_id": "1"}
    inv = G.Inventory([obj], [{"path": "/fixture/library/movie", "storage": "local", "type": "dir", "rename_format": "A"}], [], [])
    service.ledger.upsert_object(obj)
    service.ledger.save_identity("one", "confirmed", obj["fingerprint"], identity, [identity], "user_confirmed")
    adapter.preview_value = {"summary": {"total": 0, "success": 0, "failed": 1}, "items": [], "message": "temporary"}
    job = service.ledger.begin_job("incremental")
    service._process(job, obj, inv)
    assert adapter.preview_calls == 1
    adapter.preview_value = {"summary": {"total": 1, "success": 1, "failed": 0}, "items": [{"source": source["path"], "target": "/fixture/library/movie/Film/Film.mkv", "target_storage": "local", "success": True}]}
    service._process(job, obj, inv)
    assert adapter.preview_calls == 2


def test_case_sensitive_paths_do_not_collide_in_normalization():
    assert G.normal_path("/fixture/library/A.mkv") != G.normal_path("/fixture/library/a.mkv")
    assert G.fingerprint([{"path": "/fixture/library/A.mkv", "type": "file"}]) != G.fingerprint([{"path": "/fixture/library/a.mkv", "type": "file"}])


def test_enumeration_order_does_not_invalidate_file_or_configuration_cache():
    entries = [{"path": "/fixture/A.mkv", "type": "file", "size": 10}, {"path": "/fixture/B.mkv", "type": "file", "size": 20}]
    roots = [{"path": "/fixture/movie", "type": "dir", "rename_format": "A"}, {"path": "/fixture/tv", "type": "dir", "rename_format": "B"}]
    assert G.fingerprint(entries) == G.fingerprint(reversed(entries))
    assert G.fingerprint(roots) == G.fingerprint(reversed(roots))


def test_case_distinct_collection_folders_keep_every_file():
    top = {"path": "/fixture/mixed", "type": "dir"}
    entries = [{"path": f"/fixture/mixed/{name}/Film.mkv", "type": "file"} for name in ("A", "a")]
    groups = G.partition_entries(top, entries, [])
    assert len(groups) == 2
    assert {entry["path"] for group in groups for entry in group["entries"]} == {entry["path"] for entry in entries}


def test_full_refresh_preserves_user_confirmed_identity(tmp_path):
    class Adapter(FakeAdapter):
        def recognize(self, path): raise AssertionError("用户确认身份不得被完整重建覆盖")
        def ai_queries_batch(self, items): raise AssertionError("用户确认身份不应再进入 AI")
    service = G.GovernorService(tmp_path, Adapter())
    obj = {"id": "one", "label": "one", "fingerprint": "fp", "root": {"path": "/fixture/one"}, "entries": [{"path": "/fixture/one.mkv"}], "complete": True}
    identity = {"title": "One", "media_type": "movie", "media_source": "themoviedb", "media_id": "1"}
    service.ledger.save_identity("one", "confirmed", "fp", identity, [identity], "user_confirmed")
    service._discover = lambda job_id: G.Inventory([obj], [], [], [])
    job = service.ledger.begin_job("full")
    service._run(job, "full", None)
    assert service.detail("one")["identity"] == identity


def test_episode_target_probes_run_concurrently(tmp_path):
    entered = 0
    lock = threading.Lock()
    all_entered = threading.Event()
    class Adapter(FakeAdapter):
        def get_item(self, storage, path):
            nonlocal entered
            with lock:
                entered += 1
                if entered >= 4:
                    all_entered.set()
            assert all_entered.wait(1), "四个独立目标探针应并发执行"
            return {"path": path, "type": "file"}
    service = G.GovernorService(tmp_path, Adapter())
    entries = [{"path": f"/fixture/download/Show.S01E0{index}.mkv", "type": "file"} for index in range(1, 5)]
    obj = {"id": "show", "label": "Show", "fingerprint": "fp", "root": {"path": "/fixture/download/Show"}, "entries": entries, "complete": True}
    identity = {"title": "Show", "media_type": "tv", "media_source": "themoviedb", "media_id": "1"}
    preview = {"summary": {"total": 4, "success": 4, "failed": 0}, "items": [{"source": row["path"], "target": f"/fixture/library/tv/Show/Season 1/E{index}.mkv", "target_storage": "local"} for index, row in enumerate(entries, 1)]}
    job = service.ledger.begin_job("incremental")
    findings = service._findings(obj, [], "confirmed", identity, preview, inventory(), job)
    assert findings == [] and entered == 4


def test_incomplete_inventory_never_resolves_previous_findings(tmp_path):
    service = G.GovernorService(tmp_path, FakeAdapter())
    old = {"id": "old", "label": "Old", "fingerprint": "fp", "root": {}, "entries": [], "complete": True}
    service.ledger.upsert_object(old)
    service.ledger.replace_findings("old", [{"kind": "native_failure", "reason": "旧问题", "evidence": {}}])
    service._discover = lambda job_id: G.Inventory([], [], [], [{"path": "/fixture/download", "error": "unreadable"}])
    job = service.ledger.begin_job("incremental")
    service._run(job, "incremental", None)
    assert service.findings()["problems"][0]["title"] == "Old"


def test_clean_empty_inventory_resolves_removed_objects(tmp_path):
    service = G.GovernorService(tmp_path, FakeAdapter())
    old = {"id": "old", "label": "Old", "fingerprint": "fp", "root": {}, "entries": [], "complete": True}
    service.ledger.upsert_object(old)
    service.ledger.replace_findings("old", [{"kind": "native_failure", "reason": "旧问题", "evidence": {}}])
    service._discover = lambda job_id: G.Inventory([], [], [], [])
    job = service.ledger.begin_job("incremental")
    service._run(job, "incremental", None)
    assert service.findings()["problems"] == []


def test_preview_is_cached_but_target_existence_is_rechecked(tmp_path):
    adapter = FakeAdapter()
    service = G.GovernorService(tmp_path, adapter)
    obj = {"id": "one", "label": "Film", "fingerprint": "fp", "root": {"path": "/fixture/download/Film", "type": "dir"}, "entries": [{"path": "/fixture/download/Film.mkv", "type": "file"}], "complete": True}
    identity = {"title": "Film", "media_type": "movie", "media_source": "themoviedb", "media_id": "1"}
    service.ledger.upsert_object(obj); service.ledger.save_identity("one", "confirmed", "fp", identity, [identity], "user_confirmed")
    adapter.preview_value = {"summary": {"total": 1, "success": 1, "failed": 0}, "items": [{"source": obj["entries"][0]["path"], "target": "/fixture/library/movie/Film/Film.mkv", "target_storage": "local", "success": True}]}
    inv = G.Inventory([obj], [{"path": "/fixture/library/movie", "name": "电影"}], [], [])
    service._process("job", obj, inv); service._process("job", obj, inv)
    assert adapter.preview_calls == 1
    assert service.findings()["confirmations"][0]["kind"] == "relation_confirmation"
    service._process("job", obj, inv, force_preview=True)
    assert adapter.preview_calls == 2


def test_repair_token_expires_if_source_target_or_official_preview_changes(tmp_path):
    adapter = FakeAdapter(); service = G.GovernorService(tmp_path, adapter, read_only=False)
    source = {"path": "/fixture/download/Film.mkv", "storage": "local", "type": "file", "name": "Film.mkv", "size": 10}
    obj = {"id": "one", "label": "Film", "fingerprint": G.fingerprint([source]), "root": source, "entries": [source], "complete": True}
    identity = {"title": "Film", "media_type": "movie", "media_source": "themoviedb", "media_id": "1"}
    history = {"id": 9, "status": True, "src": source["path"], "dest": "/fixture/library/tv/Wrong/Wrong.mkv", "dest_storage": "local", "dest_fileitem": {"path": "/fixture/library/tv/Wrong/Wrong.mkv", "storage": "local", "type": "file"}}
    adapter.preview_value = {"summary": {"total": 1, "success": 1, "failed": 0}, "items": [{"source": source["path"], "target": "/fixture/library/movie/Film/Film.mkv", "target_storage": "local", "success": True}]}
    adapter.present = {G.normal_path(source["path"]): source, G.normal_path(history["dest"]): history["dest_fileitem"]}
    service.ledger.upsert_object(obj); service.ledger.save_identity("one", "confirmed", obj["fingerprint"], identity, [identity], "user_confirmed")
    service.ledger.save_observation("one", "source", True, obj["fingerprint"], {"object": obj, "histories": [history]})
    service.ledger.save_observation("__library__", "configuration", True, "cfg", {"roots": [{"path": "/fixture/library/tv"}, {"path": "/fixture/library/movie"}]})
    plan = service.repair_preview("one")
    assert plan["entries"][0]["cleanup_attributable"] is True
    adapter.present[G.normal_path(source["path"])] = {**source, "size": 11}
    try:
        service.repair_execute("one", plan["token"])
    except ValueError as error:
        assert "已经变化" in str(error)
    else:
        raise AssertionError("变化后的源文件不应执行修复")
    assert adapter.rebuild_calls == []


def test_repair_executes_frozen_plan_once_and_then_rechecks(tmp_path):
    adapter = FakeAdapter(); service = G.GovernorService(tmp_path, adapter, read_only=False)
    source = {"path": "/fixture/download/Film.mkv", "storage": "local", "type": "file", "name": "Film.mkv", "size": 10}
    obj = {"id": "one", "label": "Film", "fingerprint": G.fingerprint([source]), "root": source, "entries": [source], "complete": True}
    identity = {"title": "Film", "media_type": "movie", "media_source": "themoviedb", "media_id": "1"}
    adapter.preview_value = {"summary": {"total": 1, "success": 1, "failed": 0}, "items": [{"source": source["path"], "target": "/fixture/library/movie/Film/Film.mkv", "target_storage": "local", "success": True}]}
    adapter.present = {G.normal_path(source["path"]): source}
    service.ledger.upsert_object(obj); service.ledger.save_identity("one", "confirmed", obj["fingerprint"], identity, [identity], "user_confirmed")
    service.ledger.save_observation("one", "source", True, obj["fingerprint"], {"object": obj, "histories": []})
    service.ledger.save_observation("__library__", "configuration", True, "cfg", {"roots": [{"path": "/fixture/library/movie"}]})
    plan = service.repair_preview("one")
    service.start = lambda mode, ids: {"job": {"status": "running"}}
    result = service.repair_execute("one", plan["token"])
    assert result["accepted"] and len(adapter.rebuild_calls) == 1
    try:
        service.repair_execute("one", plan["token"])
    except ValueError:
        pass
    else:
        raise AssertionError("修复确认必须是一次性的")


def test_stop_is_cooperative_and_event_marking_only_sets_dirty(tmp_path):
    service = G.GovernorService(tmp_path, FakeAdapter())
    obj = {"id": "one", "label": "one", "fingerprint": "fp", "root": {}, "entries": [], "complete": True}
    service.ledger.upsert_object(obj); service.ledger.execute("UPDATE objects SET dirty=0")
    service.mark_dirty({"path": "/ignored"})
    assert service.ledger.one("SELECT dirty FROM objects WHERE id='one'")["dirty"] == 1
    assert service.stop() is True


def test_fixtures_are_deidentified_and_cover_real_baseline_categories():
    ids = set()
    for fixture in GOLDENS:
        raw = fixture.read_text(encoding="utf-8")
        assert "C:\\" not in raw and "/volume" not in raw
        ids |= {row["id"] for row in json.loads(raw)["cases"]}
    required = {"native-failure", "wrong-category", "wrong-season", "wrong-episode", "wrong-identity", "movie-collection-split", "baseline-one-piece-live-action-wrong-anime", "baseline-normal-boba-fett", "baseline-sample-is-ignored"}
    assert required <= ids


class LocalFixtureAdapter(FakeAdapter):
    """真实临时文件 + 正式公开逐对 adapter；识别和 preview 使用确定性桩。"""

    def __init__(self):
        super().__init__()
        self.naming = {"MOVIE_RENAME_FORMAT": "A"}
        self.recognize_calls = 0
        self.ai_calls = 0

    def get_item(self, storage, path):
        item = Path(path)
        if not item.exists():
            return None
        stat = item.stat()
        return {"path": str(item), "storage": storage, "type": "file" if item.is_file() else "dir", "size": stat.st_size, "modify_time": stat.st_mtime_ns}

    relationship = G.MoviePilotAdapter.relationship

    def recognize(self, path):
        self.recognize_calls += 1
        return {"title": "Film", "media_type": "movie", "media_source": "themoviedb", "media_id": "7"}

    def ai_queries_batch(self, items):
        self.ai_calls += 1
        return {}

    def preview_configuration(self):
        return self.naming


def local_fixture(tmp_path):
    source = tmp_path / "download" / "Film.mkv"
    target = tmp_path / "library" / "movie" / "Film.mkv"
    wrong = tmp_path / "library" / "tv" / "Wrong.mkv"
    for path in (source, target, wrong):
        path.parent.mkdir(parents=True, exist_ok=True)
    if not source.exists():
        source.write_bytes(b"fixture")
    adapter = LocalFixtureAdapter()
    source_item = adapter.get_item("local", str(source))
    obj = {"id": "local-film", "label": "Film", "root": source_item, "entries": [source_item], "complete": True, "fingerprint": G.fingerprint([source_item])}
    adapter.preview_value = {"summary": {"total": 1, "success": 1, "failed": 0}, "items": [{"source": str(source), "target": str(target), "target_storage": "local", "success": True}]}
    history = {"id": 1, "src": str(source), "status": False, "media_source": "themoviedb", "media_id": "7", "type": "电影"}
    roots = [{"path": str(target.parent), "storage": "local", "type": "dir", "name": "电影"}, {"path": str(wrong.parent), "storage": "local", "type": "dir", "name": "电视剧"}]
    return adapter, obj, G.Inventory([obj], roots, [history], []), source, target, wrong


def run_local_fixture(service, inv, *, confirmed_identity=True):
    # 这些物理/缓存用例预置人工答案，只验证身份确认之后的链路。
    # 未确认输入到候选/人工选择的完整传递在 test_identity_confirmation.py 验证。
    if confirmed_identity:
        for obj in inv.objects:
            if service._saved_identity(obj) is None:
                answer = {"title": "Film", "media_type": "movie", "media_source": "themoviedb", "media_id": "7"}
                service.ledger.save_identity(obj["id"], "confirmed", obj["fingerprint"], answer, [answer], "user_confirmed")
    service._discover = lambda job_id: inv
    job_id = service.ledger.begin_job("incremental")
    service._run(job_id, "incremental", None)
    job = service.ledger.current_job()
    assert job["status"] == "completed", job["error"]
    return service.findings()


def test_linked_target_overrides_old_failure_and_unchanged_run_has_zero_ai(tmp_path):
    adapter, obj, inv, source, target, _ = local_fixture(tmp_path)
    target.hardlink_to(source)
    service = G.GovernorService(tmp_path / "state", adapter)
    for _ in range(2):
        result = run_local_fixture(service, inv)
        assert not result["problems"] and not result["confirmations"] and not result["errors"]
    assert adapter.recognize_calls == 0 and adapter.preview_calls == 1
    assert adapter.ai_calls == 0
    assert service.detail(obj["id"])["relations"]["pairs"][0]["status"] == "verified"
    assert result["coverage"]["exhaustive"] is False


def test_confirmed_source_and_missing_expected_target_prove_recorded_failure(tmp_path):
    adapter, _, inv, _, _, _ = local_fixture(tmp_path)
    service = G.GovernorService(tmp_path / "state", adapter)
    result = run_local_fixture(service, inv)
    assert [row["kind"] for row in result["problems"]] == ["native_failure"]


def test_copy_and_same_metadata_replacement_remain_unproven(tmp_path):
    adapter, obj, inv, source, target, _ = local_fixture(tmp_path)
    target.hardlink_to(source)
    service = G.GovernorService(tmp_path / "state", adapter)
    run_local_fixture(service, inv)
    previous_stat = target.stat()
    target.unlink()
    target.write_bytes(source.read_bytes())
    os.utime(target, ns=(previous_stat.st_atime_ns, previous_stat.st_mtime_ns))
    result = run_local_fixture(service, inv)
    assert not result["problems"]
    assert [row["kind"] for row in result["confirmations"]] == ["relation_confirmation"]
    assert service.detail(obj["id"])["relations"]["pairs"][0]["status"] == "unproven"
    assert adapter.preview_calls == 1 and adapter.ai_calls == 0
    with pytest.raises(ValueError, match="关系尚未证实"):
        service.repair_preview(obj["id"])


def test_old_extra_wrong_target_is_checked_and_retained_after_history_disappears(tmp_path):
    adapter, obj, inv, source, target, wrong = local_fixture(tmp_path)
    wrong = wrong.with_name("Other {tmdb-8}.mkv")
    target.hardlink_to(source)
    wrong.hardlink_to(source)
    old = {**inv.histories[0], "status": True, "dest": str(wrong)}
    correct = {**old, "id": 2, "dest": str(target)}
    inv.histories = [old, correct]
    service = G.GovernorService(tmp_path / "state", adapter)
    for histories in ([old, correct], [correct]):
        inv.histories = histories
        result = run_local_fixture(service, inv)
        assert [row["kind"] for row in result["problems"]] == ["false_success"]
    pairs = service.detail(obj["id"])["relations"]["pairs"]
    assert any(pair["target"]["path"] == str(wrong) and pair["status"] == "verified" for pair in pairs)


def test_global_naming_rule_change_refreshes_preview_and_preserves_identity(tmp_path):
    adapter, obj, inv, source, target, _ = local_fixture(tmp_path)
    target.hardlink_to(source)
    service = G.GovernorService(tmp_path / "state", adapter)
    run_local_fixture(service, inv)
    identity = service.detail(obj["id"])["identity"]
    adapter.naming = {"MOVIE_RENAME_FORMAT": "B"}
    run_local_fixture(service, inv)
    assert adapter.preview_calls == 2 and adapter.recognize_calls == adapter.ai_calls == 0
    assert service.detail(obj["id"])["identity"] == identity


def test_rule_change_keeps_old_valid_link_in_confirmation_on_later_runs(tmp_path):
    adapter, _, inv, source, target, _ = local_fixture(tmp_path)
    target.hardlink_to(source)
    inv.histories[0].update(status=True, dest=str(target))
    service = G.GovernorService(tmp_path / "state", adapter)
    run_local_fixture(service, inv)
    adapter.naming = {"MOVIE_RENAME_FORMAT": "B"}
    adapter.preview_value["items"][0]["target"] = str(target.with_name("Renamed.mkv"))
    for _ in range(2):
        result = run_local_fixture(service, inv)
        assert not result["problems"]
        assert [row["kind"] for row in result["confirmations"]] == ["rule_change"]


def test_exact_source_set_preserves_user_confirmation_when_object_key_changes(tmp_path):
    adapter, obj, inv, source, target, _ = local_fixture(tmp_path)
    target.hardlink_to(source)
    service = G.GovernorService(tmp_path / "state", adapter)
    run_local_fixture(service, inv)
    identity = service.detail(obj["id"])["identity"]
    service.ledger.save_identity(obj["id"], "confirmed", obj["fingerprint"], identity, [identity], "user_confirmed")
    obj["id"] = "case-preserving-object-key"
    run_local_fixture(service, inv)
    detail = service.detail(obj["id"])
    assert detail["identity"] == identity and detail["provenance"] == "user_confirmed"
    assert adapter.recognize_calls == adapter.ai_calls == 0


def test_incomplete_read_preserves_previous_human_confirmation(tmp_path):
    adapter, obj, inv, source, target, _ = local_fixture(tmp_path)
    target.hardlink_to(source)
    service = G.GovernorService(tmp_path / "state", adapter)
    run_local_fixture(service, inv)
    identity = service.detail(obj["id"])["identity"]
    service.ledger.save_identity(obj["id"], "confirmed", obj["fingerprint"], identity, [identity], "user_confirmed")
    obj["complete"] = False
    result = run_local_fixture(service, inv)
    assert not result["problems"] and result["errors"][0]["kind"] == "read_error"
    assert service.detail(obj["id"])["identity"] == identity
    assert service.detail(obj["id"])["identity_state"] == "confirmed"


def test_candidate_cache_age_is_not_extended_by_repeated_observation(tmp_path):
    adapter, obj, inv, _, _, _ = local_fixture(tmp_path)
    adapter.recognize = lambda path: {}
    inv.histories = []
    adapter.search = lambda _: []
    service = G.GovernorService(tmp_path / "state", adapter, ai_enabled=True)
    run_local_fixture(service, inv, confirmed_identity=False)
    saved = service.ledger.one("SELECT * FROM identities WHERE object_id=?", (obj["id"],))
    run_local_fixture(service, inv, confirmed_identity=False)
    assert service.ledger.one("SELECT * FROM identities WHERE object_id=?", (obj["id"],))["updated_at"] == saved["updated_at"]
    assert adapter.ai_calls == 1
    service.ledger.execute("UPDATE identities SET updated_at='2000-01-01T00:00:00+00:00'")
    run_local_fixture(service, inv, confirmed_identity=False)
    assert adapter.ai_calls == 2


@pytest.mark.parametrize("failure", ["missing_file", "failed_summary"])
def test_partial_or_failed_preview_cannot_become_a_healthy_cached_result(tmp_path, failure):
    adapter, obj, inv, source, target, _ = local_fixture(tmp_path)
    target.hardlink_to(source)
    if failure == "missing_file":
        extra = source.with_name("Film.srt")
        extra.write_text("fixture", encoding="utf-8")
        obj["entries"].append(adapter.get_item("local", str(extra)))
        obj["fingerprint"] = G.fingerprint(obj["entries"])
    else:
        adapter.preview_value["summary"]["failed"] = 1
    service = G.GovernorService(tmp_path / "state", adapter)
    for _ in range(2):
        result = run_local_fixture(service, inv)
        assert not result["problems"]
        assert [row["kind"] for row in result["errors"]] == ["preview_error"]
    assert adapter.preview_calls == 2


def test_candidate_limit_keeps_pending_and_rotates_work_without_dropping_it(tmp_path, monkeypatch):
    adapter, obj, inv, source, target, wrong = local_fixture(tmp_path)
    target.hardlink_to(source)
    wrong.hardlink_to(source)
    inv.histories[0].update(status=True, dest=str(wrong))
    monkeypatch.setattr(G, "MAX_RELATION_PAIRS", 1)
    service = G.GovernorService(tmp_path / "state", adapter)
    observed = set()
    for _ in range(2):
        result = run_local_fixture(service, inv)
        receipt = service.detail(obj["id"])["relations"]
        assert len(receipt["pairs"]) == 2 and receipt["coverage"]["pending_pairs"] == 1
        assert any(row["kind"] == "relation_confirmation" for row in result["confirmations"])
        observed.update(pair["id"] for pair in receipt["pairs"] if pair["status"] != "pending")
    assert len(observed) == 2


def test_unit_commit_rolls_back_identity_preview_and_findings_together(tmp_path, monkeypatch):
    adapter, obj, inv, source, target, _ = local_fixture(tmp_path)
    target.hardlink_to(source)
    service = G.GovernorService(tmp_path / "state", adapter)
    run_local_fixture(service, inv)
    before = service.detail(obj["id"])
    adapter.naming = {"MOVIE_RENAME_FORMAT": "changed"}
    def fail_commit(*args):
        raise RuntimeError("injected commit failure")
    monkeypatch.setattr(service.ledger, "replace_findings", fail_commit)
    with pytest.raises(RuntimeError, match="injected commit failure"):
        service._process(service.ledger.begin_job("incremental"), obj, inv)
    assert service.detail(obj["id"]) == before


def test_timeouts_keep_a_service_wide_limit_and_late_results_cannot_commit(tmp_path):
    service = G.GovernorService(tmp_path, FakeAdapter())
    job_id = service.ledger.begin_job("incremental")
    release = threading.Event()
    calls = []
    def blocked():
        calls.append(1)
        release.wait(5)
        return "late"
    try:
        for _ in range(G.MAX_READ_WORKERS + 3):
            with pytest.raises(TimeoutError):
                service._readonly_call(job_id, "blocked", blocked, timeout=0.001)
        assert len(calls) == G.MAX_READ_WORKERS
        assert service.status()["readonly_inflight"] == G.MAX_READ_WORKERS
        assert service.stop() is False
        assert service.ledger.query("SELECT * FROM observations") == []
    finally:
        release.set()
        deadline = time.monotonic() + 2
        while service.status()["readonly_inflight"] and time.monotonic() < deadline:
            time.sleep(0.01)
    assert service.stop() is True
    assert service.ledger.query("SELECT * FROM observations") == []


def test_public_pair_adapter_does_not_promote_false_errors_or_foreign_storage(tmp_path, monkeypatch):
    adapter, _, _, source, target, _ = local_fixture(tmp_path)
    source_ref = {"path": str(source), "storage": "local", "type": "file"}
    target_ref = {"path": str(target), "storage": "local", "type": "file"}
    target.write_bytes(source.read_bytes())
    from app.sdk.utilities import SystemUtils
    for value in (False, None, "true"):
        monkeypatch.setattr(SystemUtils, "is_hardlink", lambda *args: value)
        assert adapter.relationship(source_ref, target_ref)["status"] == "unproven"
    def denied(*args):
        raise OSError("fixture read denied")
    monkeypatch.setattr(SystemUtils, "is_hardlink", denied)
    assert adapter.relationship(source_ref, target_ref)["status"] == "unproven"
    assert adapter.relationship(source_ref, {**target_ref, "storage": "remote"})["status"] == "unsupported"
    assert adapter.relationship(source_ref, source_ref)["status"] == "unproven"


def _crash_during_preview(tmp_path):
    adapter, _, inv, source, target, _ = local_fixture(tmp_path)
    target.hardlink_to(source)
    service = G.GovernorService(tmp_path / "state", adapter)
    run_local_fixture(service, inv)
    adapter.naming = {"MOVIE_RENAME_FORMAT": "changed"}
    def blocked_preview(*args):
        (tmp_path / "ready").write_text("ready", encoding="utf-8")
        time.sleep(30)
    adapter.preview = blocked_preview
    job_id = service.ledger.begin_job("incremental")
    service._process(job_id, inv.objects[0], inv)


def test_completed_unit_survives_process_termination_without_repeating_identity_or_preview(tmp_path):
    script = "import runpy,sys; from pathlib import Path; ns=runpy.run_path(sys.argv[1]); ns['_crash_during_preview'](Path(sys.argv[2]))"
    worker = subprocess.Popen([sys.executable, "-c", script, str(Path(__file__).resolve()), str(tmp_path)], stdout=subprocess.PIPE, stderr=subprocess.PIPE, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    try:
        deadline = time.monotonic() + 10
        while not (tmp_path / "ready").exists() and worker.poll() is None and time.monotonic() < deadline:
            time.sleep(0.02)
        assert (tmp_path / "ready").exists(), "fixture worker failed to reach the interruption point"
    finally:
        if worker.poll() is None:
            worker.terminate()
        stdout, stderr = worker.communicate(timeout=5)
    adapter, obj, inv, _, _, _ = local_fixture(tmp_path)
    service = G.GovernorService(tmp_path / "state", adapter)
    assert service.ledger.current_job()["status"] == "interrupted", (stdout, stderr)
    assert service.detail(obj["id"])["identity_state"] == "confirmed"
    result = run_local_fixture(service, inv)
    assert not result["problems"] and not result["confirmations"] and not result["errors"]
    assert adapter.recognize_calls == adapter.preview_calls == adapter.ai_calls == 0


def test_failed_preview_does_not_invalidate_current_physical_observation(tmp_path):
    adapter, obj, inv, source, target, wrong = local_fixture(tmp_path)
    wrong = wrong.with_name("Other {tmdb-8}.mkv")
    target.hardlink_to(source)
    wrong.hardlink_to(source)
    inv.histories[0].update(status=True, dest=str(wrong))
    service = G.GovernorService(tmp_path / "state", adapter)
    assert run_local_fixture(service, inv)["problems"][0]["kind"] == "false_success"
    adapter.naming = {"MOVIE_RENAME_FORMAT": "B"}
    adapter.preview_value["summary"]["failed"] = 1
    assert run_local_fixture(service, inv)["errors"][0]["kind"] == "preview_error"
    receipt = service.detail(obj["id"])["relations"]
    assert not receipt.get("stale") and receipt["coverage"]["checked_pairs"] == 2
    assert receipt["coverage"]["pending_pairs"] == 0
    inv.histories = []
    adapter.preview_value["summary"]["failed"] = 0
    assert run_local_fixture(service, inv)["problems"][0]["kind"] == "false_success"


def test_history_outside_managed_roots_is_not_read_and_blocks_strong_claim(tmp_path):
    adapter, _, inv, source, target, _ = local_fixture(tmp_path)
    target.hardlink_to(source)
    outside = tmp_path / "outside" / "Old.mkv"
    inv.histories[0].update(status=True, dest=str(outside))
    original_get = adapter.get_item
    def guarded_get(storage, path):
        assert G.normal_path(path) != G.normal_path(outside), "outside root must not be probed"
        return original_get(storage, path)
    adapter.get_item = guarded_get
    service = G.GovernorService(tmp_path / "state", adapter)
    result = run_local_fixture(service, inv)
    assert not result["problems"] and result["confirmations"][0]["kind"] == "relation_confirmation"


def test_pair_rejects_directory_without_invoking_recursive_sdk_branch(tmp_path, monkeypatch):
    adapter, _, _, source, target, _ = local_fixture(tmp_path)
    target.mkdir()
    from app.sdk.utilities import SystemUtils
    def forbidden(*args):
        raise AssertionError("directory must never reach SDK recursive comparison")
    monkeypatch.setattr(SystemUtils, "is_hardlink", forbidden)
    result = adapter.relationship({"path": str(source), "storage": "local", "type": "file"}, {"path": str(target), "storage": "local", "type": "file"})
    assert result["status"] == "unproven"


def test_missing_source_does_not_turn_old_failure_into_current_proof(tmp_path):
    adapter, _, inv, source, _, _ = local_fixture(tmp_path)
    source.unlink()
    service = G.GovernorService(tmp_path / "state", adapter)
    result = run_local_fixture(service, inv)
    assert not result["problems"] and result["confirmations"][0]["kind"] == "relation_confirmation"


def test_batch_timeouts_share_the_same_worker_limit(tmp_path):
    service = G.GovernorService(tmp_path, FakeAdapter())
    job_id = service.ledger.begin_job("incremental")
    release = threading.Event()
    calls = []
    def blocked():
        calls.append(1)
        release.wait(5)
    try:
        for _ in range(2):
            results = service._readonly_many(job_id, "batch", [(blocked, ())] * (G.MAX_READ_WORKERS + 4), timeout=0.001, concurrency=100)
            assert all(isinstance(result, TimeoutError) for result in results)
        assert len(calls) == G.MAX_READ_WORKERS
        assert service.status()["readonly_inflight"] == G.MAX_READ_WORKERS
    finally:
        release.set()
        deadline = time.monotonic() + 2
        while service.status()["readonly_inflight"] and time.monotonic() < deadline:
            time.sleep(0.01)
    assert service.stop() is True


def test_preview_configuration_keeps_rules_with_shared_roots_and_their_order(monkeypatch):
    from app.sdk.config import settings
    rules = [{"library_path": "/fixture/library", "media_type": "电影"}, {"library_path": "/fixture/library", "media_type": "电视剧"}]
    adapter = G.MoviePilotAdapter()
    adapter._loaded = {"dirs": types.SimpleNamespace(get_dirs=lambda: rules)}
    monkeypatch.setattr(settings, "MOVIE_RENAME_FORMAT", "fixture-format")
    before = adapter.preview_configuration()
    assert len(before["directory_rules"]) == 2 and before["MOVIE_RENAME_FORMAT"] == "fixture-format"
    rules.reverse()
    assert G.json_text(before, sort_keys=True) != G.json_text(adapter.preview_configuration(), sort_keys=True)
