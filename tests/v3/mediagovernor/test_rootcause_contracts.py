"""根因合同回归：现场形状重建与合成负例，不冒充 NAS 原始回执。"""
from copy import deepcopy
from pathlib import Path

import pytest

from tests.v3.mediagovernor.test_automatic_audit import audit_fixture
from tests.v3.mediagovernor.test_v5 import G


@pytest.mark.parametrize("shape,accepted", [("subtitle", True), ("foreign_subtitle", False),
    ("foreign_directory", False), ("extra_video", False), ("duplicate", False), ("different_storage", False)])
def test_unfiltered_preview_preserves_attachment_and_scope_contract(tmp_path, shape, accepted):
    adapter, obj, _, _, identity = audit_fixture(tmp_path)
    raw = deepcopy(adapter.preview_value)
    video = raw["items"][0]
    extra = {**video, "source": str(Path(video["source"]).with_suffix(".en.srt")),
             "target": str(Path(video["target"]).with_suffix(".en.srt"))}
    if shape == "foreign_subtitle":
        extra["source"] = str(Path(video["source"]).with_name("Other.en.srt"))
    if shape == "foreign_directory":
        extra["source"] = str(Path(video["source"]).parent / "other" / Path(extra["source"]).name)
    if shape == "extra_video":
        extra["source"] = str(Path(video["source"]).with_suffix(".other.mkv"))
    if shape == "different_storage":
        extra["source_storage"] = "remote"
    if shape == "duplicate":
        extra = dict(video)
    raw["items"].append(extra)
    raw["summary"] = {"total": 2, "success": 2, "failed": 0}
    adapter.preview_files = lambda *_: deepcopy(raw)  # 不让理想替身预先过滤响应。
    value = G.GovernorService(tmp_path / "state", adapter)._official_preview(obj, identity)
    assert (value["validation"]["status"] == "verified") is accepted
    assert value["summary"]["total"] == value["summary"]["success"] + value["summary"]["failed"]
    if accepted:
        assert len(value["items"]) == len(value["attachments"]) == 1
        assert "source" not in value["attachments"][0]  # 附件不进入写入计划或配对。


@pytest.mark.parametrize("mode,accepted", [("bare", True), ("wrong_episode", False),
    ("contradictory_name", False), ("null", False), ("zero_episode", False), ("invalid", False)])
def test_structured_mapping_is_not_target_name_guessing(tmp_path, mode, accepted):
    adapter, obj, _, _, identity = audit_fixture(tmp_path, series=True)
    obj["entries"] = obj["entries"][:1]
    raw = deepcopy(adapter.preview_value)
    raw["items"] = raw["items"][:1]
    row = raw["items"][0]
    row.update(season=1, episode=1, episode_end=None)
    if mode == "bare":
        row["target"] = str(Path(row["target"]).with_name("Show.01.mkv"))
    elif mode == "wrong_episode":
        row["episode"] = 2
    elif mode == "contradictory_name":
        row["target"] = str(Path(row["target"]).with_name("Show.S01E02.mkv"))
    elif mode == "null":
        row["episode"] = None
    elif mode == "zero_episode":
        row["episode"] = 0
    else:
        row["season"] = "invalid"
    raw["summary"] = {"total": 1, "success": 1, "failed": 0}
    adapter.preview_files = lambda *_: raw
    value = G.GovernorService(tmp_path / "state", adapter)._official_preview(obj, identity)
    assert (value["validation"]["status"] == "verified") is accepted
    assert value["summary"]["total"] == value["summary"]["success"] + value["summary"]["failed"]


def test_structured_special_and_range_mapping():
    assert G.preview_mapping({"target": "bare.mkv", "season": 0, "episode": 1, "episode_end": 3}) == ((0, 1, 3), "structured")
    assert G.preview_mapping({"target": "Show.S01E02.mkv", "season": None, "episode": 2})[0] is None
    assert G.preview_mapping({"target": "Show.S01E02.mkv"})[0] == (1, 2, 2)


@pytest.mark.parametrize("name", ["Anime", "Movie", "Variety", "媒体"])
def test_display_name_cannot_change_base_type(name):
    assert G.root_category("/fixture/library/A.mkv", [{"path": "/fixture/library", "media_type": "tv", "name": name}]) == "tv"


def test_same_root_conflicting_rules_are_not_first_match_evidence():
    rules = [{"path": "/fixture/library", "media_type": "movie"}, {"path": "/fixture/library", "media_type": "tv"}]
    assert G.root_category("/fixture/library/A.mkv", rules) == "other"
    assert G.root_category("/fixture/library/A.mkv", rules[::-1]) == "other"


def test_directory_type_is_storage_scoped_and_generic_rule_is_not_conflict():
    rules = [{"path": "/fixture/library", "storage": "remote", "media_type": "movie"},
             {"path": "/fixture/library", "storage": "local", "media_type": "tv"}]
    assert G.root_category("/fixture/library/A.mkv", rules) == "tv"
    assert G.root_category("/fixture/library/A.mkv", rules, "remote") == "movie"
    assert G.root_category("/fixture/library/A.mkv", rules + [{"path": "/fixture/library"}]) == "other"


@pytest.mark.parametrize("category", ["综艺", "动漫", "自定义分类"])
def test_base_tv_is_not_compared_with_fine_category(tmp_path, category):
    adapter, obj, inv, _, identity = audit_fixture(tmp_path, series=True)
    identity["category"] = category
    for row in adapter.preview_value["items"]:
        row["directory_policy"] = {"status": "selected", "ref": "selected-rule", "media_type": "tv", "media_category": category}
    service = G.GovernorService(tmp_path / "state", adapter)
    receipt = {}
    assert service._findings(obj, [], "verified", identity, adapter.preview_value, inv, relation_observation=receipt) == []
    assert receipt["facts"]["expected_verified"] == 10


def test_actual_selected_policy_reaches_receipt_without_display_or_paths():
    from types import SimpleNamespace
    directory = SimpleNamespace(library_path="/fixture/library", library_storage="local", transfer_type="link",
        library_type_folder=True, library_category_folder=False, name="Movie", media_type="电视剧", media_category="custom")
    adapter = G.MoviePilotAdapter()
    adapter._loaded = {"FileItem": lambda **values: values, "dirs": SimpleNamespace(get_dir=lambda **_: directory),
        "MediaSource": lambda value: value, "transfer": SimpleNamespace(manual_transfer=lambda **_: (True,
        {"summary": {"total": 1}, "items": [{"source": "/fixture/source.mkv", "target": "/fixture/library/target.mkv"}]}))}
    adapter.media_info = lambda _: SimpleNamespace(type="tv")
    result = adapter.preview({"path": "/fixture/source.mkv"}, {"media_source": "themoviedb", "media_id": "7"})
    policy = result["items"][0]["directory_policy"]
    assert policy["status"] == "selected" and policy["media_type"] == "tv" and policy["ref"]
    assert not {"path", "library_path", "name"} & set(policy) and "Movie" not in G.json_text(policy)


def test_root_live_action_context_is_only_inherited_for_shared_title(tmp_path):
    _, obj, _, _, _ = audit_fixture(tmp_path, series=True)
    for number, row in enumerate(obj["entries"], 1):
        row["name"] = f"One.Piece.S01E{number:02}.mkv"
    obj["root"]["name"] = "One.Piece.真人版.2023"
    evidence, reason = G.source_identity_evidence(obj)
    assert not reason and evidence["live_action_context"]
    obj["entries"][0]["name"] = "Other.Show.S01E01.mkv"
    evidence, reason = G.source_identity_evidence(obj)
    assert not reason and not evidence["live_action_context"]
    assert not evidence["container_context"]["applicable"]


def test_cjk_bracket_is_search_evidence_not_trusted_title():
    value = G.parsed_name("[某中文作品或发布组].2024.1080p.mkv")
    assert "某中文作品或发布组" in value["weak_hints"]
    assert "某中文作品或发布组" not in value["hints"]


def test_weak_bracket_does_not_veto_strong_name_or_bless_a_mixed_package():
    evidence = {"title_groups": [["Correct"]], "weak_titles": ["Unknown Channel"], "media_type": "movie", "year": "2024"}
    identity = {"title": "Correct", "media_type": "movie", "year": "2024"}
    assert G.source_matches_database(evidence, identity)
    evidence["title_groups"].append(["Unrelated"])
    assert not G.source_matches_database(evidence, identity)
    evidence.update(title_groups=[["Correct"]], search_only=True)
    assert not G.source_matches_database(evidence, identity)


def test_competitor_detail_failure_cannot_make_remaining_candidate_unique(tmp_path):
    adapter, obj, _, _, identity = audit_fixture(tmp_path)
    second = {**identity, "media_id": "other", "title": "Translated"}
    adapter.search = lambda _: [second, identity]
    def detail(candidate):
        adapter.detail_calls.append(candidate)
        if candidate["media_id"] == "other":
            raise TimeoutError("PRIVATE PROVIDER BODY")
        return adapter.database
    adapter.media_info = detail
    service = G.GovernorService(tmp_path / "state", adapter)
    assert service._resolve_identity(obj, [])[0] == "candidate"
    audit = service._identity_audit(obj["id"])
    assert len(adapter.detail_calls) == 2
    assert {row["detail"] for row in audit["funnel"]["candidates"]} == {"verified", "error"}
    assert "PRIVATE" not in G.json_text(audit)


def test_order_cannot_hide_unchecked_competitors_and_funnel_has_no_query_text(tmp_path):
    adapter, obj, _, _, identity = audit_fixture(tmp_path)
    rows = [identity, *[{**identity, "title": "Translated", "media_id": str(n)} for n in range(4)]]
    service = G.GovernorService(tmp_path / "state", adapter)
    observations = []
    for ordered in (rows, rows[::-1]):
        adapter.search = lambda _, ordered=ordered: ordered
        adapter.detail_calls.clear()
        assert service._resolve_identity(obj, [], force=True)[0] == "candidate"
        audit = service._identity_audit(obj["id"])
        assert audit["reason"] == "database_budget_exhausted"
        assert len(adapter.detail_calls) == G.MAX_IDENTITY_DETAILS
        assert any(row["detail"] == "not_checked" for row in audit["funnel"]["candidates"])
        assert all(set(query) == {"ref", "count", "role", "status"} for query in audit["funnel"]["queries"])
        observations.append(audit["funnel"])
    assert observations[0] == observations[1]


def test_detail_alias_competitor_is_not_excluded_by_search_title(tmp_path):
    adapter, obj, _, _, identity = audit_fixture(tmp_path)
    other = {**identity, "media_id": "other", "title": "Translated"}
    adapter.search = lambda _: [identity, other]
    adapter.media_info = lambda value: {**value, "aliases": [identity["title"]], "genres": [{"id": 18}]}
    service = G.GovernorService(tmp_path / "state", adapter)
    assert service._resolve_identity(obj, [])[0] == "candidate"
    assert service._identity_audit(obj["id"])["reason"] == "database_ambiguous"


def test_weak_only_name_is_queried_without_promotion_or_native_loop(tmp_path):
    adapter, obj, _, _, _ = audit_fixture(tmp_path, series=True)
    obj["entries"] = obj["entries"][:1]
    obj["entries"][0]["name"] = "[某中文作品或发布组].S01E01.1080p.mkv"
    obj["root"]["name"] = "unknown"
    service = G.GovernorService(tmp_path / "state", adapter)
    assert service._resolve_identity(obj, [])[0] == "candidate"
    assert adapter.search_calls == ["某中文作品或发布组"]
    audit = service._identity_audit(obj["id"])
    assert audit["reason"] == "source_title_unresolved" and audit["evidence"]["search_only"]
    assert adapter.recognize_calls == adapter.ai_calls == 0


def test_failed_search_has_anonymous_stage_receipt(tmp_path):
    adapter, obj, _, _, _ = audit_fixture(tmp_path)
    def fail(_):
        raise TimeoutError("SECRET QUERY OR PROVIDER BODY")
    adapter.search = fail
    service = G.GovernorService(tmp_path / "state", adapter)
    assert service._resolve_identity(obj, [])[0] == "candidate"
    query = service._identity_audit(obj["id"])["funnel"]["queries"][0]
    assert query["status"] == "error" and query["count"] is None and query["error_type"] == "TimeoutError"
    assert "SECRET" not in G.json_text(service._identity_audit(obj["id"]))


def test_empty_preview_counts_contract_error_not_three_failed_files(tmp_path):
    adapter, obj, _, _, identity = audit_fixture(tmp_path)
    adapter.preview_files = lambda *_: {"summary": {"total": 0, "success": 0, "failed": 0}, "items": []}
    value = G.GovernorService(tmp_path / "state", adapter)._official_preview(obj, identity)
    assert value["summary"]["total"] == value["summary"]["success"] == value["summary"]["failed"] == 0
    assert value["summary"]["contract_errors"] > 0 and value["validation"]["status"] == "scope_mismatch"
    assert not G.preview_cache_usable({**value, "_basis": "bad"}, "bad")


def test_explicit_range_conflict_and_s0_are_not_truthy_fallbacks():
    assert G.preview_mapping({"season": 0, "episode": 1, "episode_end": 3, "target": "Title.S00E01-E03.mkv"})[0] == (0, 1, 3)
    assert G.preview_mapping({"season": 0, "episode": 1, "episode_end": 2, "target": "Title.S00E01-E03.mkv"}) == (None, "target_conflict")
    assert G.preview_mapping({"season": 0, "episode": 1, "episode_end": 0, "target": "Title.mkv"})[0] is None
