"""MoviePilot V3 MediaGovernor：整理结果问题台与零写入预演。"""

from __future__ import annotations

from typing import Any, Dict, List, Tuple

from app.db.oper.transferhistory import TransferHistoryOper
from app.plugins import _PluginBase
from app.schemas.types import EventType
from app.sdk.events import Event, eventmanager, snapshot_event_data

from .governor import EventObservation, GovernanceQueue, NativePreviewGateway


class MediaGovernor(_PluginBase):
    """以通用事件归并发现问题，不替代 MoviePilot 的原生整理器。"""

    plugin_name = "媒体治理"
    plugin_desc = "核对整理结果，归集媒体问题，并提供不改文件的硬链接预演。"
    plugin_icon = "Moviepilot_A.png"
    plugin_version = "0.4.0"
    plugin_author = "MoviePilotMediaGovernor contributors"
    author_url = ""
    plugin_config_prefix = "mediagovernor_"
    plugin_order = 99
    auth_level = 1

    _QUEUE_KEY = "queue"
    _LEGACY_QUEUE_KEY = "s3_queue"
    _AUDIT_KEY = "history_audit"
    _LEGACY_AUDIT_KEY = "s3_audit"
    _AUDIT_PAGE_SIZE = 100
    _AUDIT_PAGES_PER_RUN = 5
    _enabled = False
    _backfill_existing_failures = False

    def init_plugin(self, config: dict[str, Any] | None = None) -> None:
        """只有用户启用后才观察新事件；旧失败记录回溯始终是一次性选择。"""
        config = config or {}
        self._enabled = bool(config.get("enabled"))
        self._backfill_existing_failures = bool(config.get("backfill_existing_failures"))
        if self._enabled:
            queue_data = self.get_data(self._QUEUE_KEY) or self.get_data(self._LEGACY_QUEUE_KEY)
            self._queue = GovernanceQueue.from_data(queue_data)
            self._audit = self.get_data(self._AUDIT_KEY) or self.get_data(self._LEGACY_AUDIT_KEY) or {}
        else:
            self._queue = GovernanceQueue()
            self._audit = {}
        if self._enabled and self._backfill_existing_failures:
            self.reconcile_history()
        elif self._enabled:
            self._audit = {"schema": "mediagovernor-history-audit/v1", "state": "incremental_only", "detail": "historical_backfill_disabled"}
            self.save_data(self._AUDIT_KEY, self._audit)

    def get_state(self) -> bool:
        return self._enabled

    @staticmethod
    def get_command() -> List[Dict[str, Any]]:
        """不注册远程命令，避免预演被误作真实执行入口。"""
        return []

    @staticmethod
    def get_render_mode() -> Tuple[str, str]:
        return "vue", "dist/assets"

    def get_sidebar_nav(self) -> List[Dict[str, Any]]:
        if not self.get_state():
            return []
        return [{"nav_key": "main", "title": "媒体治理", "icon": "mdi-shield-check", "section": "organize", "permission": "manage", "order": 50}]

    def get_api(self) -> List[Dict[str, Any]]:
        return [
            {"path": "/packages", "endpoint": self.get_packages, "methods": ["GET"], "auth": "bear", "summary": "查询媒体治理问题"},
            {"path": "/plans", "endpoint": self.get_plans, "methods": ["GET"], "auth": "bear", "summary": "查询零写入预演计划"},
            {"path": "/plans/{plan_id}", "endpoint": self.get_plan, "methods": ["GET"], "auth": "bear", "summary": "查询预演计划详情"},
            {"path": "/packages/{history_id}/preview", "endpoint": self.preview_history, "methods": ["POST"], "auth": "bear", "summary": "生成硬链接预演计划（不执行）"},
        ]

    def get_packages(self) -> dict[str, Any]:
        queue = getattr(self, "_queue", GovernanceQueue())
        return {
            "items": queue.public_items(),
            "summary": queue.public_summary(),
            "mode": "observe_and_preview",
            "enabled": self.get_state(),
            "history_audit": getattr(self, "_audit", {}),
        }

    def get_plans(self) -> dict[str, Any]:
        return {"items": getattr(self, "_queue", GovernanceQueue()).public_plans(), "mode": "preview_only"}

    def get_plan(self, plan_id: str) -> dict[str, Any]:
        plan = getattr(self, "_queue", GovernanceQueue()).public_plan(plan_id)
        return {"item": plan, "found": plan is not None, "mode": "preview_only"}

    def get_service(self) -> List[Dict[str, Any]]:
        state = getattr(self, "_audit", {})
        if not self.get_state() or not self._backfill_existing_failures or not isinstance(state, dict) or state.get("state") in {"complete", "unsupported_host_contract"}:
            return []
        return [{"id": "MediaGovernor.HistoryReconcile", "name": "媒体治理旧失败记录回溯", "trigger": "interval", "func": self.reconcile_history, "kwargs": {"minutes": 15}}]

    def get_form(self) -> Tuple[List[dict], Dict[str, Any]]:
        """Vue 配置页接收现有配置；默认关闭且不默认回溯历史。"""
        return [], {"enabled": False, "backfill_existing_failures": False}

    def get_page(self) -> List[dict]:
        """详情页由 Vue 组件通过 bearer API 渲染。"""
        return []

    @eventmanager.register(EventType.TransferComplete)
    def on_transfer_complete(self, event: Event) -> None:
        self._observe("complete", EventType.TransferComplete, event)

    @eventmanager.register(EventType.TransferFailed)
    def on_transfer_failed(self, event: Event) -> None:
        self._observe("failed", EventType.TransferFailed, event)

    def _observe(self, event_kind: str, event_type: EventType, event: Event) -> None:
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
        del minutes
        if not self.get_state() or not self._backfill_existing_failures:
            return
        state = getattr(self, "_audit", {})
        if isinstance(state, dict) and state.get("state") in {"complete", "unsupported_host_contract"}:
            return
        query_contract = self._history_query_contract()
        if query_contract is None:
            self._audit = {"schema": "mediagovernor-history-audit/v1", "state": "unsupported_host_contract", "detail": "history_query_unavailable"}
            self.save_data(self._AUDIT_KEY, self._audit)
            return
        QueryPageRequest, QuerySort, QuerySortDirection, QuerySortField, TransferHistoryFilter = query_contract
        page_number = state.get("next_page", 1) if isinstance(state, dict) else 1
        page_number = page_number if isinstance(page_number, int) and page_number > 0 else 1
        queue, processed, complete = getattr(self, "_queue", GovernanceQueue()), 0, False
        try:
            for _ in range(self._AUDIT_PAGES_PER_RUN):
                histories, total = TransferHistoryOper().query(filters=TransferHistoryFilter(status=False), page=QueryPageRequest(page=page_number, count=self._AUDIT_PAGE_SIZE, sort=QuerySort(field=QuerySortField.ID, direction=QuerySortDirection.DESC)))
                for history in histories:
                    processed += int(queue.observe_failed_history(history))
                if not histories or page_number * self._AUDIT_PAGE_SIZE >= total:
                    page_number, complete = 1, True
                    break
                page_number += 1
        except Exception:
            self._audit = {"schema": "mediagovernor-history-audit/v1", "state": "retry_pending"}
            self.save_data(self._AUDIT_KEY, self._audit)
            return
        self._queue = queue
        self._audit = {"schema": "mediagovernor-history-audit/v1", "state": "complete" if complete else "in_progress", "next_page": page_number, "added_packages": processed}
        self.save_data(self._QUEUE_KEY, queue.to_data())
        self.save_data(self._AUDIT_KEY, self._audit)

    @staticmethod
    def _history_query_contract() -> tuple[Any, Any, Any, Any, Any] | None:
        try:
            from app.schemas.query import QueryPageRequest, QuerySort, QuerySortDirection, QuerySortField, TransferHistoryFilter
        except ModuleNotFoundError as exc:
            if exc.name == "app.schemas.query":
                return None
            raise
        return QueryPageRequest, QuerySort, QuerySortDirection, QuerySortField, TransferHistoryFilter

    @staticmethod
    def _transfer_chain() -> Any:
        from app.chain.transfer import TransferChain
        return TransferChain()

    def preview_hardlink(self, fileitem: Any) -> dict[str, str | bool]:
        if not self.get_state():
            return {"mode": "preview", "transfer_type": "link", "ok": False, "detail": "plugin_disabled"}
        return NativePreviewGateway(self._transfer_chain).preview(fileitem)

    def preview_history(self, history_id: int) -> dict[str, Any]:
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
        result = self.preview_hardlink(FileItem(**raw_fileitem))
        plan = queue.record_preview(history_id, result)
        if plan is not None:
            self._queue = queue
            self.save_data(self._QUEUE_KEY, queue.to_data())
        return {**result, "plan": plan}

    def stop_service(self) -> None:
        self._enabled = False
        self._queue = GovernanceQueue()
