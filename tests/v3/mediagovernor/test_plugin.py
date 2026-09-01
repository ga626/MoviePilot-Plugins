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
    assert manifest["version"] == "0.6.0"
    assert manifest["release"] is True
    assert 'plugin_version = "0.6.0"' in source
    assert 'return "vue", "dist/assets"' in source
    assert "def get_sidebar_nav" in source
    assert 'return []' in source
    assert (ROOT / "plugins.v3/mediagovernor/dist/assets/remoteEntry.js").is_file()


def test_complete_event_is_verified_only_with_identity_and_link_mode() -> None:
    governor = _governor_module()
    queue = governor.GovernanceQueue()
    complete = governor.EventObservation.from_contract("complete", _payload(1, "done"))
    assert complete and queue.observe(complete)
    item = queue.public_items()[0]
    assert item["status"] == "verified"
    assert item["reason_codes"] == []
    assert queue.public_summary()["verified"] == 1


def test_unknown_or_non_link_result_becomes_explicit_problem_state() -> None:
    governor = _governor_module()
    queue = governor.GovernanceQueue()
    unknown = governor.EventObservation.from_contract("complete", _payload(2, "unknown", mode=None))
    copied = governor.EventObservation.from_contract("complete", _payload(3, "copied", mode="copy", title="另一作品"))
    assert unknown and copied
    queue.observe(unknown); queue.observe(copied)
    states = {item["title"]: (item["status"], item["reason_codes"]) for item in queue.public_items()}
    assert states["测试作品"] == ("awaiting_host_information", ["missing_transfer_mode"])
    assert states["另一作品"] == ("needs_attention", ["unexpected_transfer_mode"])


def test_failed_history_can_generate_an_expiring_zero_write_plan() -> None:
    governor = _governor_module()
    queue = governor.GovernanceQueue()
    failed = governor.EventObservation.from_contract("failed", _payload(10, "failed"))
    assert failed and queue.observe(failed)
    plan = queue.record_preview(10, {"ok": True, "detail": "preview_ready"}, now=100)
    assert plan and plan["mode"] == "preview" and plan["transfer_type"] == "link"
    assert queue.public_plan(plan["plan_id"], now=999)["status"] == "ready"
    assert queue.public_plan(plan["plan_id"], now=1000)["status"] == "expired"
    saved = json.dumps(queue.to_data(), ensure_ascii=False)
    assert "path" not in saved and "src_fileitem" not in saved


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
