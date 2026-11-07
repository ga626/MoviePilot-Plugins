"""局部收敛合同：真实 SDK 词法 + 明示的假数据库/公开 Chain 合同。

不联网、不访问 NAS、不执行真实媒体写入；不冒充现场回归。
"""
from copy import deepcopy
from types import SimpleNamespace

import pytest

from tests.v3.mediagovernor.test_v5 import G, local_fixture
from tests.v3.mediagovernor.test_automatic_audit import audit_fixture
from tests.v3.mediagovernor.test_identity_confirmation import run_scan


def test_sdk_retains_both_language_fields_and_live_action_context():
    value = G.parsed_name("瑞克和莫蒂 Rick.And.Morty.S06E01.mkv")
    assert {"瑞克和莫蒂", "Rick And Morty"} <= set(value["hints"])
    assert G.parsed_name("海贼王 真人版 S01E06.mkv")["live_action_context"]
    assert not G.parsed_name("海贼王 S01E06.mkv")["live_action_context"]


def test_multilingual_families_can_reach_database_but_all_groups_must_match(tmp_path):
    adapter, obj, _, _, identity = audit_fixture(tmp_path, series=True)
    obj["entries"] = obj["entries"][:2]
    obj["entries"][0]["name"] = "Example.Show.S01E01.mkv"
    obj["entries"][1]["name"] = "示例剧 Example.Show.S02E02.mkv"
    obj["root"]["name"] = "Example.Show"
    answer = {**identity, "title": "示例剧", "original_title": "Example Show", "names": ["示例剧", "Example Show"]}
    adapter.database = {**adapter.database, **answer}
    adapter.search = lambda query: adapter.search_calls.append(query) or [answer]
    evidence, reason = G.source_identity_evidence(obj)
    assert not reason and len(evidence["title_groups"]) == 2
    assert G.evidence_digest(obj)["title_family_count"] == 2
    service = G.GovernorService(tmp_path / "state", adapter)
    assert service._resolve_identity(obj, [])[0] == "verified"
    assert set(adapter.search_calls) == {"Example Show", "示例剧"}
    assert len(adapter.detail_calls) == 1
    obj["entries"][1]["name"] = "Unrelated.Show.S02E02.mkv"
    assert service._resolve_identity(obj, [], force=True)[0] == "candidate"


@pytest.mark.parametrize("genres,expected", [([{"id": 16}], "candidate"), ([], "candidate"), ([{"id": 18}], "verified")])
def test_live_action_context_is_checked_against_detail_not_ignored(tmp_path, genres, expected):
    adapter, obj, _, _, identity = audit_fixture(tmp_path, series=True)
    obj["entries"] = obj["entries"][:1]
    obj["entries"][0]["name"] = "海贼王 真人版 S01E06.mkv"
    answer = {**identity, "title": "海贼王", "year": "2023"}
    adapter.search = lambda query: adapter.search_calls.append(query) or [answer]
    adapter.database = {**answer, "genres": genres}
    service = G.GovernorService(tmp_path / "state", adapter)
    assert service._resolve_identity(obj, [])[0] == expected
    assert adapter.search_calls[0] == "海贼王 真人版"
    assert adapter.ai_calls == 0


def test_missing_parse_is_not_recovered_by_random_bracket_text():
    value = G.parsed_name("[某发布组].2024.1080p.mkv")
    # 括号可能是作品也可能是发布组，本轮不把它直接当可信标题。
    assert "某发布组" not in value["hints"]


def test_narrow_bare_episode_supplement_does_not_run_without_two_anchors():
    rows = [{"path": "/fixture/Example.Show.S01E01.mkv"}, {"path": "/fixture/Example.Show.10.My.Moon.My.Man.mkv"}]
    assert not G.container_names(rows)[1].get("mapping_inferred")
    rows.insert(1, {"path": "/fixture/Example.Show.S01E02.mkv"})
    assert G.container_names(rows)[2]["mapping_inferred"]
    assert G.container_names(rows)[2]["hints"] == ["Example Show"]


def test_sample_is_excluded_from_exact_preview_and_kept_in_receipt(tmp_path):
    adapter, obj, _, _, identity = audit_fixture(tmp_path)
    sample = {"path": "/fixture/Sample/sample.mkv", "name": "sample.mkv", "type": "file"}
    obj["entries"].append(sample)
    seen = []
    original = adapter.preview_files
    def selected(source, files, chosen):
        seen.extend(files)
        return original(source, files, chosen)
    adapter.preview_files = selected
    result = G.GovernorService(tmp_path / "state", adapter)._official_preview(obj, identity)
    assert result["validation"]["status"] == "verified"
    assert len(seen) == 1 and sample not in seen
    assert len(result["unplanned_files"]) == 1


@pytest.mark.parametrize("path,expected", [
    ("/fixture/test_sample_scope/Film.mkv", False),
    ("/fixture/Sample.Collection/Film.mkv", False),
    ("/fixture/Sample/Film.mkv", True),
    ("/fixture/Film/sample.mkv", True),
    ("/fixture/Film/Film-trailer.mkv", True),
    ("/fixture/Extras/Film.mkv", True),
])
def test_sample_scope_does_not_match_arbitrary_ancestor_substrings(path, expected):
    assert G.is_sample({"path": path}) is expected


def test_empty_regular_video_selection_is_never_verified(tmp_path):
    adapter, obj, _, _, identity = audit_fixture(tmp_path)
    obj["entries"] = [{"path": "/fixture/Sample/sample.mkv", "type": "file"}]
    result = G.GovernorService(tmp_path / "state", adapter)._official_preview(obj, identity)
    assert result["validation"]["status"] == "no_supported_sources"
    assert result["validation"]["summary_success"] is False
    assert adapter.preview_calls == 0


@pytest.mark.parametrize("kind", ["extra", "missing", "duplicate"])
def test_selected_preview_never_accepts_range_expansion_or_partial_response(tmp_path, kind):
    adapter, obj, _, _, identity = audit_fixture(tmp_path)
    value = deepcopy(adapter.preview_value)
    if kind == "extra":
        value["items"].append({"source": "/fixture/other.mkv", "target": "/fixture/library/other.mkv", "success": True})
    elif kind == "missing":
        value["items"] = []
    else:
        value["items"] *= 2
    value["summary"] = {"total": len(value["items"]), "success": len(value["items"]), "failed": 0}
    adapter.preview_files = lambda *_: value
    service = G.GovernorService(tmp_path / "state", adapter)
    result = service._official_preview(obj, identity)
    assert result["validation"]["status"] == "scope_mismatch"
    assert not G.preview_cache_usable({**result, "_basis": "a"}, "a")


def test_legacy_host_uses_exact_files_and_disables_extra_sync(tmp_path):
    adapter, obj, _, _, identity = audit_fixture(tmp_path, series=True)
    obj["entries"] = obj["entries"][:2]
    adapter.supports_selected_preview = lambda: False
    seen = []
    original = adapter.preview
    def exact(source, chosen):
        seen.append(source)
        return original(source, chosen)
    adapter.preview = exact
    result = G.GovernorService(tmp_path / "state", adapter)._official_preview(obj, identity)
    assert result["validation"]["status"] == "verified"
    assert len(seen) == 2 and all(row["_governor_exact_file"] for row in seen)


def test_success_without_target_is_not_normal_or_native_failure(tmp_path):
    adapter, obj, inv, _, identity = audit_fixture(tmp_path)
    adapter.preview_value["items"][0]["target"] = None
    service = G.GovernorService(tmp_path / "state", adapter)
    value = service._official_preview(obj, identity)
    assert value["validation"]["summary_success"] is True
    assert value["validation"]["status"] == "success_without_targets"
    findings = service._findings(obj, [], "verified", identity, value, inv)
    assert [row["kind"] for row in findings] == ["preview_unresolved"]


def test_derived_mapping_is_explicit_per_file_and_does_not_mutate_identity(tmp_path):
    adapter, obj, _, _, identity = audit_fixture(tmp_path, series=True)
    obj["entries"] = obj["entries"][:3]
    obj["entries"][2]["name"] = "Cyberpunk.Edgerunners.10.My.Moon.My.Man.1080p.mkv"
    adapter.preview_value["items"][2]["target"] = "/fixture/library/Title.S01E10.mkv"
    before = deepcopy(identity)
    captured = []
    original = adapter.preview
    def exact(source, chosen):
        captured.append(deepcopy(chosen))
        return original(source, chosen)
    adapter.preview = exact
    result = G.GovernorService(tmp_path / "state", adapter)._official_preview(obj, identity)
    assert result["validation"]["status"] == "verified"
    assert captured[-1]["season"] == 1 and captured[-1]["epformat"] == {"detail": "10"}
    assert result["mapping"]["derived_sources"] == 1 and identity == before


def test_derived_readonly_mapping_cannot_become_a_repair_plan(tmp_path):
    adapter, obj, inv, _, _ = audit_fixture(tmp_path, series=True)
    obj["entries"] = obj["entries"][:3]
    obj["entries"][2]["name"] = "Cyberpunk.Edgerunners.10.My.Moon.My.Man.1080p.mkv"
    adapter.preview_value["items"][2]["target"] = "/fixture/library/Title.S01E10.mkv"
    service = G.GovernorService(tmp_path / "state", adapter)
    run_scan(service, inv)
    with pytest.raises(ValueError, match="仅用于只读核对"):
        service.repair_preview(obj["id"])
    assert adapter.rebuild_calls == []


def test_explicit_mapping_is_not_overwritten_by_inference(tmp_path):
    adapter, obj, _, _, identity = audit_fixture(tmp_path, series=True)
    obj["entries"] = obj["entries"][:3]
    obj["entries"][2]["name"] = "Cyberpunk.Edgerunners.10.My.Moon.My.Man.1080p.mkv"
    identity = {**identity, "season": 0, "epformat": {"offset": "-1"}}
    for number, row in enumerate(adapter.preview_value["items"], 1):
        row["target"] = f"/fixture/library/Title.S00E{number:02}.mkv"
    result = G.GovernorService(tmp_path / "state", adapter)._official_preview(obj, identity)
    assert result["mapping"]["derived_sources"] == 0
    assert result["mapping"]["status"] == "explicit_options_official_preview"


def test_explicit_season_must_be_reflected_by_official_target(tmp_path):
    adapter, obj, _, _, identity = audit_fixture(tmp_path, series=True)
    obj["entries"] = obj["entries"][:1]
    result = G.GovernorService(tmp_path / "state", adapter)._official_preview(obj, {**identity, "season": 0})
    assert result["validation"]["status"] == "mapping_unresolved"
    assert result["mapping"]["checked_sources"] == 1


def test_query_budget_does_not_discard_other_title_evidence(tmp_path):
    adapter, obj, _, _, identity = audit_fixture(tmp_path, series=True)
    names = ["Example Alpha", "Example Beta", "Example Gamma", "Example Delta"]
    obj["entries"] = obj["entries"][:4]
    for number, (row, name) in enumerate(zip(obj["entries"], names), 1):
        row["name"] = f"{name}.S01E{number:02}.mkv"
    answer = {**identity, "title": names[0], "aliases": names}
    adapter.search = lambda query: adapter.search_calls.append(query) or [answer]
    adapter.database = {**adapter.database, **answer}
    service = G.GovernorService(tmp_path / "state", adapter)
    assert service._resolve_identity(obj, [])[0] == "verified"
    assert len(adapter.search_calls) == G.MAX_IDENTITY_QUERIES
    # 未用于查询的第四组仍必须由详情别名解释，不能因查询预算把证据扔掉。
    adapter.database["aliases"] = names[:3]
    assert service._resolve_identity(obj, [], force=True)[0] == "candidate"


def test_other_verified_link_prevents_native_failure_but_keeps_expected_missing(tmp_path):
    adapter, obj, inv, source, _, wrong = local_fixture(tmp_path)
    wrong.hardlink_to(source)
    inv.histories = [{"src": str(source), "dest": str(wrong), "status": True}]
    service = G.GovernorService(tmp_path / "state", adapter)
    receipt = {}
    identity = {"title": "Film", "media_type": "movie", "media_source": "themoviedb", "media_id": "7"}
    findings = service._findings(obj, inv.histories, "confirmed", identity, adapter.preview_value, inv, relation_observation=receipt)
    assert "native_failure" not in {row["kind"] for row in findings}
    assert receipt["expected_missing_count"] == 1 and receipt["historical_execution"] == "unknown"


def test_copy_or_unproven_relation_is_not_a_verified_other_link(tmp_path):
    adapter, obj, inv, source, _, wrong = local_fixture(tmp_path)
    wrong.write_bytes(source.read_bytes())
    inv.histories = [{"src": str(source), "dest": str(wrong), "status": True}]
    service = G.GovernorService(tmp_path / "state", adapter)
    identity = {"title": "Film", "media_type": "movie", "media_source": "themoviedb", "media_id": "7"}
    findings = service._findings(obj, inv.histories, "confirmed", identity, adapter.preview_value, inv)
    assert "path_deviation" not in {row["kind"] for row in findings}
    assert "relation_confirmation" in {row["kind"] for row in findings}


def test_kwargs_only_chain_is_not_a_selected_file_capability():
    adapter = G.MoviePilotAdapter()
    adapter._loaded = {"transfer": SimpleNamespace(manual_transfer=lambda **kwargs: (True, {}))}
    assert adapter.supports_selected_preview() is False


def test_selected_chain_receives_real_fileitems_and_safe_preview_flags():
    calls = []
    def manual_transfer(fileitem, selected_fileitems=None, **kwargs):
        calls.append({"source": fileitem, "selected": selected_fileitems, **kwargs})
        return True, {"summary": {"total": 1, "success": 1, "failed": 0}, "items": [{"source": "/fixture/source/A.mkv", "target": "/fixture/library/A.mkv", "success": True}]}
    adapter = G.MoviePilotAdapter()
    adapter._loaded = {"transfer": SimpleNamespace(manual_transfer=manual_transfer), "FileItem": lambda **kwargs: SimpleNamespace(**kwargs), "MediaSource": lambda value: value,
                       "dirs": SimpleNamespace(get_dir=lambda **kwargs: SimpleNamespace(library_path="/fixture/library", library_storage="local", transfer_type="link", library_type_folder=False, library_category_folder=False))}
    adapter.media_info = lambda _: SimpleNamespace(type="movie")
    identity = {"media_source": "themoviedb", "media_id": "1"}
    files = [{"path": "/fixture/source/A.mkv", "type": "file", "name": "A.mkv"}]
    assert adapter.supports_selected_preview()
    adapter.preview_files({"path": "/fixture/source", "type": "dir"}, files, identity)
    call = calls[0]
    assert call["selected"][0].path == files[0]["path"]
    assert call["preview"] is True and call["sync_extra_files"] is False
    assert call["scrape"] is False and call["reorganize"] is False and call["background"] is False
