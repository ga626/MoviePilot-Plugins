"""5.1.2 现场形状回归；SDK 对象/临时硬链接，不访问 NAS 或数据库。"""
from copy import deepcopy
from types import SimpleNamespace

import pytest

from tests.v3.mediagovernor.test_v5 import G
from tests.v3.mediagovernor.test_automatic_audit import audit_fixture
from tests.v3.mediagovernor.test_identity_confirmation import run_scan


def test_host_projection_keeps_trusted_aliases_and_zero_copy_identity_fields():
    from app.sdk.media import MediaInfo
    from app.schemas.types import MediaSource, MediaType
    media = MediaInfo(media_source=MediaSource.TMDB, media_id="78154", type=MediaType.TV,
                      title="我的天才女友", original_title="L'amica geniale", en_title="My Brilliant Friend",
                      names=["My Brilliant Friend", "我的天才女友"], year="2018")
    projected = G.public_identity(G.identity_from_media(media))
    assert "My Brilliant Friend" in projected["aliases"]
    assert G.source_matches_database({"title": "My Brilliant Friend", "year": "2018", "media_type": "tv", "seasons": [1]}, projected)


def test_native_search_does_not_manufacture_full_page_at_eight(monkeypatch):
    rows = [{"title": f"Film {n}", "year": "2000", "media_type": "movie", "media_source": "themoviedb", "media_id": str(n + 1)} for n in range(20)]
    adapter = G.MoviePilotAdapter()
    adapter._loaded = {"media": SimpleNamespace(search=lambda _: (None, rows))}
    assert len(adapter.search("Film")) == 20


def test_aliases_are_verified_against_detail_not_promoted_from_search_only(tmp_path):
    adapter, obj, _, _, identity = audit_fixture(tmp_path)
    translated = {**identity, "title": "当地译名", "original_title": "另一原名", "en_title": identity["title"]}
    adapter.search = lambda _: [G.identity_from_media(translated)]
    adapter.media_info = lambda _: translated
    service = G.GovernorService(tmp_path / "state", adapter)
    assert service._resolve_identity(obj, [])[0] == "verified"
    adapter.media_info = lambda _: {**translated, "en_title": "Other Film"}
    assert service._resolve_identity(obj, [], force=True)[0] == "candidate"


def test_inferred_episode_is_not_a_work_identity_veto(tmp_path):
    adapter, obj, _, _, identity = audit_fixture(tmp_path, series=True)
    # 两个明确锚点 + 一个同名前缀裸集号；只推断线索，不修改源文件或执行映射。
    obj["entries"] = obj["entries"][:3]
    obj["entries"][2]["name"] = "Cyberpunk.Edgerunners.10.My.Moon.My.Man.1080p.mkv"
    evidence, reason = G.source_identity_evidence(obj)
    assert not reason and evidence["media_type"] == "tv"
    assert evidence["mapping_review"] is True
    assert G.GovernorService(tmp_path / "state", adapter)._resolve_identity(obj, [])[0] == "verified"


@pytest.mark.parametrize("seasons", [[1, 2], [2, 4]])
def test_multi_season_bundle_year_is_not_required_as_every_season_premiere(tmp_path, seasons):
    adapter, obj, _, _, identity = audit_fixture(tmp_path, series=True)
    obj["entries"] = obj["entries"][:2]
    for row, season in zip(obj["entries"], seasons):
        row["name"] = f"Cyberpunk.Edgerunners.S{season:02}E01.1080p.mkv"
    evidence, reason = G.source_identity_evidence(obj)
    assert not reason
    details = {**identity, "season_years": {1: "2022", 2: "2023", 4: "2025"}}
    assert G.source_matches_database(evidence, identity, details)


def test_missing_year_is_not_identity_veto_when_database_title_type_are_unique(tmp_path):
    adapter, obj, _, _, identity = audit_fixture(tmp_path, series=True)
    obj["root"]["name"] = "Cyberpunk Edgerunners"
    for n, row in enumerate(obj["entries"], 1):
        row["name"] = f"Cyberpunk.Edgerunners.S01E{n:02}.mkv"
    assert G.GovernorService(tmp_path / "state", adapter)._resolve_identity(obj, [])[0] == "verified"
    adapter.search = lambda _: [identity, {**identity, "media_id": "999", "year": "1995"}]
    assert G.GovernorService(tmp_path / "state2", adapter)._resolve_identity(obj, [])[0] == "candidate"


def test_disc_directory_never_generates_file_pairs(tmp_path):
    service = G.GovernorService(tmp_path / "state", SimpleNamespace())
    snap = "disc-shape"
    service.ledger.index_library_rows(snap, [{"path": f"/fixture/library/{n}.mkv", "storage": "local", "type": "file"} for n in range(2187)])
    obj = {"id": "disc", "root": {"path": "/fixture/source/Film.2018", "type": "dir"}, "entries": [{"path": "/fixture/source/Film.2018/BDMV", "type": "dir", "storage": "local"}], "fingerprint": "disc", "complete": True}
    inv = G.Inventory([], [{"path": "/fixture/library", "storage": "local"}], [], [], {"id": snap, "complete": True, "file_count": 2187})
    receipt = service._observe_relations(obj, [], {}, inv, None, {})
    assert receipt["pairs"] == [] and receipt["coverage"]["pending_pairs"] == 0
    assert receipt["coverage"]["unsupported_source_count"] == 1


@pytest.mark.parametrize("field", ["media_id", "media_source", "media_type", "title", "year"])
def test_detail_conflict_has_minimal_field_receipt(tmp_path, field):
    adapter, obj, _, _, identity = audit_fixture(tmp_path)
    change = {"media_id": "999", "media_source": "douban", "media_type": "tv", "title": "Unrelated", "year": "2025"}
    adapter.database[field] = change[field]
    service = G.GovernorService(tmp_path / "state", adapter)
    assert service._resolve_identity(obj, [])[0] == "candidate"
    comparison = service._identity_audit(obj["id"])["detail_comparisons"][0]
    assert comparison["fields"][field] == "mismatch"
    assert set(comparison) == {"requested_key", "returned_key", "fields"}


def test_dictionary_and_real_host_object_normalize_equivalently():
    from app.sdk.media import MediaInfo
    from app.schemas.types import MediaSource, MediaType
    media = MediaInfo(media_source=MediaSource.TMDB, media_id="13", type=MediaType.MOVIE,
                      title="阿甘正传", original_title="Forrest Gump", year="1994")
    assert G.identity_from_media(media) == G.identity_from_media(media.to_dict())


def test_eight_results_with_unique_exact_match_reaches_detail(tmp_path):
    adapter, obj, _, _, identity = audit_fixture(tmp_path)
    adapter.search = lambda _: [{**identity, "title": f"Other {n}", "media_id": str(100+n)} for n in range(7)] + [identity]
    service = G.GovernorService(tmp_path / "state", adapter)
    assert service._resolve_identity(obj, [])[0] == "verified"
    assert len(adapter.detail_calls) == 1 and adapter.recognize_calls == 0


def test_detail_alias_recovers_localised_search_without_query_injection(tmp_path):
    adapter, obj, _, _, identity = audit_fixture(tmp_path)
    adapter.search = lambda _: [{**identity, "title": "本地译名"}]
    adapter.database = {**adapter.database, "title": "本地译名", "names": [identity["title"]]}
    service = G.GovernorService(tmp_path / "state", adapter)
    assert service._resolve_identity(obj, [])[0] == "verified"
    adapter.database["names"] = []
    adapter.database["overview"] = identity["title"]
    assert service._resolve_identity(obj, [], force=True)[0] == "candidate"


def test_translation_detail_budget_never_chooses_first_or_discards_unchecked(tmp_path):
    adapter, obj, _, _, identity = audit_fixture(tmp_path)
    adapter.search = lambda _: [{**identity, "title": f"译名{n}", "media_id": str(n)} for n in range(G.MAX_IDENTITY_DETAILS+1)]
    service = G.GovernorService(tmp_path / "state", adapter)
    assert service._resolve_identity(obj, [])[0] == "candidate"
    assert adapter.detail_calls == [] and adapter.recognize_calls == 0
    assert service._identity_audit(obj["id"])["reason"] == "database_page_full"


@pytest.mark.parametrize("mode", ["empty", "adapter_conflict", "timeout"])
def test_detail_failure_retains_stage_without_native_fallback_or_raw_body(tmp_path, mode):
    adapter, obj, _, _, identity = audit_fixture(tmp_path)
    def details(_):
        if mode == "adapter_conflict":
            raise G.IdentityDetailConflict(G.detail_comparison({"title": identity["title"], "year": identity["year"], "media_type": "movie"}, identity, {**identity, "media_id": "999"}, {}))
        if mode == "timeout":
            raise TimeoutError("DO NOT RETAIN PROVIDER BODY")
        return None
    adapter.media_info = details
    service = G.GovernorService(tmp_path / "state", adapter)
    assert service._resolve_identity(obj, [])[0] == "candidate"
    audit = service._identity_audit(obj["id"])
    assert audit["reason"] == ("database_error" if mode == "timeout" else "database_detail_conflict")
    diagnostic = service.ledger.one("SELECT payload_json FROM observations WHERE object_id=? AND kind='identity_diagnostics'", (obj["id"],))["payload_json"]
    assert "source_database" in diagnostic and "DO NOT RETAIN" not in diagnostic
    assert adapter.recognize_calls == adapter.ai_calls == 0


@pytest.mark.parametrize("wrong_target", [False, True])
def test_work_identity_passes_but_inferred_mapping_must_match_official_preview(tmp_path, wrong_target):
    adapter, obj, _, _, _ = audit_fixture(tmp_path, series=True)
    obj["entries"] = obj["entries"][:3]
    row = obj["entries"][2]
    row["name"] = "Cyberpunk.Edgerunners.10.My.Moon.My.Man.1080p.mkv"
    preview = deepcopy(adapter.preview_value)
    preview["items"] = preview["items"][:3]
    preview["summary"] = {"total": 3, "success": 3, "failed": 0}
    preview["items"][2]["target"] = "/fixture/library/Title.S01E09.mkv" if wrong_target else "/fixture/library/Title.S01E10.mkv"
    adapter.preview = lambda *_: preview
    service = G.GovernorService(tmp_path / "state", adapter)
    assert service._resolve_identity(obj, [])[0] == "verified"
    result = service._official_preview(obj, adapter.database)
    assert result["mapping"]["inferred_sources"] == 1
    assert bool(result["summary"]["failed"]) is wrong_target


@pytest.mark.parametrize("names,eligible", [(["Film.2000.CD1.mkv", "Film.2000.CD2.mkv"], True),
    (["Film.2000.mkv", "Film.2000.1080p.mkv"], False),
    (["Film.2000.CD1.mkv", "Film.2001.CD2.mkv"], False)])
def test_movie_multipart_is_not_arbitrary_multiple_files(names, eligible):
    obj = {"complete": True, "root": {"name": "Film.2000"}, "entries": [{"type": "file", "name": name, "path": "/fixture/"+name} for name in names]}
    evidence, reason = G.source_identity_evidence(obj)
    assert (not reason) is eligible
    if eligible:
        assert evidence["media_type"] == "movie"


def test_disc_reports_unsupported_without_false_normal_or_official_file_preview(tmp_path):
    adapter, obj, inv, _, _ = audit_fixture(tmp_path)
    obj["entries"] = [{"path": obj["root"]["path"] + "/BDMV", "name": "BDMV", "storage": "local", "type": "dir"}]
    obj["fingerprint"] = G.fingerprint(obj["entries"])
    service = G.GovernorService(tmp_path / "state", adapter)
    result = run_scan(service, inv)
    assert not result["normal"] and not result["problems"] and not result["errors"]
    assert result["confirmations"] and adapter.preview_calls == 0
    assert service.detail(obj["id"])["relations"]["coverage"]["unsupported_source_count"] == 1


def test_explicit_multi_season_identity_does_not_approve_wrong_season_preview(tmp_path):
    adapter, obj, _, _, _ = audit_fixture(tmp_path, series=True)
    obj["entries"] = obj["entries"][:2]
    obj["entries"][1]["name"] = "Cyberpunk.Edgerunners.S02E01.mkv"
    adapter.database["season_years"] = {1: "2022", 2: "2023"}
    preview = deepcopy(adapter.preview_value)
    preview["items"] = preview["items"][:2]
    preview["summary"] = {"total": 2, "success": 2, "failed": 0}
    adapter.preview = lambda *_: preview
    service = G.GovernorService(tmp_path / "state", adapter)
    assert service._resolve_identity(obj, [])[0] == "verified"
    result = service._official_preview(obj, adapter.database)
    assert result["mapping"]["conflicts"] == 1 and result["summary"]["failed"]


def test_one_missing_detail_field_does_not_hide_other_field_results():
    identity = {"title": "Film", "year": "2000", "media_source": "themoviedb", "media_id": "1", "media_type": "movie"}
    comparison = G.detail_comparison({"title": "Film", "year": "2000", "media_type": "movie"}, identity, {**identity, "media_source": "tmdb", "media_id": ""}, {})
    assert comparison["fields"] == {"media_source": "match", "media_id": "missing", "media_type": "match", "title": "match", "year": "match"}
