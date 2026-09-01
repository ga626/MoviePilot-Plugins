"""MoviePilot V3 MediaGovernor 的 S3：默认关闭的观察、队列与预览。"""

from __future__ import annotations

from typing import Any

from app.db.oper.transferhistory import TransferHistoryOper
from app.plugins import _PluginBase
from app.schemas.types import EventType
from app.sdk.events import Event, eventmanager, snapshot_event_data

from .governor import EventObservation, GovernanceQueue, NativePreviewGateway


class MediaGovernor(_PluginBase):
    """以通用事件归并发现问题，绝不替代 MoviePilot 的原生整理器。"""

    plugin_name = "媒体治理（S3 增量观察与预览）"
    plugin_desc = "默认关闭：只观察启用后的整理结果；既有失败历史仅可显式一次性回溯。"
    plugin_icon = "Moviepilot_A.png"
    plugin_version = "0.3.5"
    plugin_author = "MoviePilotMediaGovernor contributors"
    author_url = ""
    plugin_config_prefix = "mediagovernor_"
    plugin_order = 99
    auth_level = 1

    _QUEUE_KEY = "s3_queue"
    _AUDIT_KEY = "s3_audit"
    _AUDIT_PAGE_SIZE = 100
    _AUDIT_PAGES_PER_RUN = 5
    _enabled = False
    _backfill_existing_failures = False

    def init_plugin(self, config: dict[str, Any] | None = None) -> None:
        """默认仅观察启用后的事件；历史回溯必须由用户显式请求一次。"""
        config = config or {}
        self._enabled = bool(config.get("enabled"))
        self._backfill_existing_failures = bool(config.get("backfill_existing_failures"))
        self._queue = GovernanceQueue.from_data(self.get_data(self._QUEUE_KEY)) if self._enabled else GovernanceQueue()
        self._audit = self.get_data(self._AUDIT_KEY) if self._enabled else {}
        if self._enabled and self._backfill_existing_failures:
            self.reconcile_history()
        elif self._enabled:
            self._audit = {
                "schema": "mediagovernor-s3-audit/v1",
                "state": "incremental_only",
                "detail": "historical_backfill_disabled",
            }
            self.save_data(self._AUDIT_KEY, self._audit)

    def get_state(self) -> bool:
        """当前实例被显式启用时才观察事件。"""
        return self._enabled

    @staticmethod
    def get_command() -> list[dict[str, Any]]:
        """S3 不注册远程命令，避免把预览误变成执行入口。"""
        return []

    def get_api(self) -> list[dict[str, Any]]:
        """提供已脱敏的队列查询和受限的零写入预览。"""
        return [
            {
                "path": "/packages",
                "endpoint": self.get_packages,
                "methods": ["GET"],
                "auth": "bear",
                "summary": "查询媒体治理观察队列",
            },
            {
                "path": "/packages/{history_id}/preview",
                "endpoint": self.preview_history,
                "methods": ["POST"],
                "auth": "bear",
                "summary": "预览队列中的失败整理（不执行）",
            },
        ]

    def get_packages(self) -> dict[str, Any]:
        """返回作品包卡片；绝不返回源/目标路径或 FileItem。"""
        queue = getattr(self, "_queue", GovernanceQueue())
        return {
            "items": queue.public_items(),
            "mode": "observe_preview",
            "enabled": self.get_state(),
            "history_audit": getattr(self, "_audit", {}),
        }

    def get_service(self) -> list[dict[str, Any]]:
        """仅在显式的一次性回溯尚未完成时补扫失败历史。"""
        state = getattr(self, "_audit", {})
        if (
            not self.get_state()
            or not self._backfill_existing_failures
            or not isinstance(state, dict)
            or state.get("state") in {"complete", "unsupported_host_contract"}
        ):
            return []
        return [
            {
                "id": "MediaGovernor.HistoryReconcile",
                "name": "媒体治理失败历史只读回溯",
                "trigger": "interval",
                "func": self.reconcile_history,
                "kwargs": {"minutes": 15},
            }
        ]

    def get_form(self) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        """明确说明开关只控制观察，不开启真实整理。"""
        return [
            {
                "component": "VForm",
                "content": [
                    {
                        "component": "VSwitch",
                        "props": {"model": "enabled", "label": "启用 S3 观察与预览候选"},
                    },
                    {
                        "component": "VAlert",
                        "props": {
                            "type": "warning",
                            "variant": "tonal",
                            "text": "默认只观察启用后的整理完成/失败事件并建立脱敏队列；不会移动、改名、删除、重试或创建硬链接。",
                        },
                    },
                    {
                        "component": "VSwitch",
                        "props": {
                            "model": "backfill_existing_failures",
                            "label": "一次性回溯既有失败历史（会读取旧记录）",
                        },
                    },
                    {
                        "component": "VAlert",
                        "props": {
                            "type": "info",
                            "variant": "tonal",
                            "text": "默认关闭历史回溯。仅在没有可继承基线时显式开启；回溯完成后自动停止，不会每 15 分钟重复扫描旧历史。",
                        },
                    },
                ],
            }
        ], {"enabled": False, "backfill_existing_failures": False}

    def get_page(self) -> list[dict[str, Any]]:
        """以最小页面呈现 S3 的状态与队列，不泄露路径。"""
        state = "已启用观察" if self.get_state() else "默认关闭"
        return [
            {
                "component": "VAlert",
                "props": {
                    "type": "info",
                    "variant": "tonal",
                    "text": f"S3 当前{state}。仅归并整理结果；真实整理入口在本版本中不存在。"
                    "历史回溯默认关闭，只有显式开启时才会进行一次性只读回溯。",
                },
            },
            {
                "component": "VDataTable",
                "props": {
                    "headers": [
                        {"title": "作品", "key": "title"},
                        {"title": "状态", "key": "status"},
                        {"title": "成功", "key": "success_count"},
                        {"title": "失败", "key": "failure_count"},
                    ],
                    "items": self.get_packages()["items"],
                    "itemsPerPage": 20,
                },
            },
        ]

    @eventmanager.register(EventType.TransferComplete)
    def on_transfer_complete(self, event: Event) -> None:
        """观察完成事件；停用时立即返回。"""
        self._observe("complete", EventType.TransferComplete, event)

    @eventmanager.register(EventType.TransferFailed)
    def on_transfer_failed(self, event: Event) -> None:
        """观察失败事件；停用时立即返回。"""
        self._observe("failed", EventType.TransferFailed, event)

    def _observe(self, event_kind: str, event_type: EventType, event: Event) -> None:
        """按稳定合同快照和单条只读历史更新插件自己的队列。"""
        if not self.get_state():
            return
        snapshot = snapshot_event_data(event_type, event.event_data)
        if not snapshot.valid or snapshot.payload is None:
            return
        history_id = getattr(snapshot.payload, "transfer_history_id", None)
        history = TransferHistoryOper().get(history_id) if isinstance(history_id, int) else None
        observation = EventObservation.from_contract(event_kind, snapshot.payload, history)
        if observation is None:
            return
        queue = getattr(self, "_queue", GovernanceQueue())
        if queue.observe(observation):
            self._queue = queue
            self.save_data(self._QUEUE_KEY, queue.to_data())

    def reconcile_history(self, minutes: int | None = None) -> None:
        """显式的一次性失败历史回溯；完成后永久停止，不重复扫旧账。"""
        del minutes
        if not self.get_state() or not self._backfill_existing_failures:
            return
        state = getattr(self, "_audit", {})
        if isinstance(state, dict) and state.get("state") in {"complete", "unsupported_host_contract"}:
            return
        query_contract = self._history_query_contract()
        if query_contract is None:
            self._audit = {
                "schema": "mediagovernor-s3-audit/v1",
                "state": "unsupported_host_contract",
                "detail": "history_query_unavailable",
            }
            self.save_data(self._AUDIT_KEY, self._audit)
            return
        QueryPageRequest, QuerySort, QuerySortDirection, QuerySortField, TransferHistoryFilter = query_contract
        next_page = state.get("next_page", 1) if isinstance(state, dict) else 1
        page_number = next_page if isinstance(next_page, int) and next_page > 0 else 1
        queue = getattr(self, "_queue", GovernanceQueue())
        processed = 0
        try:
            for _ in range(self._AUDIT_PAGES_PER_RUN):
                histories, total = TransferHistoryOper().query(
                    filters=TransferHistoryFilter(status=False),
                    page=QueryPageRequest(
                        page=page_number,
                        count=self._AUDIT_PAGE_SIZE,
                        sort=QuerySort(field=QuerySortField.ID, direction=QuerySortDirection.DESC),
                    ),
                )
                for history in histories:
                    if queue.observe_failed_history(history):
                        processed += 1
                if not histories or page_number * self._AUDIT_PAGE_SIZE >= total:
                    page_number = 1
                    complete = True
                    break
                page_number += 1
                complete = False
            else:
                complete = False
        except Exception:
            self._audit = {"schema": "mediagovernor-s3-audit/v1", "state": "retry_pending"}
            self.save_data(self._AUDIT_KEY, self._audit)
            return

        self._queue = queue
        self._audit = {
            "schema": "mediagovernor-s3-audit/v1",
            "state": "complete" if complete else "in_progress",
            "next_page": page_number,
            "added_packages": processed,
        }
        self.save_data(self._QUEUE_KEY, queue.to_data())
        self.save_data(self._AUDIT_KEY, self._audit)

    @staticmethod
    def _history_query_contract() -> tuple[Any, Any, Any, Any, Any] | None:
        """按需读取较新 V3 的历史分页合同，避免旧稳定宿主在加载期失败。"""
        try:
            from app.schemas.query import (
                QueryPageRequest,
                QuerySort,
                QuerySortDirection,
                QuerySortField,
                TransferHistoryFilter,
            )
        except ModuleNotFoundError as exc:
            if exc.name == "app.schemas.query":
                return None
            raise
        return QueryPageRequest, QuerySort, QuerySortDirection, QuerySortField, TransferHistoryFilter

    @staticmethod
    def _transfer_chain() -> Any:
        """延迟导入官方 Chain，避免插件加载阶段产生整理行为。"""
        from app.chain.transfer import TransferChain

        return TransferChain()

    def preview_hardlink(self, fileitem: Any) -> dict[str, str | bool]:
        """内部受限预览适配器；没有对外 API、命令或真实整理分支。"""
        if not self.get_state():
            return {"mode": "preview", "transfer_type": "link", "ok": False, "detail": "plugin_disabled"}
        return NativePreviewGateway(self._transfer_chain).preview(fileitem)

    def preview_history(self, history_id: int) -> dict[str, str | bool]:
        """仅预览本插件已观察到的失败记录，临时读取源文件项且不保留路径。"""
        queue = getattr(self, "_queue", GovernanceQueue())
        if not self.get_state():
            return {"mode": "preview", "transfer_type": "link", "ok": False, "detail": "plugin_disabled"}
        if not queue.allows_preview(history_id):
            return {"mode": "preview", "transfer_type": "link", "ok": False, "detail": "history_not_in_failure_queue"}
        history = TransferHistoryOper().get(history_id)
        if history is None or getattr(history, "status", None) is True:
            return {"mode": "preview", "transfer_type": "link", "ok": False, "detail": "history_not_previewable"}
        raw_fileitem = getattr(history, "src_fileitem", None)
        if not isinstance(raw_fileitem, dict):
            return {"mode": "preview", "transfer_type": "link", "ok": False, "detail": "history_fileitem_unavailable"}
        from app.schemas.file import FileItem

        return self.preview_hardlink(FileItem(**raw_fileitem))

    def stop_service(self) -> None:
        """无后台任务；停用后仅清理内存态，保留插件自身的队列证据。"""
        self._enabled = False
        self._queue = GovernanceQueue()
