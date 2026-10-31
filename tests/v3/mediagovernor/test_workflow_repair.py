"""工作流修复回归；真实临时文件/公开 SDK，不访问 NAS、模型或数据库网络。"""
import asyncio
import json
import threading
import time
from pathlib import Path
from types import SimpleNamespace

import pytest

from tests.v3.mediagovernor.test_v5 import G, FakeAdapter, local_fixture, run_local_fixture, load_plugin_with_host_boundary
from tests.v3.mediagovernor.test_physical_first import tree_service, prepared_repair


def test_sdk_parser_is_real_and_bare_episode_is_not_a_title():
    from app.sdk.media import MetaInfo
    MetaInfo(title="Example.Show.S01E01.1080p.mkv")
    names = ["Example.Show.S01E01.1080p.mkv", "Example.Show.02.Like.A.Boy.2160p.mkv", "Example.Show.10.My.Moon.My.Man.2160p.mkv"]
    parsed = G.container_names([{"path": "/fixture/" + name, "type": "file"} for name in names])
    assert all(row.get("parsed") for row in parsed), parsed
    assert len({row["hint"] for row in parsed}) == 1, parsed
    assert [row["episode"] for row in parsed] == [1, 2, 10]


def test_ten_episode_digest_has_one_family_and_ten_sources():
    names = ["Example.Show.S01E01.2160p.mkv", *[f"Example.Show.{i:02}.Chapter.Name.2160p.mkv" for i in range(2, 11)]]
    digest = G.evidence_digest({"root": {"name": "Example.Show.Season.1"}, "entries": [{"path": "/fixture/" + name} for name in names]})
    assert digest["file_count"] == 10 and digest["title_family_count"] == 1
    assert not digest["membership_review_required"]
    assert digest["episode_shapes"] == [{"season": 1, "count": 10, "min": 1, "max": 10}]
    assert len(json.dumps(digest)) < 1600


def test_same_title_different_movie_years_still_require_membership():
    digest = G.evidence_digest({"entries": [{"path": "/fixture/Film.1990.mkv"}, {"path": "/fixture/Film.2020.mkv"}]})
    assert digest["membership_review_required"] and digest["title_family_count"] == 2


def test_sdk_failure_is_not_proof_of_mixed_container(monkeypatch):
    import app.sdk.media
    def broken(**_kwargs):
        raise RuntimeError("unavailable")
    monkeypatch.setattr(app.sdk.media, "MetaInfo", broken)
    digest = G.evidence_digest({"entries": [{"path": "/fixture/Show.02.Chapter.mkv"}, {"path": "/fixture/Show.03.Other.mkv"}]})
    assert digest["parse_unresolved"] == 2
    assert not digest["membership_review_required"]


def test_genres_and_mapping_survive_normalization():
    identity = G.identity_from_media({"title": "Animation", "type": "tv", "media_source": "themoviedb", "id": 7,
                                      "genres": [{"id": 16, "name": "Animation"}], "season": 0,
                                      "episode_group": "group", "epformat": {"offset": "-1"}})
    assert G.expected_category(identity) == "anime"
    assert identity["media_type"] == "tv" and identity["genres"][0]["id"] == 16
    assert G.public_identity(identity)["season"] == 0
    options = G.MoviePilotAdapter.mapping_options(identity)
    assert options["season"] == 0 and options["episode_group"] == "group" and options["epformat"].offset == "-1"


def test_none_directory_result_is_not_an_empty_directory():
    adapter = G.MoviePilotAdapter()
    adapter._loaded = {"FileItem": lambda **values: values, "storage": SimpleNamespace(list_files=lambda _item: None)}
    with pytest.raises(RuntimeError, match="不能当作空目录"):
        adapter.list_dir({"path": "/fixture/download", "type": "dir"})


def test_current_wrong_link_and_missing_expected_are_independent(tmp_path):
    adapter, obj, inv, source, target, wrong = local_fixture(tmp_path)
    marked_wrong = wrong.with_name("Other {tmdb-8}.mkv")
    marked_wrong.hardlink_to(source)
    inv.histories = [{"src": str(source), "dest": str(marked_wrong), "status": True}]
    service = G.GovernorService(tmp_path / "state", adapter)
    identity = {"title": "Film", "media_type": "movie", "media_source": "themoviedb", "media_id": "7"}
    findings = service._findings(obj, inv.histories, "confirmed", identity, adapter.preview_value, inv)
    assert {row["kind"] for row in findings} >= {"false_success", "native_failure"}


def test_current_wrong_link_survives_expected_unproven(tmp_path):
    adapter, obj, inv, source, target, wrong = local_fixture(tmp_path)
    marked_wrong = wrong.with_name("Other {tmdb-8}.mkv")
    marked_wrong.hardlink_to(source)
    target.write_bytes(b"another file")
    histories = [{"src": str(source), "dest": str(marked_wrong)}]
    service = G.GovernorService(tmp_path / "state", adapter)
    identity = {"media_type": "movie", "media_source": "themoviedb", "media_id": "7"}
    kinds = {row["kind"] for row in service._findings(obj, histories, "confirmed", identity, adapter.preview_value, inv)}
    assert {"false_success", "relation_confirmation"} <= kinds
    assert "native_failure" not in kinds


def test_attachment_not_planned_by_host_is_accounted_not_failed(tmp_path):
    adapter, obj, _, source, _, _ = local_fixture(tmp_path)
    art = source.with_suffix(".jpg")
    art.write_bytes(b"fixture")
    obj["entries"].append(adapter.get_item("local", str(art)))
    service = G.GovernorService(tmp_path / "state", adapter)
    preview = service._official_preview(obj, {"media_id": "7"})
    assert preview["summary"]["failed"] == 0 and len(preview["unplanned_files"]) == 1
    assert preview["unplanned_files"][0]["ref"]


def test_duplicate_expected_targets_are_blocked(tmp_path):
    adapter = FakeAdapter()
    sources = [{"path": f"/fixture/F{i}.mkv"} for i in range(2)]
    adapter.preview_value = {"summary": {"total": 2}, "items": [{"source": row["path"], "target": "/fixture/library/same.mkv"} for row in sources]}
    service = G.GovernorService(tmp_path, adapter)
    result = service._official_preview({"entries": sources, "root": {"path": "/fixture"}}, {})
    assert result["summary"]["failed"] and "同一个预览目标" in result["message"]


def test_video_coverage_counts_unique_sources_not_pairs(tmp_path):
    adapter, obj, inv, source, target, wrong = local_fixture(tmp_path)
    target.hardlink_to(source)
    wrong.hardlink_to(source)
    second = source.with_name("Other.mkv")
    second.write_bytes(b"fixture2")
    obj["entries"].append(adapter.get_item("local", str(second)))
    service = G.GovernorService(tmp_path / "state", adapter)
    receipt = service._observe_relations(obj, [{"src": str(source), "dest": str(wrong)}], adapter.preview_value, inv, None, {})
    assert receipt["coverage"]["source_video_count"] == 2
    assert receipt["coverage"]["linked_source_count"] == 1
    assert receipt["coverage"]["unlinked_or_unproven_sources"] == 1


def test_one_job_finishes_all_relation_pages_automatically(tmp_path, monkeypatch):
    service, adapter, source, wrong = tree_service(tmp_path)
    for i in range(8):
        wrong.with_name(f"alias-{i}.mkv").hardlink_to(source)
    monkeypatch.setattr(G, "MAX_CANDIDATE_PAGE", 2)
    monkeypatch.setattr(G, "MAX_RELATION_PAIRS", 2)
    service._run(service.ledger.begin_job("full"), "full", None)
    object_id = service.ledger.one("SELECT id FROM objects")["id"]
    receipt = service.detail(object_id)["relations"]
    assert receipt["coverage"]["pending_pairs"] == 0
    assert len([row for row in receipt["pairs"] if row["status"] == "verified"]) == 9


def test_local_stat_index_reduces_same_size_candidates_without_losing_link(tmp_path):
    service, adapter, source, wrong = tree_service(tmp_path)
    adapter.physical_key = G.MoviePilotAdapter.physical_key
    for i in range(25):
        wrong.with_name(f"copy-{i}.mkv").write_bytes(source.read_bytes())
    service._run(service.ledger.begin_job("full"), "full", None)
    obj = service.ledger.one("SELECT id FROM objects")
    receipt = service.detail(obj["id"])["relations"]
    assert receipt["coverage"]["library_file_count"] == 26
    assert len(receipt["pairs"]) == 1 and receipt["pairs"][0]["status"] == "verified"


def test_stat_accelerator_failure_falls_back_without_losing_actual_link(tmp_path):
    service, adapter, _, _ = tree_service(tmp_path)
    calls = []
    def unavailable(item):
        calls.append(item)
        raise OSError("stat unavailable")
    adapter.physical_key = unavailable
    service._run(service.ledger.begin_job("full"), "full", None)
    assert service.status()["job"]["status"] == "completed"
    detail = service.detail(service.ledger.one("SELECT id FROM objects")["id"])
    assert any(pair["status"] == "verified" for pair in detail["relations"]["pairs"])
    assert len(calls) == 1


def test_download_scope_changed_after_preview_blocks_write_and_cleanup(tmp_path):
    service, adapter, plan = prepared_repair(tmp_path, cleanup=True)
    adapter.directories = lambda kind: [{"path": "/fixture/library", "storage": "local"}]
    with pytest.raises(ValueError, match="下载保护"):
        service.repair_execute("repair", plan["token"], cleanup_approved=True)
    assert not adapter.rebuild_calls
    assert plan["entries"][0]["current"] in adapter.present


def test_single_confirmation_does_not_enumerate_other_sources_or_library(tmp_path):
    service, adapter, source, _ = tree_service(tmp_path)
    other = source.with_name("Other.mkv")
    other.write_bytes(b"another")
    service._run(service.ledger.begin_job("full"), "full", None)
    row = service.ledger.one("SELECT id FROM objects WHERE label='Film.mkv'")
    detail = service.detail(row["id"])
    selected = G.identity_key(detail["candidates"][0])
    listed, original = [], adapter.list_dir
    adapter.list_dir = lambda item: (listed.append(item["path"]) or original(item))
    service.confirm_identity(row["id"], selected, mapping={"season": 0, "episode_group": "g", "epformat": {"offset": "1"}})
    worker = service._thread
    if worker:
        worker.join(4)
    assert service.status()["job"]["status"] == "completed"
    assert not listed  # 单文件容器无需目录枚举，更不全库扫描
    assert service.ledger.one("SELECT COUNT(*) n FROM objects WHERE status!='REMOVED'")["n"] == 2
    assert service.detail(row["id"])["identity"]["season"] == 0
    assert service.detail(row["id"])["identity"]["epformat"] == {"offset": "1"}


def test_confirmation_during_running_job_is_persistently_queued(tmp_path):
    service = G.GovernorService(tmp_path, FakeAdapter())
    service._thread = SimpleNamespace(is_alive=lambda: True)
    service.start("incremental", ["one"])
    assert service.status()["queued_rechecks"] == 1
    restarted = G.GovernorService(tmp_path, FakeAdapter())
    assert restarted.status()["queued_rechecks"] == 1


def test_ready_object_is_committed_before_next_recognition_returns(tmp_path):
    service, adapter, source, _ = tree_service(tmp_path)
    source.with_name("Other.mkv").write_bytes(b"other")
    entered, release = threading.Event(), threading.Event()
    original = adapter.recognize
    def recognize(path):
        if Path(path).name == "Other.mkv":
            entered.set()
            release.wait(4)
        return original(path)
    adapter.recognize = recognize
    service.start("full")
    worker = service._thread
    try:
        assert entered.wait(3)
        assert service.ledger.one("SELECT COUNT(*) n FROM observations WHERE kind='checked_job'")["n"] == 1
        assert service.status()["pending_objects"] == 1
    finally:
        release.set()
        if worker:
            worker.join(5)


def test_manual_database_diagnostic_records_empty_and_error_separately(tmp_path):
    service, adapter, _, _ = tree_service(tmp_path)
    service._run(service.ledger.begin_job("full"), "full", None)
    object_id = service.ledger.one("SELECT id FROM objects")["id"]
    service.search_candidates(object_id, "No match")
    last = service.detail(object_id)["identity_diagnostics"]["attempts"][-1]
    assert last["stage"] == "manual_database" and last["status"] == "empty" and last["at"]
    def broken(_query):
        raise ConnectionError("private provider message")
    adapter.search = broken
    with pytest.raises(ConnectionError):
        service.search_candidates(object_id, "No match")
    last = service.detail(object_id)["identity_diagnostics"]["attempts"][-1]
    assert last["status"] == "error" and last["error_type"] == "ConnectionError"
    assert "private" not in json.dumps(last)


def test_repair_plan_uses_physical_link_without_success_history(tmp_path):
    service, adapter, plan = prepared_repair(tmp_path)
    obj = service.detail("repair")["source"]["object"]
    old = {"path": "/fixture/library/movie/old.mkv", "storage": "local", "type": "file"}
    adapter.present[old["path"]] = old
    service.ledger.save_observation("repair", "relations", True, obj["fingerprint"], {"pairs": [{"source": obj["entries"][0], "target": old, "status": "verified"}]})
    plan = service.repair_preview("repair")
    assert plan["entries"][0]["old_items"] == [old]
    assert plan["entries"][0]["cleanup_attributable"]
    assert service.repair_execute("repair", plan["token"], cleanup_approved=True)["accepted"]
    assert old["path"] not in adapter.present


def test_failed_new_link_never_cleans_old_link(tmp_path):
    service, adapter, plan = prepared_repair(tmp_path, cleanup=True)
    old = plan["entries"][0]["current"]
    called = []
    def fail(_entry, _identity):
        raise RuntimeError("provider failed")
    adapter.rebuild = fail
    adapter.cleanup_entry = lambda item: called.append(item)
    with pytest.raises(RuntimeError, match="部分执行"):
        service.repair_execute("repair", plan["token"], cleanup_approved=True)
    assert old in adapter.present and not called


def test_normal_entries_are_kept_not_rebuilt(tmp_path):
    service, adapter, old_plan = prepared_repair(tmp_path)
    expected = old_plan["entries"][0]["expected"]
    adapter.present[expected] = {"path": expected, "type": "file"}
    plan = service.repair_preview("repair")
    assert plan["entries"][0]["action"] == "keep"
    service.repair_execute("repair", plan["token"])
    assert not adapter.rebuild_calls


def test_preview_background_returns_without_waiting_and_cannot_fan_out(tmp_path):
    service, adapter, _ = prepared_repair(tmp_path)
    entered, release = threading.Event(), threading.Event()
    original = adapter.preview
    def slow(*args):
        entered.set()
        release.wait(3)
        return original(*args)
    adapter.preview = slow
    try:
        before = time.monotonic()
        first = service.request_repair_preview("repair")
        assert time.monotonic() - before < 0.5 and first["status"] == "running"
        assert entered.wait(2)
        assert service.request_repair_preview("repair")["request_id"] == first["request_id"]
    finally:
        release.set()
        for thread in service._preview_threads.values():
            thread.join(4)
    assert service.repair_preview_status("repair")["status"] == "completed"


def test_official_single_file_delete_never_uses_parent_cleanup():
    called = []
    adapter = G.MoviePilotAdapter()
    adapter._loaded = {"FileItem": lambda **values: values, "storage": SimpleNamespace(delete_file=lambda item: called.append(item) or True)}
    item = {"path": "/fixture/library/old.mkv", "storage": "local", "type": "file"}
    adapter.cleanup_entry(item)
    assert called == [item]
    with pytest.raises(ValueError):
        adapter.cleanup_entry({**item, "type": "dir"})


def test_api_forwards_mapping_including_season_zero(tmp_path):
    module = load_plugin_with_host_boundary()
    plugin = module.MediaGovernor()
    plugin.get_data_path = lambda: tmp_path
    plugin.init_plugin({"enabled": True})
    calls = []
    plugin._service.confirm_identity = lambda *args: calls.append(args) or {}
    async def body():
        return {"object_id": "one", "candidate_key": "themoviedb:7:tv", "mapping": {"season": 0, "episode_group": "group", "epformat": {"offset": "2"}}}
    response = asyncio.run(plugin.api_identity_confirm(SimpleNamespace(json=body)))
    assert response.success and calls[0][3]["season"] == 0 and calls[0][3]["epformat"] == {"offset": "2"}
    plugin.stop_service()


def test_adapter_passes_same_mapping_to_preview_and_execution():
    calls = []
    directory = SimpleNamespace(library_path="/fixture/library", library_storage="local", transfer_type="link", library_type_folder=True, library_category_folder=False)
    def transfer(**kwargs):
        calls.append(kwargs)
        return True, {"summary": {"total": 1}, "items": [{"source": "/fixture/source.mkv", "target": "/fixture/library/target.mkv"}]}
    def single_transfer(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(success=True, overwrite_skipped=False, target_item={"path": "/fixture/library/target.mkv", "storage": "local"})
    adapter = G.MoviePilotAdapter()
    adapter._loaded = {"FileItem": lambda **values: values, "dirs": SimpleNamespace(get_dir=lambda **_values: directory),
                       "MediaSource": lambda value: value, "transfer": SimpleNamespace(manual_transfer=transfer, transfer=single_transfer)}
    adapter.media_info = lambda _identity: SimpleNamespace(type="tv")
    source = {"path": "/fixture/source.mkv", "storage": "local", "type": "file"}
    identity = {"media_type": "tv", "media_id": "7", "media_source": "themoviedb", "season": 0, "episode_group": "group", "epformat": {"detail": "1-3", "part": "1", "offset": "2"}}
    adapter.preview(source, identity)
    adapter.rebuild({"source": source, "expected": "/fixture/library/target.mkv", "target_storage": "local", "official_item": {"season": 0, "episode": 3, "episode_end": 5, "part": "1"}, "current_item": {"path": "/fixture/old.mkv", "type": "file"}}, identity)
    assert len(calls) == 3
    assert calls[0]["season"] == 0 and calls[0]["episode_group"] == "group" and calls[0]["epformat"].detail == "1-3"
    assert calls[1]["preview"] is True and calls[2]["preview"] is False
    assert calls[2]["meta"].begin_season == 0 and calls[2]["meta"].begin_episode == 3 and calls[2]["meta"].end_episode == 5
    assert "cleanup_dest_fileitem" not in calls[2] and "force" not in calls[2]


def test_real_sdk_media_identity_and_group_roundtrip():
    from app.sdk.media import MediaInfo
    from app.schemas.types import MediaSource, MediaType
    media = MediaInfo(media_source=MediaSource.TMDB, media_id="7", type=MediaType.TV,
                      title="Example Show", genre_ids=[16])
    calls = []
    adapter = G.MoviePilotAdapter()
    adapter._loaded = {"MediaSource": MediaSource, "MediaType": MediaType,
                       "media": SimpleNamespace(recognize_media=lambda **options: calls.append(options) or media)}
    identity = {"media_source": "themoviedb", "media_id": "7", "media_type": "tv", "episode_group": "group"}
    assert adapter.media_info(identity) is media
    assert G.identity_key(G.identity_from_media(media)) == G.identity_key(identity)
    assert G.expected_category(G.identity_from_media(media)) == "anime"
    assert calls[0]["episode_group"] == "group"
    with pytest.raises(ValueError, match="ID"):
        adapter.media_info({**identity, "media_id": "8"})


def test_failed_scoped_job_keeps_recheck_queue(tmp_path):
    service = G.GovernorService(tmp_path, FakeAdapter())
    service.start("incremental", ["missing"])
    worker = service._thread
    if worker:
        worker.join(3)
    assert service.status()["job"]["status"] == "failed"
    assert service.status()["queued_rechecks"] == 1


def test_partial_nested_source_read_is_visible_and_cannot_retire_old_objects(tmp_path):
    service, adapter, source, _ = tree_service(tmp_path)
    pack = source.parent / "Pack"
    pack.mkdir()
    (pack / "Show.S01E01.mkv").write_bytes(b"fixture")
    service._run(service.ledger.begin_job("full"), "full", None)
    old_id = service.ledger.one("SELECT id FROM objects WHERE label='Pack'")["id"]
    original = adapter.list_dir
    def fail(item):
        if Path(item["path"]) == pack:
            raise PermissionError("fixture inaccessible")
        return original(item)
    adapter.list_dir = fail
    service._run(service.ledger.begin_job("full"), "full", None)
    assert service.ledger.one("SELECT status FROM objects WHERE id=?", (old_id,))["status"] != "REMOVED"
    assert service.status()["inventory_errors"] == 1
    assert any(row["kind"] == "read_error" for row in service.findings()["errors"])


def test_subtitle_only_container_is_not_ignored():
    top = {"path": "/fixture/download/Subtitles", "type": "dir"}
    subtitle = {"path": "/fixture/download/Subtitles/Film.zh.srt", "type": "file"}
    groups = G.partition_entries(top, [subtitle], [])
    assert len(groups) == 1 and groups[0]["entries"] == [subtitle]


def test_source_replacement_with_same_metadata_invalidates_repair(tmp_path):
    service, adapter, plan = prepared_repair(tmp_path)
    generation = {"source": "inode-one"}
    adapter.physical_key = lambda item: generation["source"] if item["path"].startswith("/fixture/download/") else "inode-other"
    plan = service.repair_preview("repair")
    generation["source"] = "inode-replaced"
    with pytest.raises(ValueError, match="已经变化"):
        service.repair_execute("repair", plan["token"])
    assert not adapter.rebuild_calls
