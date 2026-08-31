"""MediaGovernor S3 的零写入观察、聚合与预览闸门测试。"""

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
    """在没有 MoviePilot 宿主的本机环境加载纯标准库治理模块。"""
    spec = importlib.util.spec_from_file_location("mediagovernor_s3_pure", GOVERNOR_SOURCE)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _payload(history_id: int, event_key: str) -> dict[str, object]:
    return {
        "transfer_history_id": history_id,
        "idempotency_key": event_key,
        "mediainfo": {
            "media_source": "tmdb",
            "media_id": "42",
            "type": "电视剧",
            "title": "测试作品",
            "year": "2026",
            "season": "1",
        },
    }


def test_v3_directory_manifest_and_version_contract() -> None:
    """S3 候选版本、索引和类声明必须一致且不可提前发布。"""
    manifest = json.loads((ROOT / "package.v3.json").read_text(encoding="utf-8"))["MediaGovernor"]
    source = SOURCE.read_text(encoding="utf-8")

    assert manifest["version"] == "0.2.0"
    assert manifest["system_version"] == ">=3.0.0"
    assert manifest["release"] is False
    assert "class MediaGovernor(_PluginBase):" in source
    assert 'plugin_version = "0.2.0"' in source


def test_observation_groups_a_work_and_deduplicates_at_least_once_events() -> None:
    """同一规范媒体身份聚为一张卡，重复的历史事件不加倍。"""
    governor = _governor_module()
    queue = governor.GovernanceQueue()
    failed = governor.EventObservation.from_contract("failed", _payload(1001, "k-1"))
    complete = governor.EventObservation.from_contract("complete", _payload(1002, "k-2"))
    duplicate = governor.EventObservation.from_contract("failed", _payload(1001, "k-1"))

    assert failed and complete and duplicate
    assert queue.observe(failed) is True
    assert queue.observe(complete) is True
    assert queue.observe(duplicate) is False

    items = queue.public_items()
    assert len(items) == 1
    assert items[0]["status"] == "needs_review"
    assert items[0]["event_count"] == 2
    assert items[0]["failure_count"] == 1
    assert items[0]["success_count"] == 1
    assert "path" not in queue.to_data()["packages"][items[0]["package_id"]]
    assert queue.allows_preview(1001) is True
    assert queue.allows_preview(1002) is False


def test_observation_without_stable_dedup_identity_is_refused() -> None:
    """不能退化为源路径去重，缺少历史号和事件键时不入队。"""
    governor = _governor_module()
    assert governor.EventObservation.from_contract("failed", {"mediainfo": {"title": "测试"}}) is None


def test_native_preview_gateway_forces_link_preview_and_hides_result_paths() -> None:
    """任何预览调用都固定为 link + preview，结果也不回传路径。"""
    governor = _governor_module()
    calls: list[dict[str, object]] = []

    class FakeChain:
        def manual_transfer(self, **kwargs):
            calls.append(kwargs)
            return True, {"dest": "/sensitive/library/file.mkv"}

    fileitem = object()
    result = governor.NativePreviewGateway(FakeChain).preview(fileitem)

    assert len(calls) == 1
    assert calls[0] == {
        "fileitem": fileitem,
        "transfer_type": "link",
        "preview": True,
        "background": False,
        "force": False,
        "scrape": False,
        "reorganize": False,
        "sync_extra_files": False,
    }
    assert result == {"mode": "preview", "transfer_type": "link", "ok": True, "detail": "preview_ready"}
    assert "dest" not in result


def test_s3_uses_only_public_contracts_and_has_no_execution_api() -> None:
    """禁止 ORM/legacy/私有核心导入；仅公开只读队列 API。"""
    source = SOURCE.read_text(encoding="utf-8")
    tree = ast.parse(source)
    modules = {node.module or "" for node in ast.walk(tree) if isinstance(node, ast.ImportFrom)}

    assert {"app.plugins", "app.sdk.events", "app.schemas.types", "app.db.oper.transferhistory"} <= modules
    assert not any(module.startswith(("app.core.", "app.helper.", "app.utils.", "app.db.models", "app.sdk._legacy")) for module in modules)
    assert '"path": "/packages"' in source
    assert '"methods": ["GET"]' in source
    assert '"path": "/packages/{history_id}/preview"' in source
    assert '"methods": ["POST"]' in source
    assert "history_not_in_failure_queue" in source
    assert "history_not_previewable" in source
    assert "def do_transfer" not in source
    assert "preview=True" in GOVERNOR_SOURCE.read_text(encoding="utf-8")
    assert 'transfer_type="link"' in GOVERNOR_SOURCE.read_text(encoding="utf-8")
