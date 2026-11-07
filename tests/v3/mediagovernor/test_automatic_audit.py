"""自动只读对账：真实 SDK 解析/临时硬链接，数据库与官方预览使用桩。

不访问真实数据库、模型、NAS；不是现场准确率或整体用户验收。
"""
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from tests.v3.mediagovernor.test_identity_confirmation import run_scan
from tests.v3.mediagovernor.test_v5 import G, LocalFixtureAdapter


def audit_fixture(tmp_path, *, series=False, linked=True):
    adapter = LocalFixtureAdapter()
    title, year, mid = ("Cyberpunk Edgerunners", "2022", "105248") if series else ("Forrest Gump", "1994", "13")
    identity = {"title": title, "year": year, "media_type": "tv" if series else "movie", "media_source": "themoviedb", "media_id": mid}
    adapter.database = {**identity, **({"season_years": {1: year}, "genres": [{"id": 16}]} if series else {"genres": [{"id": 18}]})}
    root = tmp_path / "source" / f'{title.replace(" ", ".")}.{year}'
    root.mkdir(parents=True)
    target_root = tmp_path / "library" / ("anime" if series else "movie")
    target_root.mkdir(parents=True)
    files, targets = [], []
    for number in range(1, 11 if series else 2):
        name = f'{title.replace(" ", ".")}.{year}' + (f".S01E{number:02}" if series else "") + ".1080p.mkv"
        source, target = root / name, target_root / name
        source.write_bytes(f"video fixture {number}".encode())
        if linked:
            target.hardlink_to(source)
        files.append(adapter.get_item("local", str(source)))
        targets.append(target)
    obj = {"id": "auto-source", "label": title, "root": adapter.get_item("local", str(root)), "entries": files, "complete": True, "fingerprint": G.fingerprint(files)}
    inv = G.Inventory([obj], [{"path": str(target_root), "storage": "local", "name": "动漫" if series else "电影"}], [], [])
    adapter.preview_value = {"summary": {"total": len(files), "success": len(files), "failed": 0}, "items": [{"source": row["path"], "target": str(target), "target_storage": "local", "success": True} for row, target in zip(files, targets)]}
    adapter.search_calls, adapter.detail_calls = [], []
    adapter.search = lambda query: adapter.search_calls.append(query) or [identity]
    adapter.media_info = lambda value: adapter.detail_calls.append(value) or deepcopy(adapter.database)
    return adapter, obj, inv, targets, identity


@pytest.mark.parametrize("series", [False, True])
def test_unambiguous_source_automatically_reconciles_and_reuses_bounded_cache(tmp_path, series):
    adapter, obj, inv, _, _ = audit_fixture(tmp_path, series=series)
    assert not G.source_identity_evidence(obj)[1], G.evidence_digest(obj)
    service = G.GovernorService(tmp_path / "state", adapter, ai_enabled=True)
    for _ in range(2):
        result = run_scan(service, inv)
        assert not result["problems"] and not result["confirmations"] and not result["errors"]
        assert len(result["normal"]) == 1
    detail = service.detail(obj["id"])
    assert detail["identity_state"] == "verified" and detail["provenance"] == "rule_database_verified"
    assert detail["identity_audit"]["scope"].endswith("not_content_or_download_completeness")
    assert not G.user_confirmed(service._saved_identity(obj))
    assert len(adapter.search_calls) == len(adapter.detail_calls) == adapter.preview_calls == 1
    assert adapter.recognize_calls == adapter.ai_calls == 0
    assert adapter.rebuild_calls == []
    # 只读身份不等于写入许可，计划可查看但不能执行。
    plan = service.repair_preview(obj["id"])
    with pytest.raises(ValueError, match="只读模式"):
        service.repair_execute(obj["id"], plan["token"])


def test_nine_links_and_one_missing_are_reconciled_not_guessed_as_missing_episode(tmp_path):
    adapter, obj, inv, targets, _ = audit_fixture(tmp_path, series=True)
    targets[5].unlink()
    service = G.GovernorService(tmp_path / "state", adapter)
    result = run_scan(service, inv)
    assert [row["kind"] for row in result["problems"]] == ["native_failure"]
    assert not result["confirmations"] and not result["normal"]
    detail = service.detail(obj["id"])
    coverage = detail["relations"]["coverage"]
    assert coverage["source_video_count"] == 10 and coverage["linked_source_count"] == 9
    assert coverage["unlinked_or_unproven_sources"] == 1
    missing = [pair for pair in detail["relations"]["pairs"] if pair["status"] == "missing"]
    assert len(missing) == 1 and "S01E06" in missing[0]["source"]["path"]


@pytest.mark.parametrize("failure", ["multiple", "page_full", "wrong_year", "wrong_type", "detail_id", "detail_title", "detail_year", "search_error", "detail_error"])
def test_database_ambiguity_or_failure_never_reaches_official_preview(tmp_path, failure):
    adapter, obj, inv, _, identity = audit_fixture(tmp_path)
    if failure == "multiple":
        adapter.search = lambda _: [identity, {**identity, "media_id": "999"}]
    elif failure == "page_full":
        adapter.search = lambda _: [identity, *[{**identity, "title": f"Other {n}", "media_id": str(100 + n)} for n in range(G.MAX_IDENTITY_CANDIDATES)]]
    elif failure in {"wrong_year", "wrong_type"}:
        changed = {**identity, **({"year": "2025"} if failure == "wrong_year" else {"media_type": "tv"})}
        adapter.search = lambda _: [changed]
    elif failure.startswith("detail_") and failure != "detail_error":
        adapter.database[{"detail_id": "media_id", "detail_title": "title", "detail_year": "year"}[failure]] = "999"
    else:
        def error(_):
            raise TimeoutError("fixture timeout")
        if failure == "search_error":
            adapter.search = error
        else:
            adapter.media_info = error
    service = G.GovernorService(tmp_path / "state", adapter, ai_enabled=True)
    result = run_scan(service, inv)
    assert not result["problems"] and result["confirmations"]
    assert service.detail(obj["id"])["identity_state"] == "candidate"
    assert adapter.preview_calls == adapter.ai_calls == 0
    assert service.detail(obj["id"])["identity_audit"]["reason"]


@pytest.mark.parametrize("failure", ["incomplete", "missing_year", "mixed", "unparsed"])
def test_insufficient_source_evidence_never_auto_verifies(tmp_path, monkeypatch, failure):
    adapter, obj, inv, _, _ = audit_fixture(tmp_path)
    if failure == "incomplete":
        obj["complete"] = False
    elif failure == "missing_year":
        obj["root"]["name"] = "Film"
        obj["entries"][0]["name"] = "Film.mkv"
    elif failure == "mixed":
        obj["entries"].append({"path": "/fixture/Other.2020.mkv", "type": "file"})
    else:
        digest = G.evidence_digest(obj)
        digest.update({"parse_unresolved": 1} if failure == "unparsed" else {"episode_mapping_review": True})
        monkeypatch.setattr(G, "evidence_digest", lambda _: digest)
    service = G.GovernorService(tmp_path / "state", adapter)
    result = run_scan(service, inv)
    assert not result["problems"] and not result["normal"]
    assert service.detail(obj["id"])["identity_state"] == "candidate"
    assert adapter.preview_calls == 0


def test_old_cached_candidate_does_not_block_new_source_verification(tmp_path):
    adapter, obj, inv, _, identity = audit_fixture(tmp_path)
    service = G.GovernorService(tmp_path / "state", adapter)
    service.ledger.save_identity(obj["id"], "candidate", obj["fingerprint"], {}, [identity], "native_and_history_agree")
    run_scan(service, inv)
    assert service.detail(obj["id"])["identity_state"] == "verified"


@pytest.mark.parametrize("change", ["expiry", "policy", "source", "identity"])
def test_verification_receipt_cannot_be_reused_after_its_basis_changes(tmp_path, change):
    adapter, obj, inv, _, identity = audit_fixture(tmp_path)
    service = G.GovernorService(tmp_path / "state", adapter)
    run_scan(service, inv)
    audit = service._identity_audit(obj["id"])
    if change == "expiry":
        audit["checked_at"] = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
    elif change == "policy":
        audit["policy"] = "obsolete"
    elif change == "source":
        audit["source_fp"] = "different"
    else:
        audit["identity_key"] = "themoviedb:999:movie"
    service.ledger.save_observation(obj["id"], "identity_audit", True, obj["fingerprint"], audit)
    assert service.detail(obj["id"])["identity_state"] == "candidate"
    assert not service.findings()["normal"]
    run_scan(service, inv)
    assert service.detail(obj["id"])["identity_state"] == "verified"
    assert len(adapter.search_calls) == 2


def test_tv_season_year_is_checked_instead_of_series_premiere(tmp_path):
    adapter, obj, _, _, identity = audit_fixture(tmp_path, series=True)
    evidence, reason = G.source_identity_evidence(obj)
    assert not reason
    evidence.update(year="2024", seasons=[4])
    assert G.source_matches_database(evidence, identity, {"season_years": {4: "2024"}})
    assert not G.source_matches_database(evidence, identity, {"season_years": {1: "2022"}})


def test_first_season_year_distinguishes_same_title_without_choosing_first_candidate(tmp_path):
    adapter, obj, _, _, _ = audit_fixture(tmp_path, series=True)
    # 第一项为错年份；按源年份和季年份排除，不凭原生/历史投票。
    identity = {"title": "Cyberpunk Edgerunners", "year": "2022", "media_type": "tv", "media_source": "themoviedb", "media_id": "105248"}
    adapter.search = lambda _: [{**identity, "year": "2023", "media_id": "999"}, identity]
    service = G.GovernorService(tmp_path / "state", adapter)
    state, _, candidates, _ = service._resolve_identity(obj, [])
    assert state == "verified" and len(candidates) == 2
    assert [row["media_id"] for row in adapter.detail_calls] == ["105248"]


def test_later_season_same_title_remains_ambiguous_not_filtered_by_premiere_year(tmp_path):
    adapter, obj, _, _, identity = audit_fixture(tmp_path, series=True)
    for row in obj["entries"]:
        row["name"] = Path(row["path"]).name.replace("S01", "S04")
    adapter.search = lambda _: [identity, {**identity, "year": "2018", "media_id": "999"}]
    service = G.GovernorService(tmp_path / "state", adapter)
    assert service._resolve_identity(obj, [])[0] == "candidate"
    # 两项均回读：这个替身给第二个 ID 返回了第一项详情，应保留合同冲突而非静默排除。
    assert service._identity_audit(obj["id"])["reason"] == "database_detail_conflict"
    assert {row["media_id"] for row in adapter.detail_calls} == {identity["media_id"], "999"}


def test_user_correction_overrides_an_automatic_audit_and_survives_restart(tmp_path):
    adapter, obj, inv, _, identity = audit_fixture(tmp_path)
    service = G.GovernorService(tmp_path / "state", adapter)
    run_scan(service, inv)
    service.start = lambda *_: {"accepted": True}
    service.confirm_identity(obj["id"], G.identity_key(identity))
    service = G.GovernorService(tmp_path / "state", adapter)
    detail = service.detail(obj["id"])
    assert detail["identity_state"] == "confirmed" and detail["provenance"] == "user_confirmed"
    service._resolve_identity(obj, [])
    assert len(adapter.search_calls) == 1


def test_verified_state_survives_restart_without_becoming_a_human_decision(tmp_path):
    adapter, obj, inv, _, _ = audit_fixture(tmp_path)
    service = G.GovernorService(tmp_path / "state", adapter)
    run_scan(service, inv)
    service = G.GovernorService(tmp_path / "state", adapter)
    assert service.detail(obj["id"])["identity_state"] == "verified"
    assert not G.user_confirmed(service._saved_identity(obj))
    run_scan(service, inv)
    assert len(adapter.search_calls) == 1 and adapter.preview_calls == 1


def test_transient_database_error_is_not_cached_as_no_result(tmp_path):
    adapter, obj, inv, _, _ = audit_fixture(tmp_path)
    good_search = adapter.search
    def error(_):
        raise TimeoutError("fixture timeout")
    adapter.search = error
    service = G.GovernorService(tmp_path / "state", adapter)
    run_scan(service, inv)
    assert service.detail(obj["id"])["identity_audit"]["status"] == "error"
    adapter.search = good_search
    run_scan(service, inv)
    assert service.detail(obj["id"])["identity_state"] == "verified"


def test_source_fingerprint_change_revokes_automatic_identity(tmp_path):
    adapter, obj, inv, _, _ = audit_fixture(tmp_path)
    service = G.GovernorService(tmp_path / "state", adapter)
    run_scan(service, inv)
    obj["fingerprint"] = "changed-source"
    service.ledger.upsert_object(obj)
    assert service.detail(obj["id"])["identity_state"] == "candidate"
    assert not service._identity_cache_usable(service._saved_identity(obj), obj)


@pytest.mark.parametrize("timing", ["before", "during"])
def test_automatic_results_never_overwrite_a_newer_manual_choice(tmp_path, timing):
    adapter, obj, inv, _, identity = audit_fixture(tmp_path)
    service = G.GovernorService(tmp_path / "state", adapter)
    service.ledger.upsert_object(obj)
    automatic = service._resolve_identity(obj, [])
    answer = {**identity, "media_id": "999"}
    def choose():
        service.ledger.save_identity(obj["id"], "confirmed", obj["fingerprint"], answer, [identity, answer], "user_confirmed")
    seen = []
    old_preview = adapter.preview
    def preview(source, selected):
        seen.append(selected)
        if timing == "during":
            choose()
        return old_preview(source, selected)
    adapter.preview = preview
    job = service.ledger.begin_job("incremental")
    if timing == "before":
        choose()
        service._process(job, obj, inv, automatic)
        assert seen == [answer]
    else:
        with pytest.raises(ValueError, match="核对期间已变化"):
            service._process(job, obj, inv, automatic)
        assert service.detail(obj["id"])["preview"] == {}
    assert service.detail(obj["id"])["identity"] == answer


def test_verified_plan_execution_still_requires_current_receipt_and_explicit_token(tmp_path):
    adapter, obj, inv, targets, _ = audit_fixture(tmp_path, linked=False)
    service = G.GovernorService(tmp_path / "state", adapter, read_only=False)
    run_scan(service, inv)
    assert adapter.rebuild_calls == []
    plan = service.repair_preview(obj["id"])
    assert not targets[0].exists()
    with pytest.raises(ValueError, match="过期"):
        service.repair_execute(obj["id"], "wrong-token")
    def rebuild(entry, _identity):
        adapter.rebuild_calls.append(entry)
        Path(entry["expected"]).hardlink_to(Path(entry["source"]["path"]))
    adapter.rebuild = rebuild
    service.start = lambda *_: {"accepted": True}
    result = service.repair_execute(obj["id"], plan["token"])
    assert result["accepted"] and targets[0].exists() and len(adapter.rebuild_calls) == 1
    with pytest.raises(ValueError, match="过期"):
        service.repair_execute(obj["id"], plan["token"])


def test_expired_verification_invalidates_frozen_plan_before_any_write(tmp_path):
    adapter, obj, inv, _, _ = audit_fixture(tmp_path, linked=False)
    service = G.GovernorService(tmp_path / "state", adapter, read_only=False)
    run_scan(service, inv)
    plan = service.repair_preview(obj["id"])
    audit = service._identity_audit(obj["id"])
    audit["checked_at"] = "2000-01-01T00:00:00+00:00"
    service.ledger.save_observation(obj["id"], "identity_audit", True, obj["fingerprint"], audit)
    with pytest.raises(ValueError, match="身份"):
        service.repair_execute(obj["id"], plan["token"])
    assert adapter.rebuild_calls == []


def test_verification_expiring_during_live_recheck_still_blocks_write(tmp_path):
    adapter, obj, inv, _, _ = audit_fixture(tmp_path, linked=False)
    service = G.GovernorService(tmp_path / "state", adapter, read_only=False)
    run_scan(service, inv)
    plan = service.repair_preview(obj["id"])
    old_preview = adapter.preview
    def preview(source, identity):
        audit = service._identity_audit(obj["id"])
        audit["checked_at"] = "2000-01-01T00:00:00+00:00"
        service.ledger.save_observation(obj["id"], "identity_audit", True, obj["fingerprint"], audit)
        return old_preview(source, identity)
    adapter.preview = preview
    with pytest.raises(ValueError, match="身份核验已经失效"):
        service.repair_execute(obj["id"], plan["token"])
    assert adapter.rebuild_calls == []
