"""物理优先合同：真实临时硬链接；身份/搜索为桩，不代表 NAS 或模型验收。

可证伪假设：身份门槛阻断调查；历史成为扫描前置；候选发生尾部饥饿；
截断文件名遗漏末尾异类；路径差异被误当身份错误。
"""
import json
import sys
import threading
import types

import pytest

from tests.v3.mediagovernor.test_v5 import G, FakeAdapter, LocalFixtureAdapter, local_fixture, load_plugin_with_host_boundary


class TreeAdapter(LocalFixtureAdapter):
    def __init__(self, roots):
        super().__init__()
        self.roots = roots
        self.events = []

    def directories(self, kind):
        return self.roots[kind]

    def list_dir(self, item):
        from pathlib import Path
        self.events.append("list")
        return [self.get_item(item.get("storage") or "local", str(p)) for p in Path(item["path"]).iterdir()]

    def histories(self):
        raise RuntimeError("history unavailable")

    def relationship(self, source, target):
        self.events.append("relation")
        return super().relationship(source, target)

    def recognize(self, path):
        self.events.append("recognize")
        return super().recognize(path)

    def search(self, query):
        return []


def tree_service(tmp_path):
    adapter, obj, inv, source, target, wrong = local_fixture(tmp_path)
    wrong.hardlink_to(source)
    tree = TreeAdapter({"download": [{"path": str(source.parent), "storage": "local", "type": "dir"}], "library": inv.library_roots})
    service = G.GovernorService(tmp_path / "state", tree)
    return service, tree, source, wrong


def test_history_failure_does_not_block_current_inventory(tmp_path):
    service, _, _, _ = tree_service(tmp_path)
    inv = service._discover(service.ledger.begin_job("full"))
    assert len(inv.objects) == 1 and inv.objects[0]["complete"]
    assert inv.histories == [] and inv.warnings
    assert inv.library["complete"] and inv.library["file_count"] == 1


def test_no_history_randomly_renamed_link_is_found_before_identity(tmp_path):
    service, adapter, _, wrong = tree_service(tmp_path)
    # 目标名称既不包含作品名，也不是官方预期路径。
    random_target = wrong.with_name("opaque-67239.mkv")
    wrong.rename(random_target)
    service._run(service.ledger.begin_job("full"), "full", None)
    assert service.status()["job"]["status"] == "completed"
    obj = service.ledger.one("SELECT id FROM objects")
    detail = service.detail(obj["id"])
    assert detail["identity_state"] == "candidate"
    assert any(p["status"] == "verified" and G.normal_path(p["target"]["path"]) == G.normal_path(random_target) for p in detail["relations"]["pairs"])
    assert adapter.events.index("relation") < adapter.events.index("recognize")
    assert adapter.preview_calls == adapter.ai_calls == 0


def test_old_identity_does_not_split_source_container():
    top = {"path": "/fixture/download/show", "type": "dir"}
    entries = [{"path": f"/fixture/download/show/Show.S01E{i:02}.mkv", "type": "file"} for i in (1, 2)]
    histories = [{"src": row["path"], "media_source": "themoviedb", "media_id": str(i)} for i, row in enumerate(entries)]
    groups = G.partition_entries(top, entries, histories)
    assert len(groups) == 1 and len(groups[0]["entries"]) == 2


def test_pending_pairs_do_not_starve_after_three_rotations(tmp_path, monkeypatch):
    adapter, obj, inv, source, target, _ = local_fixture(tmp_path)
    histories = []
    for index in range(5):
        path = target.with_name(f"alias-{index}.mkv")
        path.hardlink_to(source)
        histories.append({"src": str(source), "dest": str(path)})
    service = G.GovernorService(tmp_path / "state", adapter)
    monkeypatch.setattr(G, "MAX_RELATION_PAIRS", 2)
    previous, seen = {}, set()
    preview = adapter.preview_value
    for _ in range(3):
        receipt = service._observe_relations(obj, histories, preview, inv, None, previous)
        seen.update(p["id"] for p in receipt["pairs"] if p["status"] != "pending")
        previous = receipt
    assert len(seen) == 6


def test_digest_sees_tail_outlier_without_shipping_paths_or_raw_names():
    rows = [{"path": f"/fixture/private/Pack/Show.S01E{i:03}.1080p.WEB.mkv", "type": "file"} for i in range(1, 201)]
    rows.append({"path": "/fixture/private/Pack/Different.Film.1998.2160p.mkv", "type": "file"})
    obj = {"root": {"path": "/fixture/private/Pack", "name": "Pack"}, "entries": rows}
    evidence = G.GovernorService._evidence(obj)
    encoded = json.dumps(evidence, ensure_ascii=False)
    assert "Different Film" in encoded and evidence["file_count"] == 201
    assert "/fixture/private" not in encoded and ".mkv" not in encoded
    assert "names" not in evidence and len(encoded) < 4000
    assert evidence["membership_review_required"]


def test_plain_path_difference_is_not_proof_of_wrong_identity():
    assert G.proven_misplacement("/fixture/library/movie/Legacy name/video.mkv", "/fixture/library/movie/Film/video.mkv", {"media_id": "7", "media_source": "themoviedb"}, []) is None
    assert G.proven_misplacement("/fixture/library/movie/Other {tmdb-8}/video.mkv", "/fixture/library/movie/Film/video.mkv", {"media_id": "7", "media_source": "themoviedb"}, []) == "identity_error"


def test_rule_search_can_offer_candidates_without_ai(tmp_path):
    service, adapter, source, _ = tree_service(tmp_path)
    adapter.recognize = lambda _: {}
    answer = {"title": "Film", "media_type": "movie", "media_id": "7", "media_source": "themoviedb"}
    queries = []
    adapter.search = lambda q: queries.append(q) or [answer]
    service._run(service.ledger.begin_job("full"), "full", None)
    detail = service.detail(service.ledger.one("SELECT id FROM objects")["id"])
    assert detail["candidates"] == [answer] and queries and adapter.ai_calls == 0


def test_database_failure_is_not_empty_result_or_ai_trigger(tmp_path):
    service, adapter, _, _ = tree_service(tmp_path)
    service.ai_enabled = True
    adapter.recognize = lambda _: {}
    def unavailable(_):
        raise ConnectionError("private upstream address must not be stored")
    adapter.search = unavailable
    service._run(service.ledger.begin_job("full"), "full", None)
    object_id = service.ledger.one("SELECT id FROM objects")["id"]
    detail = service.detail(object_id)
    assert detail["provenance"] == "search_error" and adapter.ai_calls == 0
    assert detail["identity_diagnostics"]["attempts"][-1] == {"stage": "database", "status": "error", "error_type": "ConnectionError"}
    assert "private upstream" not in json.dumps(detail["identity_diagnostics"])
    saved = service.ledger.one("SELECT * FROM identities WHERE object_id=?", (object_id,))
    obj = json.loads(service.ledger.one("SELECT source_json FROM objects WHERE id=?", (object_id,))["source_json"])
    assert not service._identity_cache_usable(saved, obj)


def test_confirmation_rejects_file_change_during_digest(tmp_path):
    service, _, _, _ = tree_service(tmp_path)
    service._run(service.ledger.begin_job("full"), "full", None)
    object_id = service.ledger.one("SELECT id FROM objects")["id"]
    key = G.identity_key(service.detail(object_id)["candidates"][0])
    original, calls = service._evidence, []
    def race(obj):
        calls.append(1)
        if len(calls) == 2:
            service.ledger.execute("UPDATE objects SET fingerprint='changed' WHERE id=?", (object_id,))
        return original(obj)
    service._evidence = race
    service.start = lambda *args: {}
    with pytest.raises(ValueError, match="已变化"):
        service.confirm_identity(object_id, key)
    assert service.ledger.one("SELECT state FROM identities WHERE object_id=?", (object_id,))["state"] != "confirmed"


def test_ai_budget_defers_without_negative_caching(tmp_path, monkeypatch):
    adapter = LocalFixtureAdapter()
    adapter.recognize = lambda _: {}
    adapter.search = lambda _: []
    service = G.GovernorService(tmp_path, adapter, ai_enabled=True)
    objects = [{"id": str(i), "label": f"Film{i}", "fingerprint": str(i), "root": {"path": f"/fixture/Film{i}"}, "entries": [{"path": f"/fixture/Film{i}.mkv", "type": "file"}], "complete": True} for i in range(9)]
    service._discover = lambda _: G.Inventory(objects, [], [], [])
    monkeypatch.setattr(G, "MAX_AI_BATCHES_PER_JOB", 1)
    service._run(service.ledger.begin_job("full"), "full", None)
    assert adapter.ai_calls == 1
    deferred = service.ledger.query("SELECT * FROM identities WHERE provenance='ai_budget_deferred'")
    assert len(deferred) == 5
    assert all(not service._identity_cache_usable(row, objects[int(row["object_id"])]) for row in deferred)


def test_database_error_after_ai_is_visible(tmp_path):
    service, adapter, _, _ = tree_service(tmp_path)
    service.ai_enabled = True
    adapter.recognize = lambda _: {}
    adapter.ai_queries_batch = lambda items: {key: ["AI query"] for key, _ in items}
    def search(query):
        if query == "AI query":
            raise TimeoutError("upstream timed out")
        return []
    adapter.search = search
    service._run(service.ledger.begin_job("full"), "full", None)
    detail = service.detail(service.ledger.one("SELECT id FROM objects")["id"])
    assert detail["provenance"] == "search_error"
    assert detail["identity_diagnostics"]["attempts"][-1]["error_type"] == "TimeoutError"


@pytest.mark.parametrize("content", ["not JSON", '{}', '{"one":{"queries":"wrong"}}'])
def test_invalid_ai_response_is_not_cached_as_empty_candidates(monkeypatch, content):
    helper = types.SimpleNamespace(get_llm=lambda **_: types.SimpleNamespace(invoke=lambda _: types.SimpleNamespace(content=content)), extract_text_content=lambda value: value)
    monkeypatch.setitem(sys.modules, "app.agent.llm.helper", types.SimpleNamespace(LLMHelper=helper))
    adapter = G.MoviePilotAdapter()
    adapter.last_ai_usage = {"total_tokens": 999}
    with pytest.raises(ValueError):
        adapter.ai_queries_batch([("one", {})])
    assert adapter.last_ai_usage is None


def test_ai_usage_is_provider_reported_and_absence_is_unknown(monkeypatch):
    response = types.SimpleNamespace(content='{"one":{"queries":[]}}', usage_metadata={"input_tokens": 12, "output_tokens": 3, "total_tokens": 15})
    helper = types.SimpleNamespace(get_llm=lambda **_: types.SimpleNamespace(invoke=lambda _: response), extract_text_content=lambda value: value)
    monkeypatch.setitem(sys.modules, "app.agent.llm.helper", types.SimpleNamespace(LLMHelper=helper))
    adapter = G.MoviePilotAdapter()
    assert adapter.ai_queries_batch([("one", {})]) == {"one": []}
    assert adapter.last_ai_usage == {"input_tokens": 12, "output_tokens": 3, "total_tokens": 15}
    response.usage_metadata = None
    adapter.ai_queries_batch([("one", {})])
    assert adapter.last_ai_usage is None


def test_partial_library_does_not_prove_missing_result(tmp_path):
    adapter, obj, inv, _, _, _ = local_fixture(tmp_path)
    inv.library = {"id": "partial", "complete": False, "file_count": 0, "fingerprint": "partial"}
    service = G.GovernorService(tmp_path / "state", adapter)
    identity = adapter.recognize("")
    findings = service._findings(obj, [], "confirmed", identity, adapter.preview_value, inv)
    assert not any(f["kind"] == "native_failure" for f in findings)
    assert any(f["kind"] == "relation_confirmation" for f in findings)


def test_library_pages_resume_and_reach_every_extra_link(tmp_path, monkeypatch):
    service, adapter, source, wrong = tree_service(tmp_path)
    for index in range(6):
        wrong.with_name(f"opaque-{index}.mkv").hardlink_to(source)
    monkeypatch.setattr(G, "MAX_CANDIDATE_PAGE", 2)
    monkeypatch.setattr(G, "MAX_RELATION_PAIRS", 2)
    seen, pending = set(), []
    for _ in range(4):
        job = service.ledger.begin_job("incremental")
        inv = service._discover(job)
        obj = inv.objects[0]
        old = service.ledger.one("SELECT payload_json FROM observations WHERE object_id=? AND kind='relations'", (obj["id"],))
        previous = json.loads(old["payload_json"]) if old else {}
        receipt = service._observe_relations(obj, [], {}, inv, job, previous)
        seen.update(p["target"]["path"] for p in receipt["pairs"] if p["status"] == "verified")
        pending.append(receipt["coverage"]["discovery_pending"])
        service.ledger.save_observation(obj["id"], "relations", False, obj["fingerprint"], receipt)
    assert len(seen) == 7 and pending == [5, 3, 1, 0]


def test_unknown_source_size_does_not_exclude_real_link(tmp_path):
    service, adapter, source, wrong = tree_service(tmp_path)
    original = adapter.get_item
    def unknown_size(storage, path):
        value = original(storage, path)
        if value and G.normal_path(path) == G.normal_path(source):
            value.pop("size", None)
        return value
    adapter.get_item = unknown_size
    service._run(service.ledger.begin_job("full"), "full", None)
    detail = service.detail(service.ledger.one("SELECT id FROM objects")["id"])
    assert any(p["status"] == "verified" for p in detail["relations"]["pairs"])


def test_out_of_root_file_is_not_indexed_or_read(tmp_path):
    service, adapter, _, _ = tree_service(tmp_path)
    original = adapter.list_dir
    def foreign(item):
        return [*original(item), {"path": "/outside/sensitive.mkv", "type": "file", "storage": "local"}]
    adapter.list_dir = foreign
    inv = service._discover(service.ledger.begin_job("full"))
    assert not inv.library["complete"]
    assert not service.ledger.query("SELECT * FROM library_files WHERE path='/outside/sensitive.mkv'")
    assert not inv.objects[0]["complete"]


def test_cancelled_library_scan_keeps_an_incomplete_receipt(tmp_path):
    service, adapter, _, _ = tree_service(tmp_path)
    original = adapter.list_dir
    def cancel(item):
        if any(G.under(item["path"], root["path"]) for root in adapter.roots["library"]):
            service._cancel.set()
        return original(item)
    adapter.list_dir = cancel
    service._run(service.ledger.begin_job("full"), "full", None)
    assert service.status()["job"]["status"] == "cancelled"
    receipt = service.ledger.one("SELECT * FROM observations WHERE object_id='__library__' AND kind='inventory'")
    assert receipt["complete"] == 0


def test_manual_membership_preserves_unselected_files_and_survives_restart(tmp_path):
    service, adapter, source, _ = tree_service(tmp_path)
    pack = source.parent / "Pack"
    pack.mkdir()
    for name in ("First.Film.2001.mkv", "Second.Film.2002.mkv"):
        (pack / name).write_bytes(b"different")
    service._run(service.ledger.begin_job("full"), "full", None)
    row = service.ledger.one("SELECT id FROM objects WHERE label='Pack'")
    detail = service.detail(row["id"])
    assert detail["digest"]["membership_review_required"]
    key = G.identity_key(detail["candidates"][0])
    with pytest.raises(ValueError, match="先选择"):
        service.confirm_identity(row["id"], key)
    service.start = lambda *args: {"accepted": True}
    service.confirm_identity(row["id"], key, [detail["files"][0]["ref"]])
    restarted = G.GovernorService(tmp_path / "state", adapter)
    inv = restarted._discover(restarted.ledger.begin_job("full"))
    units = [obj for obj in inv.objects if G.normal_path(obj["root"]["path"]) == G.normal_path(pack)]
    assert len(units) == 2
    assert sum(len(obj["entries"]) for obj in units) == 2
    assert sum(bool(obj.get("user_identity")) for obj in units) == 1
    assert {G.normal_path(row["path"]) for obj in units for row in obj["entries"]} == {G.normal_path(pack / name) for name in ("First.Film.2001.mkv", "Second.Film.2002.mkv")}


def test_manual_search_retains_confirmation_and_cannot_overwrite_new_choice(tmp_path):
    service, adapter, _, _ = tree_service(tmp_path)
    service._run(service.ledger.begin_job("full"), "full", None)
    obj = service.ledger.one("SELECT id FROM objects")
    first = service.detail(obj["id"])["candidates"][0]
    service.start = lambda *args: {}
    service.confirm_identity(obj["id"], G.identity_key(first))
    answer = {**first, "media_id": "42"}
    adapter.search = lambda _: [answer]
    detail = service.search_candidates(obj["id"], "Another film")
    assert detail["identity"] == first and detail["candidates"][0] == answer
    def race(_):
        service.ledger.save_identity(obj["id"], "confirmed", detail["fingerprint"], answer, [answer], "user_confirmed")
        return [first]
    adapter.search = race
    with pytest.raises(ValueError, match="已变化"):
        service.search_candidates(obj["id"], "Race")
    assert service.detail(obj["id"])["identity"] == answer


def prepared_repair(tmp_path, *, count=1, cleanup=False):
    adapter = FakeAdapter()
    service = G.GovernorService(tmp_path, adapter, read_only=False)
    sources = [{"path": f"/fixture/download/Film/F{i}.mkv", "type": "file", "storage": "local", "size": 10} for i in range(count)]
    obj = {"id": "repair", "label": "Film", "entries": sources, "root": {"path": "/fixture/download/Film", "type": "dir"}, "complete": True, "fingerprint": G.fingerprint(sources)}
    identity = {"title": "Film", "media_id": "7", "media_source": "themoviedb", "media_type": "movie"}
    adapter.present = {G.normal_path(row["path"]): row for row in sources}
    adapter.preview_value = {"summary": {"total": count, "failed": 0}, "items": [{"source": row["path"], "target": f"/fixture/library/movie/F{i}.mkv", "target_storage": "local", "success": True} for i, row in enumerate(sources)]}
    histories = []
    if cleanup:
        current = {"path": "/fixture/library/movie/old.mkv", "storage": "local", "type": "file"}
        adapter.present[current["path"]] = current
        histories = [{"id": 1, "src": sources[0]["path"], "dest": current["path"], "dest_fileitem": current, "status": True}]
    service.ledger.upsert_object(obj)
    service.ledger.save_identity(obj["id"], "confirmed", obj["fingerprint"], identity, [identity], "user_confirmed")
    service.ledger.save_observation(obj["id"], "source", True, obj["fingerprint"], {"object": obj, "histories": histories})
    service.ledger.save_observation("__library__", "configuration", True, "cfg", {"roots": [{"path": "/fixture/library/movie", "storage": "local"}]})
    plan = service.repair_preview(obj["id"])
    service.start = lambda *args: {}
    return service, adapter, plan


def test_read_only_gate_blocks_even_a_valid_repair_permission(tmp_path):
    service, adapter, plan = prepared_repair(tmp_path)
    service.read_only = True
    with pytest.raises(ValueError, match="只读"):
        service.repair_execute("repair", plan["token"])
    assert not adapter.rebuild_calls
    assert service.status()["read_only"] is True
    assert G.GovernorService(tmp_path / "default", adapter).read_only is True


def test_plugin_read_only_api_rejects_before_dispatch(tmp_path):
    import asyncio
    module = load_plugin_with_host_boundary()
    plugin = module.MediaGovernor()
    plugin.get_data_path = lambda: tmp_path
    plugin.init_plugin({"enabled": True})
    calls = []
    plugin._service.repair_execute = lambda *args: calls.append(args)
    async def body():
        return {"action": "execute", "token": "fixture-token"}
    response = asyncio.run(plugin.api_repair("unit", types.SimpleNamespace(json=body)))
    assert not response.success and "只读" in response.message and not calls
    assert plugin.get_form()[1]["read_only"] is True
    plugin.stop_service()


def test_hot_reload_restores_safe_defaults_even_when_old_worker_has_not_exited(tmp_path):
    module = load_plugin_with_host_boundary()
    plugin = module.MediaGovernor()
    plugin.get_data_path = lambda: tmp_path
    plugin.init_plugin({"enabled": False, "read_only": False, "ai_enabled": True})
    old = plugin._service
    old.stop = lambda: False
    plugin.init_plugin({"enabled": False})
    assert plugin._service is old and old.read_only is True and old.ai_enabled is False


@pytest.mark.parametrize("change", ["failed_summary", "storage_changed"])
def test_execute_rejects_failed_or_storage_changed_preview(tmp_path, change):
    service, adapter, plan = prepared_repair(tmp_path)
    if change == "failed_summary":
        adapter.preview_value["summary"]["failed"] = 1
    else:
        adapter.preview_value["items"][0]["target_storage"] = "foreign"
    with pytest.raises(ValueError):
        service.repair_execute("repair", plan["token"])
    assert not adapter.rebuild_calls


def test_cleanup_requires_a_separate_explicit_permission(tmp_path):
    service, adapter, plan = prepared_repair(tmp_path, cleanup=True)
    with pytest.raises(ValueError, match="单独确认"):
        service.repair_execute("repair", plan["token"])
    assert not adapter.rebuild_calls
    assert service.repair_execute("repair", plan["token"], cleanup_approved=True)["accepted"]


def test_partial_native_failure_consumes_permission_and_records_completed_files(tmp_path):
    service, adapter, plan = prepared_repair(tmp_path, count=2)
    original = adapter.rebuild
    def fail_second(entry, identity):
        if adapter.rebuild_calls:
            raise RuntimeError("second failed")
        original(entry, identity)
    adapter.rebuild = fail_second
    with pytest.raises(RuntimeError, match="部分执行"):
        service.repair_execute("repair", plan["token"])
    result = service.ledger.one("SELECT payload_json FROM observations WHERE object_id='repair' AND kind='repair_result'")
    receipt = json.loads(result["payload_json"])
    assert receipt["status"] == "partial_or_failed" and len(receipt["completed_sources"]) == 1
    with pytest.raises(ValueError, match="过期"):
        service.repair_execute("repair", plan["token"])


def test_concurrent_execute_cannot_use_the_same_permission_twice(tmp_path):
    service, adapter, plan = prepared_repair(tmp_path)
    entered, release, errors = threading.Event(), threading.Event(), []
    original = adapter.rebuild
    def block(entry, identity):
        entered.set()
        release.wait(5)
        original(entry, identity)
    adapter.rebuild = block
    def execute():
        try:
            service.repair_execute("repair", plan["token"])
        except Exception as error:
            errors.append(error)
    worker = threading.Thread(target=execute)
    worker.start()
    try:
        assert entered.wait(2)
        with pytest.raises(ValueError, match="正在执行"):
            service.repair_execute("repair", plan["token"])
    finally:
        release.set()
        worker.join(3)
    assert not errors and len(adapter.rebuild_calls) == 1


def test_false_native_preview_state_is_not_promoted_to_success():
    adapter = G.MoviePilotAdapter()
    adapter.media_info = lambda _: types.SimpleNamespace(type="movie")
    adapter._loaded = {
        "FileItem": lambda **kw: types.SimpleNamespace(**kw), "MediaSource": lambda value: value,
        "dirs": types.SimpleNamespace(get_dir=lambda **kw: types.SimpleNamespace(library_path="/fixture/library", library_storage="local", transfer_type="link", library_type_folder=False, library_category_folder=False)),
        "transfer": types.SimpleNamespace(manual_transfer=lambda **kw: (False, {"summary": {"total": 1, "failed": 0}, "items": [{"source": "a", "target": "b"}]})),
    }
    with pytest.raises(RuntimeError, match="失败"):
        adapter.preview({"path": "/fixture/download/file.mkv"}, {"media_source": "themoviedb", "media_id": "7"})
