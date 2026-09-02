"""MoviePilot V3 MediaGovernor：整理结果问题台与零写入预演。"""

from __future__ import annotations

from hashlib import sha256
from typing import Any, Dict, List, Tuple

from app.db.oper.transferhistory import TransferHistoryOper
from app.plugins import _PluginBase
from app.schemas.types import EventType
from app.sdk.events import Event, eventmanager, snapshot_event_data

from .governor import BatchAudit, EventObservation, GovernanceQueue, NativePreviewGateway


class MediaGovernor(_PluginBase):
    """以通用事件归并发现问题，不替代 MoviePilot 的原生整理器。"""

    plugin_name = "媒体治理"
    plugin_desc = "批量核对整理历史，只列出已确认需要处理的作品；确认后才创建硬链接，不改动原文件。"
    plugin_icon = "Moviepilot_A.png"
    plugin_version = "0.8.0"
    plugin_author = "MoviePilotMediaGovernor contributors"
    author_url = ""
    plugin_config_prefix = "mediagovernor_"
    plugin_order = 99
    auth_level = 1

    _QUEUE_KEY = "queue"
    _LEGACY_QUEUE_KEY = "s3_queue"
    _AUDIT_KEY = "history_audit"
    _INSPECTION_KEY = "batch_inspection"
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
            self._inspection = BatchAudit.from_data(self.get_data(self._INSPECTION_KEY))
        else:
            self._queue = GovernanceQueue()
            self._audit = {}
            self._inspection = BatchAudit()
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
        """使用通用插件详情页入口，避免旧宿主暴露无法打开的全页侧栏项。"""
        return []

    def get_api(self) -> List[Dict[str, Any]]:
        return [
            {"path": "/packages", "endpoint": self.get_packages, "methods": ["GET"], "auth": "bear", "summary": "查询媒体治理问题"},
            {"path": "/plans", "endpoint": self.get_plans, "methods": ["GET"], "auth": "bear", "summary": "查询零写入预演计划"},
            {"path": "/plans/{plan_id}", "endpoint": self.get_plan, "methods": ["GET"], "auth": "bear", "summary": "查询预演计划详情"},
            {"path": "/audit", "endpoint": self.audit_all, "methods": ["POST"], "auth": "bear", "summary": "开始一轮新的逐条整理检查（不改文件）"},
            {"path": "/audit/resume", "endpoint": self.resume_audit, "methods": ["POST"], "auth": "bear", "summary": "继续暂停的逐条整理检查（不改文件）"},
            {"path": "/audit/next", "endpoint": self.audit_next, "methods": ["POST"], "auth": "bear", "summary": "处理下一条整理检查（不改文件）"},
            {"path": "/audit/batch", "endpoint": self.audit_batch, "methods": ["POST"], "auth": "bear", "summary": "批量处理整理检查（不改文件）"},
            {"path": "/audit/pause", "endpoint": self.pause_audit, "methods": ["POST"], "auth": "bear", "summary": "暂停整理检查"},
            {"path": "/packages/{history_id}/preview", "endpoint": self.preview_history, "methods": ["POST"], "auth": "bear", "summary": "生成硬链接预演计划（不执行）"},
            {"path": "/plans/{plan_id}/repair", "endpoint": self.repair_plan, "methods": ["POST"], "auth": "bear", "summary": "执行已确认的硬链接修复"},
        ]

    def get_packages(self) -> dict[str, Any]:
        queue = getattr(self, "_queue", GovernanceQueue())
        history_ids = queue.auditable_history_ids()
        inspection = getattr(self, "_inspection", BatchAudit())
        summary = inspection.summary(history_ids)
        history_audit = getattr(self, "_audit", {})
        if isinstance(history_audit, dict) and history_audit.get("state") in {"in_progress", "retry_pending", "paused"}:
            discovered = len(history_ids)
            total = int(history_audit.get("history_total") or 0)
            summary.update({
                "state": "paused" if history_audit.get("state") == "paused" else "discovering",
                "checked": discovered,
                "total": total or discovered,
                "pending": 0,
                "discovered": discovered,
                "history_total_known": bool(total),
            })
        return {
            "items": inspection.public_items(history_ids),
            "summary": summary,
            "mode": "progressive_quality_gate",
            "enabled": self.get_state(),
            "history_audit": history_audit,
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
        return [{"id": "MediaGovernor.HistoryReconcile", "name": "媒体治理历史质量记录回溯", "trigger": "interval", "func": self.reconcile_history, "kwargs": {"minutes": 15}}]

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

    def reconcile_history(self, minutes: int | None = None, pages: int | None = None) -> None:
        del minutes
        if not self.get_state() or not self._backfill_existing_failures:
            return
        state = getattr(self, "_audit", {})
        if not isinstance(state, dict) or state.get("schema") != "mediagovernor-history-audit/v2":
            state = {}
        if isinstance(state, dict) and state.get("state") in {"complete", "unsupported_host_contract"}:
            return
        query_contract = self._history_query_contract()
        if query_contract is None:
            self._audit = {"schema": "mediagovernor-history-audit/v2", "state": "unsupported_host_contract", "detail": "history_query_unavailable"}
            self.save_data(self._AUDIT_KEY, self._audit)
            return
        QueryPageRequest, QuerySort, QuerySortDirection, QuerySortField, TransferHistoryFilter = query_contract
        phase = state.get("phase", "failed")
        phase = phase if phase in {"failed", "complete"} else "failed"
        page_number = state.get("next_page", 1) if isinstance(state, dict) else 1
        page_number = page_number if isinstance(page_number, int) and page_number > 0 else 1
        queue, processed, complete = getattr(self, "_queue", GovernanceQueue()), 0, False
        failed_total = int(state.get("failed_total") or 0) if isinstance(state, dict) else 0
        complete_total = int(state.get("complete_total") or 0) if isinstance(state, dict) else 0
        try:
            for _ in range(max(1, min(int(pages or self._AUDIT_PAGES_PER_RUN), self._AUDIT_PAGES_PER_RUN))):
                histories, total = TransferHistoryOper().query(filters=TransferHistoryFilter(status=phase == "complete"), page=QueryPageRequest(page=page_number, count=self._AUDIT_PAGE_SIZE, sort=QuerySort(field=QuerySortField.ID, direction=QuerySortDirection.DESC)))
                if phase == "failed":
                    failed_total = int(total or 0)
                else:
                    complete_total = int(total or 0)
                for history in histories:
                    processed += int(queue.observe_history(history))
                if not histories or page_number * self._AUDIT_PAGE_SIZE >= total:
                    if phase == "failed":
                        phase, page_number = "complete", 1
                        continue
                    page_number, complete = 1, True
                    break
                page_number += 1
        except Exception:
            self._audit = {"schema": "mediagovernor-history-audit/v2", "state": "retry_pending", "phase": phase, "next_page": page_number, "failed_total": failed_total, "complete_total": complete_total, "history_total": failed_total + complete_total}
            self.save_data(self._AUDIT_KEY, self._audit)
            return
        self._queue = queue
        self._audit = {"schema": "mediagovernor-history-audit/v2", "state": "complete" if complete else "in_progress", "phase": phase, "next_page": page_number, "added_packages": len(queue.auditable_history_ids()), "failed_total": failed_total, "complete_total": complete_total, "history_total": failed_total + complete_total}
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

    @staticmethod
    def _target_request(target_storage: str | None, target_path: str | None, target_name: str | None) -> tuple[str | None, str | None, str | None, str | None]:
        """验证临时目录选择；路径仅用于本次宿主调用，状态只保存摘要指纹。"""
        storage = str(target_storage or "").strip() or None
        path = str(target_path or "").strip() or None
        label = str(target_name or "").strip()[:120] or None
        if bool(storage) != bool(path):
            return None, None, None, None
        if path and ("\n" in path or "\r" in path):
            return None, None, None, None
        fingerprint = sha256(f"{storage or ''}\0{path or ''}".encode("utf-8")).hexdigest()[:32] if storage and path else None
        return storage, path, label, fingerprint

    def preview_hardlink(self, fileitem: Any, *, target_storage: str | None = None, target_path: str | None = None) -> dict[str, str | bool]:
        if not self.get_state():
            return {"mode": "preview", "transfer_type": "link", "ok": False, "detail": "plugin_disabled"}
        return NativePreviewGateway(self._transfer_chain).preview(fileitem, target_storage=target_storage, target_path=target_path)

    def repair_hardlink(self, fileitem: Any, *, target_storage: str | None = None, target_path: str | None = None) -> dict[str, str | bool]:
        return NativePreviewGateway(self._transfer_chain).repair(fileitem, target_storage=target_storage, target_path=target_path)

    @staticmethod
    def _target_is_currently_configured(storage: str | None, path: str | None, name: str | None) -> bool:
        """拒绝由客户端伪造的目标；只接受 MoviePilot 当前目录配置中的项。"""
        if not storage and not path:
            return True
        if not storage or not path or not name:
            return False
        try:
            from app.application.directory import DirectoryHelper
            configured = DirectoryHelper().get_library_dirs()
        except Exception:
            return False
        return any(
            str(getattr(directory, "library_storage", "") or "") == storage
            and str(getattr(directory, "library_path", "") or "") == path
            and str(getattr(directory, "name", "") or "") == name
            for directory in configured or []
        )

    def preview_history(self, history_id: int, target: dict[str, Any] | None = None) -> dict[str, Any]:
        queue = getattr(self, "_queue", GovernanceQueue())
        inspection = getattr(self, "_inspection", BatchAudit())
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
        target = target or {}
        raw_storage, raw_path = str(target.get("storage") or "").strip(), str(target.get("path") or "").strip()
        target_storage, target_path, target_name, target_fingerprint = self._target_request(raw_storage, raw_path, target.get("name"))
        if bool(raw_storage) != bool(raw_path) or ((raw_storage and raw_path) and (target_storage is None or target_path is None)):
            return {"mode": "preview", "transfer_type": "link", "ok": False, "detail": "target_request_invalid"}
        if not self._target_is_currently_configured(target_storage, target_path, target_name):
            return {"mode": "preview", "transfer_type": "link", "ok": False, "detail": "target_not_currently_configured"}
        from app.schemas.file import FileItem
        result = self.preview_hardlink(FileItem(**raw_fileitem), target_storage=target_storage, target_path=target_path)
        plan = queue.record_preview(history_id, result, target_label=target_name, target_fingerprint=target_fingerprint)
        outcome = queue.record_preview_outcome(history_id, result)
        if outcome is not None:
            self._queue = queue
            self.save_data(self._QUEUE_KEY, queue.to_data())
        checked = inspection.record_preview(history_id, result)
        if checked is not None:
            self._inspection = inspection
            self.save_data(self._INSPECTION_KEY, inspection.to_data())
        return {**result, "plan": plan, "outcome": outcome, "checked": checked}

    def audit_all(self) -> dict[str, Any]:
        """建立新快照：先分页读取完整历史，再处理文件包，绝不把旧队列当全库。"""
        if not self.get_state():
            queue = getattr(self, "_queue", GovernanceQueue())
            inspection = getattr(self, "_inspection", BatchAudit())
            return {"ok": False, "detail": "plugin_disabled", "summary": inspection.summary(queue.auditable_history_ids())}
        self._queue = GovernanceQueue()
        self._inspection = BatchAudit()
        self._audit = {"schema": "mediagovernor-history-audit/v2", "state": "in_progress", "phase": "failed", "next_page": 1, "added_packages": 0, "failed_total": 0, "complete_total": 0, "history_total": 0}
        self.save_data(self._QUEUE_KEY, self._queue.to_data())
        self.save_data(self._INSPECTION_KEY, self._inspection.to_data())
        self.save_data(self._AUDIT_KEY, self._audit)
        return {"ok": True, "summary": self.get_packages()["summary"]}

    def resume_audit(self) -> dict[str, Any]:
        """只恢复被用户暂停的本轮，避免把完成状态误恢复成旧结果。"""
        queue = getattr(self, "_queue", GovernanceQueue())
        inspection = getattr(self, "_inspection", BatchAudit())
        if not self.get_state():
            return {"ok": False, "detail": "plugin_disabled", "summary": inspection.summary(queue.auditable_history_ids())}
        history_audit = getattr(self, "_audit", {})
        if isinstance(history_audit, dict) and history_audit.get("state") == "paused":
            history_audit["state"] = "in_progress"
            self._audit = history_audit
            self.save_data(self._AUDIT_KEY, history_audit)
            return {"ok": True, "summary": self.get_packages()["summary"]}
        history_ids = queue.auditable_history_ids()
        summary = inspection.resume(history_ids)
        if summary.get("state") not in {"running", "paused"}:
            return {"ok": False, "detail": "no_paused_audit", "summary": summary}
        self._inspection = inspection
        self.save_data(self._INSPECTION_KEY, inspection.to_data())
        return {"ok": True, "summary": summary}

    @staticmethod
    def _history_title(history: Any) -> str | None:
        """只在本次识别调用中使用历史名称，绝不把原始名称或路径写入插件状态。"""
        candidates = (
            getattr(history, "title", None),
            (getattr(history, "src_fileitem", None) or {}).get("name"),
        )
        for candidate in candidates:
            if isinstance(candidate, str) and candidate.strip():
                return candidate.strip()
        return None

    @staticmethod
    def _media_identity(mediainfo: Any) -> dict[str, Any]:
        """将识别结果投影为可展示的稳定作品身份，不保存宿主文件数据。"""
        def text(value: Any) -> str | None:
            raw = getattr(value, "value", value)
            cleaned = str(raw).strip() if raw is not None else ""
            return cleaned[:160] if cleaned else None

        return {
            "title": text(getattr(mediainfo, "title", None)),
            "year": text(getattr(mediainfo, "year", None)),
            "media_source": text(getattr(mediainfo, "media_source", None)),
            "media_id": text(getattr(mediainfo, "media_id", None)),
            "media_type": text(getattr(mediainfo, "type", None)),
        }

    @staticmethod
    def _merge_identity(primary: dict[str, Any], fallback: dict[str, Any] | None) -> dict[str, Any]:
        """优先采用历史自身的身份字段，只在缺项时使用已保存的事件投影。"""
        fallback = fallback or {}
        return {field: primary.get(field) or fallback.get(field) for field in ("title", "year", "media_source", "media_id", "media_type")}

    @staticmethod
    def _file_names(storage: Any, fileitem: Any) -> tuple[bool, list[str]]:
        """读取一组临时文件名，调用方只会保存汇总计数，绝不保存路径或名称。"""
        if fileitem is None or not bool(storage.exists(fileitem)):
            return False, []
        try:
            children = storage.list_files(fileitem, recursion=True) or []
        except Exception:
            return True, []
        names: list[str] = []
        for item in [fileitem, *children]:
            name = getattr(item, "name", None)
            if isinstance(name, str) and name:
                names.append(name)
        return True, names

    @classmethod
    def _history_file_summary(cls, history: Any) -> dict[str, Any] | None:
        """以 StorageChain 的当前事实补充成功记录；读取失败时宁可降级。"""
        raw_source = getattr(history, "src_fileitem", None)
        raw_target = getattr(history, "dest_fileitem", None)
        if not isinstance(raw_source, dict) or not isinstance(raw_target, dict):
            return None
        try:
            from app.chain.storage import StorageChain
            from app.schemas.file import FileItem

            storage = StorageChain()
            source_exists, source_names = cls._file_names(storage, FileItem(**raw_source))
            target_exists, target_names = cls._file_names(storage, FileItem(**raw_target))
        except Exception:
            return None
        from .governor import build_file_summary
        return build_file_summary(source_names, target_names, source_exists=source_exists, target_exists=target_exists)

    def _audit_one(self, queue: GovernanceQueue, inspection: BatchAudit, history_id: int) -> bool:
        """检查一条历史记录；返回是否可能触发原生识别/预演的慢路径。"""
        context = queue.history_context(history_id) or {}
        is_complete = context.get("event_kind") == "complete"
        history = TransferHistoryOper().get(history_id)
        if history is None:
            if is_complete:
                inspection.record_complete_quality(history_id, None, None, source_available=False)
            else:
                inspection.record(history_id, None, source_available=False)
            return not is_complete

        # MoviePilot 的真实字段是 history.mode（move/copy/link），不是旧版
        # 插件读取的 transfer_mode / transfer_type。
        identity = self._merge_identity(self._media_identity(history), context.get("identity"))
        if is_complete:
            recorded_mode = getattr(history, "mode", None) or getattr(history, "transfer_mode", None) or getattr(history, "transfer_type", None) or context.get("transfer_mode")
            inspection.record_complete_quality(
                history_id,
                identity,
                recorded_mode,
                file_summary=self._history_file_summary(history),
            )
            return False

        if not all(identity.get(field) for field in ("title", "media_source", "media_id", "media_type")):
            title = self._history_title(history)
            if title:
                try:
                    from app.chain.media import MediaChain
                    from app.schemas.context import MetaInfo
                    mediainfo = MediaChain().recognize_by_meta(MetaInfo(title=title), obtain_images=False)
                except Exception:
                    mediainfo = None
                identity = self._merge_identity(self._media_identity(mediainfo) if mediainfo is not None else {}, identity)
        preview = None
        if all(identity.get(field) for field in ("title", "media_source", "media_id", "media_type")):
            raw_fileitem = getattr(history, "src_fileitem", None)
            if isinstance(raw_fileitem, dict):
                try:
                    from app.schemas.file import FileItem
                    preview = self.preview_hardlink(FileItem(**raw_fileitem))
                except Exception:
                    preview = {"ok": False, "detail": "preview_rejected"}
            else:
                preview = {"ok": False, "detail": "history_fileitem_unavailable"}
            queue.record_preview_outcome(history_id, preview)
        inspection.record(history_id, identity, preview)
        return True

    def _audit_some(self, maximum_items: int) -> dict[str, Any]:
        """每次请求最多处理有限条目；遇到失败历史即返回，避免单次请求长时间卡住。"""
        queue = getattr(self, "_queue", GovernanceQueue())
        inspection = getattr(self, "_inspection", BatchAudit())
        if not self.get_state():
            return {"ok": False, "detail": "plugin_disabled", "summary": inspection.summary(queue.auditable_history_ids())}
        history_audit = getattr(self, "_audit", {})
        if isinstance(history_audit, dict) and history_audit.get("state") in {"in_progress", "retry_pending"}:
            self.reconcile_history(pages=1)
            history_audit = getattr(self, "_audit", {})
            if isinstance(history_audit, dict) and history_audit.get("state") != "complete":
                return {"ok": True, "processed": 0, "summary": self.get_packages()["summary"]}
            queue = getattr(self, "_queue", GovernanceQueue())
            inspection = getattr(self, "_inspection", BatchAudit())
            inspection.start(queue.auditable_history_ids())
            self._inspection = inspection
            self.save_data(self._INSPECTION_KEY, inspection.to_data())
        history_ids = queue.auditable_history_ids()
        processed = 0
        while processed < max(1, min(int(maximum_items), 25)):
            history_id = inspection.claim_next()
            if history_id is None:
                break
            # 先记录领取状态，宿主中断时会自动归还这条记录而不是遗漏。
            self._inspection = inspection
            self.save_data(self._INSPECTION_KEY, inspection.to_data())
            slow_path = self._audit_one(queue, inspection, history_id)
            processed += 1
            self._queue = queue
            self._inspection = inspection
            self.save_data(self._QUEUE_KEY, queue.to_data())
            self.save_data(self._INSPECTION_KEY, inspection.to_data())
            if slow_path:
                break
        self._inspection = inspection
        self.save_data(self._INSPECTION_KEY, inspection.to_data())
        return {"ok": True, "processed": processed, "summary": inspection.summary(history_ids)}

    def audit_next(self) -> dict[str, Any]:
        """兼容旧页面：一次只处理一条。"""
        return self._audit_some(1)

    def audit_batch(self, limit: int = 25) -> dict[str, Any]:
        """供新版页面每批处理最多 25 条快速历史，并在批次间刷新进度。"""
        return self._audit_some(limit)

    def pause_audit(self) -> dict[str, Any]:
        """暂停尚未开始的检查项；已经开始的单项由宿主调用自然返回。"""
        history_audit = getattr(self, "_audit", {})
        if isinstance(history_audit, dict) and history_audit.get("state") in {"in_progress", "retry_pending"}:
            history_audit["state"] = "paused"
            self._audit = history_audit
            self.save_data(self._AUDIT_KEY, history_audit)
            return {"ok": True, "summary": self.get_packages()["summary"]}
        queue = getattr(self, "_queue", GovernanceQueue())
        inspection = getattr(self, "_inspection", BatchAudit())
        summary = inspection.pause()
        self._inspection = inspection
        self.save_data(self._INSPECTION_KEY, inspection.to_data())
        return {"ok": True, "summary": summary}

    def repair_plan(self, plan_id: str, target: dict[str, Any] | None = None) -> dict[str, Any]:
        """只执行已通过预演、未过期且由用户明确点击确认的单个计划。"""
        queue = getattr(self, "_queue", GovernanceQueue())
        plan = queue.begin_repair(plan_id)
        if plan is None:
            return {"mode": "repair", "transfer_type": "link", "ok": False, "detail": "plan_not_repairable"}
        target = target or {}
        target_storage, target_path, _target_name, target_fingerprint = self._target_request(target.get("storage"), target.get("path"), target.get("name"))
        if not self._target_is_currently_configured(target_storage, target_path, target.get("name")):
            plan["status"] = "ready"
            self._queue = queue
            self.save_data(self._QUEUE_KEY, queue.to_data())
            return {"mode": "repair", "transfer_type": "link", "ok": False, "detail": "target_not_currently_configured"}
        expected = plan.get("target_fingerprint")
        if expected and expected != target_fingerprint:
            plan["status"] = "ready"
            self._queue = queue
            self.save_data(self._QUEUE_KEY, queue.to_data())
            return {"mode": "repair", "transfer_type": "link", "ok": False, "detail": "target_changed_repreview_required"}
        self._queue = queue
        self.save_data(self._QUEUE_KEY, queue.to_data())
        history = TransferHistoryOper().get(plan["history_id"])
        raw_fileitem = getattr(history, "src_fileitem", None) if history is not None else None
        if history is None or getattr(history, "status", None) is True or not isinstance(raw_fileitem, dict):
            result = {"mode": "repair", "transfer_type": "link", "ok": False, "detail": "repair_source_unavailable"}
        else:
            try:
                from app.schemas.file import FileItem
                result = self.repair_hardlink(FileItem(**raw_fileitem), target_storage=target_storage, target_path=target_path)
            except Exception:
                result = {"mode": "repair", "transfer_type": "link", "ok": False, "detail": "repair_failed"}
        receipt = queue.complete_repair(plan_id, result)
        self._queue = queue
        self.save_data(self._QUEUE_KEY, queue.to_data())
        return {**result, "receipt": receipt}

    def stop_service(self) -> None:
        self._enabled = False
        self._queue = GovernanceQueue()
