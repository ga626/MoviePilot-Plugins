"""MediaGovernor 产品合同：只读对账、问题状态与零写入预演计划。"""

from __future__ import annotations

import ast
import importlib.util
import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "plugins.v3/mediagovernor/__init__.py"
GOVERNOR_SOURCE = ROOT / "plugins.v3/mediagovernor/governor.py"


def _governor_module():
    spec = importlib.util.spec_from_file_location("mediagovernor_product", GOVERNOR_SOURCE)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _payload(history_id: int, event_key: str, *, mode: str | None = "link", title: str = "测试作品") -> dict[str, object]:
    payload: dict[str, object] = {"transfer_history_id": history_id, "idempotency_key": event_key, "mediainfo": {"media_source": "tmdb", "media_id": "42", "type": "电视剧", "title": title, "year": "2026", "season": "1"}}
    if mode is not None:
        payload["transfer_type"] = mode
    return payload


def test_v3_manifest_version_and_frontend_contract() -> None:
    manifest = json.loads((ROOT / "package.v3.json").read_text(encoding="utf-8"))["MediaGovernor"]
    source = SOURCE.read_text(encoding="utf-8")
    assert manifest["version"] == "0.8.1"
    assert manifest["release"] is True
    assert 'plugin_version = "0.8.1"' in source
    assert 'return "vue", "dist/v0.8.1/assets"' in source
    assert "def get_sidebar_nav" in source
    assert 'return []' in source
    assets = ROOT / "plugins.v3/mediagovernor/dist/v0.8.1/assets"
    assert (assets / "remoteEntry.js").is_file()
    frontend = (ROOT / "plugins.v3/mediagovernor/src/components/AppPage.vue").read_text(encoding="utf-8")
    assert "再次检查全部" in frontend
    assert "检查范围已变化" in frontend
    assert "查看详细结论" in frontend
    assert "待确认影片" not in frontend
    assert '"path": "/audit"' in source
    assert '"path": "/audit/resume"' in source
    assert '"path": "/audit/next"' in source
    assert '"path": "/audit/batch"' in source
    assert "audit/batch" in frontend
    assert "discovery_state" in frontend
    assert '"state": "paused" if is_paused else "running"' in source
    assert '"discovery_state": "paused" if is_paused else "discovering"' in source
    built_pages = list(assets.glob("__federation_expose_AppPage-*.js"))
    assert len(built_pages) == 1 and "discovery_state" in built_pages[0].read_text(encoding="utf-8")
    assert "暂停检查" in frontend and "进度条" not in frontend


def test_batch_audit_hides_unchecked_records_and_keeps_only_safe_identity() -> None:
    governor = _governor_module()
    audit = governor.BatchAudit()
    assert audit.summary([21]) == {"state": "idle", "total": 1, "checked": 0, "pending": 1, "run_total": 0, "run_checked": 0, "scope_changed": False, "actionable": 0, "ready_for_preview": 0, "needs_attention": 0, "unresolved": 0, "blocked": 0, "history_info": 0, "current_history_id": None}
    assert audit.public_items([21]) == []
    record = audit.record(21, {"title": "示例作品", "year": "2026", "media_source": "tmdb", "media_id": "42", "media_type": "电视剧"}, {"ok": True}, checked_at=100)
    assert record["status"] == "ready_to_plan"
    assert audit.summary([21])["state"] == "complete"
    assert audit.public_items([21])[0]["title"] == "示例作品"
    saved = json.dumps(audit.to_data(), ensure_ascii=False)
    assert "path" not in saved and "src_fileitem" not in saved


def test_batch_audit_claims_one_item_at_a_time_and_recovers_an_interrupted_item() -> None:
    governor = _governor_module()
    audit = governor.BatchAudit()
    assert audit.start([31, 32], now=100)["state"] == "running"
    assert audit.claim_next() == 31
    assert audit.summary([31, 32])["current_history_id"] == 31
    restored = governor.BatchAudit.from_data(audit.to_data())
    assert restored.summary([31, 32])["pending"] == 2
    assert restored.claim_next() == 31


def test_batch_audit_pause_and_resume_preserves_completed_results() -> None:
    governor = _governor_module()
    audit = governor.BatchAudit()
    audit.start([41, 42], now=100)
    assert audit.claim_next() == 41
    audit.record(41, {"title": "作品甲", "media_source": "tmdb", "media_id": "1", "media_type": "电影"}, {"ok": True}, checked_at=101)
    assert audit.pause()["state"] == "paused"
    resumed = audit.resume_or_start([41, 42], now=102)
    assert resumed["state"] == "running" and resumed["checked"] == 1
    assert audit.claim_next() == 42


def test_batch_audit_can_start_a_fresh_run_after_completion() -> None:
    governor = _governor_module()
    audit = governor.BatchAudit()
    audit.start([51], now=100)
    audit.record(51, {"title": "作品甲", "media_source": "tmdb", "media_id": "1", "media_type": "电影"}, checked_at=101)
    assert audit.summary([51])["state"] == "complete"
    restarted = audit.start([51], now=102)
    assert restarted["state"] == "running"
    assert restarted["checked"] == 0


def test_completed_audit_never_claims_new_history_was_checked_after_upgrade() -> None:
    governor = _governor_module()
    audit = governor.BatchAudit()
    audit.start([51], now=100)
    audit.record(51, {"title": "旧记录", "media_source": "tmdb", "media_id": "51", "media_type": "电影"}, checked_at=101)

    # 模拟升级后，宿主读取到比旧轮次更多的历史记录：保留旧结论，但不把
    # 447/1795 这类状态显示为“已完成全部”。
    summary = audit.summary([51, 52])
    assert summary["state"] == "stale"
    assert summary["scope_changed"] is True
    assert summary["run_checked"] == summary["run_total"] == 1
    assert summary["checked"] == 1 and summary["total"] == 2
    assert audit.resume([51, 52])["state"] == "stale"

    restarted = audit.start([51, 52], now=102)
    assert restarted["state"] == "running"
    assert restarted["checked"] == 0 and restarted["total"] == 2


def test_batch_audit_defers_hardlink_preview_until_the_user_opens_one_record() -> None:
    governor = _governor_module()
    audit = governor.BatchAudit()
    audit.record(24, {"title": "已识别作品", "media_source": "tmdb", "media_id": "44", "media_type": "电影"}, checked_at=100)
    assert audit.public_items([24])[0]["findings"][0]["status"] == "needs_preview"
    assert audit.summary([24])["ready_for_preview"] == 1
    updated = audit.record_preview(24, {"ok": True, "detail": "preview_ready"})
    assert updated and updated["status"] == "ready_to_plan"


def test_failed_history_identity_is_reused_and_slow_work_is_limited_to_a_single_next_item() -> None:
    governor = _governor_module()
    queue = governor.GovernanceQueue()
    failed = governor.EventObservation.from_contract("failed", _payload(25, "reused"))
    assert failed and queue.observe(failed)
    assert queue.identity_for_history(25) == {
        "title": "测试作品", "year": "2026", "media_source": "tmdb", "media_id": "42", "media_type": "电视剧",
    }
    source = SOURCE.read_text(encoding="utf-8")
    start_source = source[source.index("def audit_all"):source.index("def resume_audit")]
    next_source = source[source.index("def _audit_one"):source.index("def _audit_some")]
    assert "MediaChain" not in start_source and "preview_hardlink" not in start_source
    assert "MediaChain" in next_source and "preview_hardlink" in next_source
    assert "def audit_batch" in source


def test_batch_audit_only_exposes_unresolved_after_real_check() -> None:
    governor = _governor_module()
    audit = governor.BatchAudit()
    audit.record(22, None, checked_at=100)
    audit.record(23, {"title": "已识别作品", "media_source": "tmdb", "media_id": "43", "media_type": "电影"}, {"ok": False}, checked_at=100)
    records = audit.public_items([22, 23])
    assert [record["findings"][0]["status"] for record in records] == ["preview_rejected"]
    assert audit.summary([22, 23])["unresolved"] == 1


def test_complete_event_is_verified_only_with_identity_and_link_mode() -> None:
    governor = _governor_module()
    queue = governor.GovernanceQueue()
    complete = governor.EventObservation.from_contract("complete", _payload(1, "done"))
    assert complete and queue.observe(complete)
    item = queue.public_items()[0]
    assert item["status"] == "verified"
    assert item["reason_codes"] == []


def test_successful_history_uses_history_mode_without_creating_a_false_problem_card() -> None:
    governor = _governor_module()
    queue = governor.GovernanceQueue()
    complete = governor.EventObservation.from_contract("complete", _payload(7, "success", mode="copy"), {"mode": "link"})
    assert complete and queue.observe(complete)
    context = queue.history_context(7)
    assert context and context["event_kind"] == "complete"
    assert context["transfer_mode"] == "copy"
    audit = governor.BatchAudit()
    audit.start(queue.auditable_history_ids(), now=100)
    assert audit.claim_next() == 7
    result = audit.record_complete_quality(7, context["identity"], context["transfer_mode"], checked_at=101)
    assert result["status"] == "historical_method_note"
    assert audit.public_items([7]) == []
    assert audit.summary([7])["history_info"] == 1


def test_batch_audit_groups_multiple_history_records_by_media_identity() -> None:
    governor = _governor_module()
    audit = governor.BatchAudit()
    audit.start([61, 62], now=100)
    identity = {"title": "同一部剧", "year": "2026", "media_source": "tmdb", "media_id": "61", "media_type": "电视剧"}
    audit.record_complete_quality(61, identity, "copy", checked_at=101)
    audit.record_complete_quality(62, identity, "copy", checked_at=102)
    cards = audit.public_items([61, 62])
    assert cards == []
    assert audit.summary([61, 62])["history_info"] == 2


def test_group_exposes_only_failed_records_as_repair_candidates() -> None:
    governor = _governor_module()
    audit = governor.BatchAudit()
    identity = {"title": "可补建作品", "media_source": "tmdb", "media_id": "71", "media_type": "电影"}
    audit.record(71, identity, checked_at=100)
    audit.record_complete_quality(72, identity, "copy", checked_at=101)
    cards = audit.public_items([71, 72])
    assert len(cards) == 1
    assert cards[0]["record_count"] == 1 and cards[0]["repairable_history_ids"] == [71]


def test_unknown_or_non_link_history_is_information_not_an_explicit_problem_state() -> None:
    governor = _governor_module()
    queue = governor.GovernanceQueue()
    unknown = governor.EventObservation.from_contract("complete", _payload(2, "unknown", mode=None))
    copied = governor.EventObservation.from_contract("complete", _payload(3, "copied", mode="copy", title="另一作品"))
    assert unknown and copied
    queue.observe(unknown); queue.observe(copied)
    states = {item["title"]: (item["status"], item["reason_codes"]) for item in queue.public_items()}
    assert states["测试作品"] == ("awaiting_host_information", ["missing_transfer_mode"])
    assert states["另一作品"] == ("verified", [])


def test_history_mode_is_read_from_the_real_moviepilot_field() -> None:
    governor = _governor_module()
    observation = governor.EventObservation.from_contract(
        "complete",
        {"transfer_history_id": 88, "mediainfo": {"media_source": "tmdb", "media_id": "88", "type": "电影", "title": "字段测试"}},
        {"mode": "link"},
    )
    assert observation and observation.transfer_mode == "link"


def test_file_package_evidence_only_reports_a_real_source_target_difference() -> None:
    governor = _governor_module()
    summary = governor.build_file_summary(
        ["Series.S01E01.mkv", "Series.S01E02.mkv", "Series.S01E01.ass"],
        ["Series.S01E01.mkv", "Series.S01E01.ass"],
        source_exists=True,
        target_exists=True,
    )
    assert governor.classify_file_summary(summary) == ("file_set_incomplete", "源包检测到 2 个视频，目标仅检测到 1 个")
    target_missing = governor.build_file_summary(["Film.mkv"], [], source_exists=True, target_exists=False)
    assert governor.classify_file_summary(target_missing)[0] == "target_missing"
    moved_source = governor.build_file_summary([], ["Film.mkv"], source_exists=False, target_exists=True)
    assert governor.classify_file_summary(moved_source) is None


def test_complete_history_card_uses_file_package_evidence_and_groups_by_work() -> None:
    governor = _governor_module()
    audit = governor.BatchAudit()
    identity = {"title": "完整性测试", "media_source": "tmdb", "media_id": "99", "media_type": "电视剧"}
    record = audit.record_complete_quality(
        99,
        identity,
        "link",
        file_summary={"source_exists": True, "target_exists": True, "source_video_count": 3, "target_video_count": 2, "source_subtitle_count": 0, "target_subtitle_count": 0, "source_episodes": [1, 2, 3], "target_episodes": [1, 2]},
        checked_at=100,
    )
    assert record["status"] == "file_set_incomplete"
    card = audit.public_items([99])[0]
    assert card["title"] == "完整性测试" and card["repairable_history_ids"] == [99]
    assert card["file_summary"]["source_video_count"] == 3


def test_v074_records_are_discarded_and_must_be_checked_again() -> None:
    governor = _governor_module()
    restored = governor.BatchAudit.from_data({
        "schema": "mediagovernor-batch-audit/v3",
        "records": {"91": {"history_id": 91, "status": "transfer_mode_unknown"}},
        "run": {"state": "complete", "history_ids": [91]},
    })
    assert restored.summary([91])["checked"] == 0
    assert restored.public_items([91]) == []


def test_failed_history_can_generate_an_expiring_zero_write_plan() -> None:
    governor = _governor_module()
    queue = governor.GovernanceQueue()
    failed = governor.EventObservation.from_contract("failed", _payload(10, "failed"))
    assert failed and queue.observe(failed)
    plan = queue.record_preview(10, {"ok": True, "detail": "preview_ready"}, now=100)
    assert plan and plan["mode"] == "preview" and plan["transfer_type"] == "link"
    assert queue.public_plan(plan["plan_id"], now=999)["status"] == "ready"
    assert queue.public_plan(plan["plan_id"], now=1000)["status"] == "expired"


def test_preview_plan_only_persists_a_target_fingerprint_not_a_target_path() -> None:
    governor = _governor_module()
    queue = governor.GovernanceQueue()
    failed = governor.EventObservation.from_contract("failed", _payload(12, "target"))
    assert failed and queue.observe(failed)
    plan = queue.record_preview(12, {"ok": True}, target_label="动画", target_fingerprint="a" * 32, now=100)
    assert plan and plan["target_label"] == "动画" and plan["target_fingerprint"] == "a" * 32
    assert "target_path" not in plan and "target_storage" not in plan
    saved = json.dumps(queue.to_data(), ensure_ascii=False)
    assert "path" not in saved and "src_fileitem" not in saved


def test_dynamic_target_contract_rejects_stale_or_unconfigured_target() -> None:
    source = SOURCE.read_text(encoding="utf-8")
    assert "def _target_is_currently_configured" in source
    assert "target_not_currently_configured" in source
    assert "DirectoryHelper().get_library_dirs()" in source
    assert "def audit_batch(self, limit: int = 25)" in source


def test_failed_history_records_a_path_free_preview_outcome_even_when_rejected() -> None:
    governor = _governor_module()
    queue = governor.GovernanceQueue()
    failed = governor.EventObservation.from_contract("failed", _payload(11, "rejected"))
    assert failed and queue.observe(failed)
    outcome = queue.record_preview_outcome(11, {"ok": False, "detail": "preview_rejected"}, now=100)
    item = queue.public_items()[0]
    assert outcome == {"history_id": 11, "status": "rejected", "mode": "preview", "transfer_type": "link", "checked_at": 100, "detail": "preview_rejected"}
    assert item["last_preview"] == outcome
    assert "path" not in json.dumps(queue.to_data(), ensure_ascii=False)


def test_rejected_new_check_supersedes_old_ready_plan() -> None:
    governor = _governor_module()
    queue = governor.GovernanceQueue()
    failed = governor.EventObservation.from_contract("failed", _payload(13, "stale-plan"))
    assert failed and queue.observe(failed)
    plan = queue.record_preview(13, {"ok": True, "detail": "preview_ready"}, now=100)
    assert plan and queue.public_plan(plan["plan_id"], now=101)["status"] == "ready"
    queue.record_preview_outcome(13, {"ok": False, "detail": "preview_rejected"}, now=101)
    assert queue.public_plan(plan["plan_id"], now=102)["status"] == "superseded"
    assert queue.begin_repair(plan["plan_id"], now=102) is None


def test_a_new_successful_check_replaces_an_older_ready_plan() -> None:
    governor = _governor_module()
    queue = governor.GovernanceQueue()
    failed = governor.EventObservation.from_contract("failed", _payload(14, "newer-plan"))
    assert failed and queue.observe(failed)
    first = queue.record_preview(14, {"ok": True, "detail": "preview_ready"}, now=100)
    assert first and queue.record_preview_outcome(14, {"ok": True, "detail": "preview_ready"}, now=101)
    second = queue.record_preview(14, {"ok": True, "detail": "preview_ready"}, now=102)
    assert second and second["plan_id"] != first["plan_id"]
    assert queue.public_plan(first["plan_id"], now=102)["status"] == "superseded"
    assert queue.public_plan(second["plan_id"], now=102)["status"] == "ready"
    assert queue.begin_repair(first["plan_id"], now=102) is None


def test_identity_conflict_never_becomes_automatic_repair() -> None:
    governor = _governor_module()
    queue = governor.GovernanceQueue()
    first = governor.EventObservation.from_contract("complete", _payload(20, "same", title="作品甲"))
    changed = governor.EventObservation.from_contract("complete", _payload(20, "same", title="作品乙"))
    assert first and changed
    queue.observe(first)
    assert queue.observe(changed) is True
    item = queue.public_items()[0]
    assert item["status"] == "needs_selection"
    assert "identity_conflict" in item["reason_codes"]


def test_preview_and_confirmed_repair_gate_keep_transfer_options_fixed() -> None:
    governor = _governor_module()
    calls: list[dict[str, object]] = []
    class FakeChain:
        def manual_transfer(self, **kwargs):
            calls.append(kwargs); return True, {"dest": "/sensitive/library/file.mkv"}
    result = governor.NativePreviewGateway(FakeChain).preview(object())
    assert calls[0]["transfer_type"] == "link" and calls[0]["preview"] is True
    assert result["ok"] is True and "dest" not in result
    repaired = governor.NativePreviewGateway(FakeChain).repair(object())
    assert calls[1]["transfer_type"] == "link" and calls[1]["preview"] is False
    assert calls[1]["force"] is False and calls[1]["reorganize"] is False
    assert repaired["ok"] is True and "dest" not in repaired
    tree = ast.parse(SOURCE.read_text(encoding="utf-8"))
    modules = {node.module or "" for node in ast.walk(tree) if isinstance(node, ast.ImportFrom)}
    assert not any(module.startswith(("app.core.", "app.helper.", "app.utils.", "app.db.models", "app.sdk._legacy")) for module in modules)
    source = SOURCE.read_text(encoding="utf-8")
    assert '"path": "/plans"' in source and '"path": "/plans/{plan_id}/repair"' in source
    assert "def do_transfer" not in source


def test_repair_requires_a_ready_unexpired_plan_and_records_no_path() -> None:
    governor = _governor_module()
    queue = governor.GovernanceQueue()
    failed = governor.EventObservation.from_contract("failed", _payload(12, "repairable"))
    assert failed and queue.observe(failed)
    plan = queue.record_preview(12, {"ok": True, "detail": "preview_ready"}, now=100)
    assert plan
    started = queue.begin_repair(plan["plan_id"], now=101)
    assert started and started["status"] == "executing"
    assert queue.begin_repair(plan["plan_id"], now=102) is None
    completed = queue.complete_repair(plan["plan_id"], {"ok": True, "detail": "repair_completed"}, now=103)
    assert completed and completed["status"] == "completed"
    assert "path" not in json.dumps(queue.to_data(), ensure_ascii=False)
