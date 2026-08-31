"""MoviePilot V3 MediaGovernor 的 S3：默认关闭的观察、队列与预览。"""

from __future__ import annotations

from typing import Any

from app.db.oper.transferhistory import TransferHistoryOper
from app.plugins import _PluginBase
from app.schemas.query import QueryPageRequest, QuerySort, QuerySortDirection, QuerySortField, TransferHistoryFilter
from app.schemas.types import EventType
from app.sdk.events import Event, eventmanager, snapshot_event_data

from .governor import EventObservation, GovernanceQueue, NativePreviewGateway


class MediaGovernor(_PluginBase):
    """以通用事件归并发现问题，绝不替代 MoviePilot 的原生整理器。"""

    plugin_name = "媒体治理（S3 全量审计与预览）"
    plugin_desc = "默认关闭：回溯失败整理历史、归并诊断队列，并可作零写入硬链接预览。"
    plugin_icon = "Moviepilot_A.png"
    plugin_version = "0.3.1"
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

    def init_plugin(self, config: dict[str, Any] | None = None) -> None:
        """仅在启用后恢复插件自身的脱敏队列，不创建后台任务。"""
        self._enabled = bool((config or {}).get("enabled"))
        self._queue = GovernanceQueue.from_data(self.get_data(self._QUEUE_KEY)) if self._enabled else GovernanceQueue()
        self._audit = self.get_data(self._AUDIT_KEY) if self._enabled else {}
        if self._enabled:
            self.reconcile_history()

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
        """每 15 分钟只读补扫一批失败历史，直至覆盖全部历史页。"""
        if not self.get_state():
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
                            "text": "启用后只观察整理完成/失败事件并建立脱敏队列；不会移动、改名、删除、重试或创建硬链接。",
                        },
                    },
                ],
            }
        ], {"enabled": False}

    def get_page(self) -> list[dict[str, Any]]:
        """以最小页面呈现 S3 的状态与队列，不泄露路径。"""
        state = "已启用观察" if self.get_state() else "默认关闭"
        return [
            {
                "component": "VAlert",
                "props": {
                    "type": "info",
                    "variant": "tonal",
                    "text": f"S3 当前{state}。仅归并整理结果；真实整理入口在本版本中不存在。",
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
        """分批读取失败历史；任何错误只标记稍后重试，不影响宿主整理流程。"""
        del minutes
        if not self.get_state():
            return
        state = getattr(self, "_audit", {})
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
