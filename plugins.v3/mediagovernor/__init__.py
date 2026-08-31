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

    plugin_name = "媒体治理（S3 观察与预览）"
    plugin_desc = "默认关闭：只观察整理结果、归并诊断队列，并可作零写入硬链接预览。"
    plugin_icon = "Moviepilot_A.png"
    plugin_version = "0.2.0"
    plugin_author = "MoviePilotMediaGovernor contributors"
    author_url = ""
    plugin_config_prefix = "mediagovernor_"
    plugin_order = 99
    auth_level = 1

    _QUEUE_KEY = "s3_queue"
    _enabled = False

    def init_plugin(self, config: dict[str, Any] | None = None) -> None:
        """仅在启用后恢复插件自身的脱敏队列，不创建后台任务。"""
        self._enabled = bool((config or {}).get("enabled"))
        self._queue = GovernanceQueue.from_data(self.get_data(self._QUEUE_KEY)) if self._enabled else GovernanceQueue()

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
        return {"items": queue.public_items(), "mode": "observe_preview", "enabled": self.get_state()}

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
