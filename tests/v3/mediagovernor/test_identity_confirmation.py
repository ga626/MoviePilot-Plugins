"""身份可信边界：输入候选与人工答案分开，走正式后台链；不访问网络或 NAS。"""
import pytest

from tests.v3.mediagovernor.test_v5 import G, local_fixture


def run_scan(service, inv):
    service._discover = lambda job_id: inv
    service._run(service.ledger.begin_job("incremental"), "incremental", None)
    assert service.status()["job"]["status"] == "completed"
    return service.findings()


def test_repeated_wrong_native_and_history_never_becomes_a_proven_issue(tmp_path):
    adapter, obj, inv, source, target, _ = local_fixture(tmp_path)
    target.hardlink_to(source)
    # 原生和历史都把这个对象认成 7；独立人工答案是 8。
    answer = {"title": "Correct film", "year": "2025", "media_type": "movie", "media_source": "themoviedb", "media_id": "8"}
    service = G.GovernorService(tmp_path / "state", adapter)
    for _ in range(2):
        result = run_scan(service, inv)
        assert not result["problems"] and not result["errors"]
        assert [row["kind"] for row in result["confirmations"]] == ["identity_confirmation"]
    detail = service.detail(obj["id"])
    assert detail["identity_state"] == "candidate" and detail["identity"] == {}
    assert {candidate["media_id"] for candidate in detail["candidates"]} == {"7"}
    assert answer["media_id"] not in {candidate["media_id"] for candidate in detail["candidates"]}
    assert adapter.recognize_calls == 1 and adapter.preview_calls == adapter.ai_calls == 0
    with pytest.raises(ValueError, match="确认作品身份"):
        service.repair_preview(obj["id"])
    # 缺少正确候选必须如实保留，不伪造识别准确率或允许任意 ID 确认。
    with pytest.raises(ValueError, match="候选已经过期"):
        service.confirm_identity(obj["id"], G.identity_key(answer))


def test_explicit_confirmation_reconciles_one_object_and_is_reused(tmp_path):
    adapter, obj, inv, source, target, _ = local_fixture(tmp_path)
    target.hardlink_to(source)
    service = G.GovernorService(tmp_path / "state", adapter)
    run_scan(service, inv)
    scheduled = []
    service.start = lambda mode, ids: scheduled.append((mode, ids)) or {"accepted": True}
    candidate = service.detail(obj["id"])["candidates"][0]
    service.confirm_identity(obj["id"], G.identity_key(candidate))
    assert scheduled == [("incremental", [obj["id"]])]
    for _ in range(2):
        result = run_scan(service, inv)
        assert not result["problems"] and not result["confirmations"] and not result["errors"]
    assert service.detail(obj["id"])["provenance"] == "user_confirmed"
    assert adapter.recognize_calls == adapter.preview_calls == 1 and adapter.ai_calls == 0


def test_old_automatic_confirmation_and_its_repair_plan_are_invalidated_on_restart(tmp_path):
    adapter, obj, inv, _, _, _ = local_fixture(tmp_path)
    service = G.GovernorService(tmp_path / "state", adapter)
    service.ledger.upsert_object(obj)
    old = adapter.recognize(obj["root"]["path"])
    service.ledger.save_identity(obj["id"], "confirmed", obj["fingerprint"], old, [], "native_and_history_agree")
    service.ledger.replace_findings(obj["id"], [{"kind": "native_failure", "reason": "old automatic result"}])
    service.ledger.save_observation(obj["id"], "repair_plan", True, "old-token", {"identity": old})
    service.ledger.save_observation(obj["id"], "preview", True, "old-preview", adapter.preview_value)
    service.ledger.save_observation(obj["id"], "relations", True, "old-relations", {"pairs": [{"status": "verified", "present": True}], "coverage": {"checked_pairs": 1}})
    service = G.GovernorService(tmp_path / "state", adapter)
    result = service.findings()
    assert not result["problems"]
    assert [row["kind"] for row in result["confirmations"]] == ["identity_confirmation"]
    detail = service.detail(obj["id"])
    assert detail["identity_state"] == "candidate" and detail["identity"] == {}
    assert detail["candidates"] == [old]
    assert detail["preview"] == {} and detail["relations"]["stale"] is True
    assert detail["relations"]["pairs"][0]["status"] == "pending"
    assert detail["relations"]["coverage"] == {"checked_pairs": 0, "pending_pairs": 1}
    assert service.ledger.one("SELECT * FROM observations WHERE kind='repair_plan'") is None
    with pytest.raises(ValueError):
        service.repair_execute(obj["id"], "old-token")
    assert adapter.rebuild_calls == []
    # 重复初始化不重复迁移或清空候选。
    saved = service.ledger.one("SELECT * FROM identities")
    service = G.GovernorService(tmp_path / "state", adapter)
    assert service.ledger.one("SELECT * FROM identities") == saved


def test_ai_candidates_reach_human_choice_and_only_selected_identity_reaches_preview(tmp_path):
    adapter, obj, inv, source, target, _ = local_fixture(tmp_path)
    target.hardlink_to(source)
    inv.histories = []
    adapter.recognize = lambda _: {}
    answer = {"title": "Correct film", "year": "2025", "media_type": "movie", "media_source": "themoviedb", "media_id": "8"}
    queries = []
    def ai_batch(items):
        adapter.ai_calls += 1
        return {key: ["Correct film 2025"] for key, _ in items}
    adapter.ai_queries_batch = ai_batch
    adapter.search = lambda query: queries.append(query) or ([answer] if query == "Correct film 2025" else [])
    service = G.GovernorService(tmp_path / "state", adapter, ai_enabled=True)
    run_scan(service, inv)
    detail = service.detail(obj["id"])
    assert detail["identity_state"] == "candidate" and detail["identity"] == {}
    assert {candidate["media_id"] for candidate in detail["candidates"]} == {"8"}
    assert queries == ["Film", "Correct film 2025"] and adapter.preview_calls == 0
    service.start = lambda mode, ids: {"accepted": True}
    service.confirm_identity(obj["id"], G.identity_key(answer))
    seen = []
    original_preview = adapter.preview
    adapter.preview = lambda source, identity: seen.append(identity) or original_preview(source, identity)
    result = run_scan(service, inv)
    assert not result["problems"] and not result["confirmations"] and not result["errors"]
    assert seen == [answer] and service.detail(obj["id"])["identity"] == answer
    assert adapter.ai_calls == 1
    # 重复初始化不重复迁移、清空候选或抹掉人工决定。
    saved = service.ledger.one("SELECT * FROM identities")
    service = G.GovernorService(tmp_path / "state", adapter)
    assert service.ledger.one("SELECT * FROM identities") == saved


@pytest.mark.parametrize("change", ["incomplete", "new_fingerprint"])
def test_confirmation_rejects_incomplete_or_replaced_source_evidence(tmp_path, change):
    adapter, obj, inv, _, _, _ = local_fixture(tmp_path)
    service = G.GovernorService(tmp_path / "state", adapter)
    run_scan(service, inv)
    candidate = service.detail(obj["id"])["candidates"][0]
    if change == "incomplete":
        obj["complete"] = False
        run_scan(service, inv)
    else:
        service.ledger.upsert_object({**obj, "fingerprint": "replaced"})
    with pytest.raises(ValueError, match="重新检查|未读取完整"):
        service.confirm_identity(obj["id"], G.identity_key(candidate))


@pytest.mark.parametrize("change", ["automatic", "different_identity", "incomplete_source"])
def test_frozen_repair_cannot_execute_after_confirmation_changes(tmp_path, change):
    adapter, obj, inv, _, _, _ = local_fixture(tmp_path)
    service = G.GovernorService(tmp_path / "state", adapter, read_only=False)
    service.ledger.upsert_object(obj)
    identity = adapter.recognize(obj["root"]["path"])
    service.ledger.save_identity(obj["id"], "confirmed", obj["fingerprint"], identity, [identity], "user_confirmed")
    service.ledger.save_observation(obj["id"], "source", True, obj["fingerprint"], {"object": obj, "histories": []})
    service.ledger.save_observation("__library__", "configuration", True, "cfg", {"roots": inv.library_roots})
    plan = service.repair_preview(obj["id"])
    replacement = {**identity, "media_id": "8"} if change == "different_identity" else identity
    provenance = "native_and_history_agree" if change == "automatic" else "user_confirmed"
    service.ledger.save_identity(obj["id"], "confirmed", obj["fingerprint"], replacement, [replacement], provenance)
    if change == "incomplete_source":
        service.ledger.save_observation(obj["id"], "source", False, obj["fingerprint"], {"object": {**obj, "complete": False}, "histories": []})
    with pytest.raises(ValueError, match="身份|确认|源文件"):
        service.repair_execute(obj["id"], plan["token"])
    assert adapter.rebuild_calls == []


@pytest.mark.parametrize("timing", ["before", "during"])
def test_scanning_never_overwrites_a_newer_human_confirmation(tmp_path, timing):
    adapter, obj, inv, _, _, _ = local_fixture(tmp_path)
    service = G.GovernorService(tmp_path / "state", adapter)
    service.ledger.upsert_object(obj)
    old = adapter.recognize(obj["root"]["path"])
    answer = {**old, "media_id": "8"}
    def save(identity):
        service.ledger.save_identity(obj["id"], "confirmed", obj["fingerprint"], identity, [old, answer], "user_confirmed")
    save(answer if timing == "before" else old)
    original_preview = adapter.preview
    seen = []
    def preview(source, identity):
        seen.append(identity)
        if timing == "during":
            save(answer)
        return original_preview(source, identity)
    adapter.preview = preview
    job = service.ledger.begin_job("incremental")
    stale = ("candidate", {}, [old], "native_and_history_agree")
    if timing == "during":
        with pytest.raises(ValueError, match="核对期间已变化"):
            service._process(job, obj, inv, stale)
        assert service.detail(obj["id"])["preview"] == {}
    else:
        service._process(job, obj, inv, stale)
        assert seen == [answer]
    assert service.detail(obj["id"])["identity"] == answer
