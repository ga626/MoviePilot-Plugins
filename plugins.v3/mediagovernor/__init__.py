"""MediaGovernor V3：逐作品保存、可恢复的媒体对账与官方重建。"""
from __future__ import annotations

import asyncio
from typing import Any

from app.plugins import _PluginBase
from fastapi import Request
from pydantic import BaseModel, Field

from .governor import GovernorService, identity_key

try:
    from app.schemas.types import EventType
    from app.sdk.events import eventmanager
except ImportError:  # pragma: no cover - 仅本地轻量测试没有宿主事件总线
    eventmanager = EventType = None


class GovernorResponse(BaseModel):
    success: bool
    message: str = ""
    data: dict[str, Any] = Field(default_factory=dict)


class MediaGovernor(_PluginBase):
    plugin_name = "媒体治理"
    plugin_desc = "逐作品核对当前文件与 MoviePilot 应有结果，找出整理失败和假成功。"
    plugin_icon = "Moviepilot_A.png"
    plugin_version = "5.1.1"
    plugin_author = "MoviePilotMediaGovernor contributors"
    author_url = ""
    plugin_config_prefix = "mediagovernor_"
    plugin_order = 99
    auth_level = 1

    def init_plugin(self, config: dict[str, Any] | None = None) -> None:
        self._enabled = bool((config or {}).get("enabled"))
        self._unregister_transfer_events()
        old_service = getattr(self, "_service", None)
        if old_service and not old_service.stop():
            # MoviePilot 的同步存储/识别调用无法强杀。旧 worker 未退出时复用同一服务，
            # 避免热重载后两个 worker 同时读写媒体状态。
            self._service = old_service
            self._service.ai_enabled = bool((config or {}).get("ai_enabled", False))
            self._service.read_only = (config or {}).get("read_only") is not False
            if self._enabled:
                self._register_transfer_events()
            return
        self._service = GovernorService(self.get_data_path(), ai_enabled=bool((config or {}).get("ai_enabled", False)), read_only=(config or {}).get("read_only") is not False)
        self._registered_events = False
        if self._enabled:
            self._register_transfer_events()

    def get_state(self) -> bool:
        return self._enabled

    @staticmethod
    def get_command() -> list[dict[str, Any]]:
        return []

    @staticmethod
    def get_render_mode() -> tuple[str, str]:
        return "vue", "dist/v5.1.1/assets"

    def get_sidebar_nav(self) -> list[dict[str, Any]]:
        return []

    def get_form(self) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        return [], {"enabled": False, "ai_enabled": False, "read_only": True}

    def get_page(self) -> list[dict[str, Any]]:
        return []

    def get_service(self) -> list[dict[str, Any]]:
        return []

    def get_api(self) -> list[dict[str, Any]]:
        return [
            {"path": "/audit/start", "endpoint": self.api_audit_start, "methods": ["POST"], "auth": "bear", "summary": "启动增量检查、完整重建或协作停止", "response_model": GovernorResponse},
            {"path": "/audit/status", "endpoint": self.api_audit_status, "methods": ["GET"], "auth": "bear", "summary": "读取后端检查任务状态", "response_model": GovernorResponse},
            {"path": "/findings", "endpoint": self.api_findings, "methods": ["GET"], "auth": "bear", "summary": "读取问题、待确认项和读取错误", "response_model": GovernorResponse},
            {"path": "/objects/{object_id}", "endpoint": self.api_object, "methods": ["GET"], "auth": "bear", "summary": "读取单项私有证据", "response_model": GovernorResponse},
            {"path": "/identity/confirm", "endpoint": self.api_identity_confirm, "methods": ["POST"], "auth": "bear", "summary": "保存一次用户确认的作品身份", "response_model": GovernorResponse},
            {"path": "/identity/search", "endpoint": self.api_identity_search, "methods": ["POST"], "auth": "bear", "summary": "按用户输入回查作品数据库候选，不使用 AI", "response_model": GovernorResponse},
            {"path": "/repair/{object_id}", "endpoint": self.api_repair, "methods": ["POST"], "auth": "bear", "summary": "重新预览或执行单项官方重建", "response_model": GovernorResponse},
        ]

    async def api_audit_start(self, request: Request) -> GovernorResponse:
        try:
            body = await request.json()
            mode = str((body or {}).get("mode") or "incremental")
            if mode not in {"incremental", "full", "cancel"}:
                raise ValueError("不支持的检查模式")
            if not self._enabled and mode != "cancel":
                raise ValueError("插件已停用，不能启动检查")
            return GovernorResponse(success=True, data=await asyncio.to_thread(self._service.start, mode))
        except Exception as error:  # noqa: BLE001 - API 边界必须把宿主异常转成可读响应
            return GovernorResponse(success=False, message=str(error))

    async def api_audit_status(self) -> GovernorResponse:
        return GovernorResponse(success=True, data=self._service.status())

    async def api_findings(self) -> GovernorResponse:
        return GovernorResponse(success=True, data=self._service.findings())

    async def api_object(self, object_id: str) -> GovernorResponse:
        detail = self._service.detail(object_id)
        if not detail:
            return GovernorResponse(success=False, message="这部作品已经不存在，请重新检查")
        return GovernorResponse(success=True, data=detail)

    async def api_identity_confirm(self, request: Request) -> GovernorResponse:
        try:
            if not self._enabled:
                raise ValueError("插件已停用，不能提交身份确认")
            body = await request.json() or {}
            refs = body.get("file_refs")
            if refs is not None and (not isinstance(refs, list) or not all(isinstance(value, str) for value in refs)):
                raise ValueError("文件选择格式错误")
            result = await asyncio.to_thread(self._service.confirm_identity, str(body.get("object_id") or ""), str(body.get("candidate_key") or ""), refs, body.get("mapping"))
            return GovernorResponse(success=True, data=result)
        except Exception as error:  # noqa: BLE001 - API 边界必须把宿主异常转成可读响应
            return GovernorResponse(success=False, message=str(error))

    async def api_identity_search(self, request: Request) -> GovernorResponse:
        try:
            if not self._enabled:
                raise ValueError("插件已停用，不能发起数据库搜索")
            body = await request.json() or {}
            data = await asyncio.to_thread(self._service.search_candidates, str(body.get("object_id") or ""), str(body.get("query") or ""))
            return GovernorResponse(success=True, data=data)
        except Exception as error:  # noqa: BLE001 - 用户搜索错误不改变已确认身份
            return GovernorResponse(success=False, message=str(error))

    async def api_repair(self, object_id: str, request: Request) -> GovernorResponse:
        try:
            if not self._enabled:
                raise ValueError("插件已停用，不能预览或执行修复")
            body = await request.json() or {}
            action = str(body.get("action") or "preview")
            if action == "preview":
                data = self._service.request_repair_preview(object_id)
            elif action == "preview_status":
                data = self._service.repair_preview_status(object_id)
            elif action == "execute":
                if self._service.read_only:
                    raise ValueError("当前为只读模式，只能检查和预览，不能执行媒体修复")
                data = await asyncio.to_thread(self._service.repair_execute, object_id, str(body.get("token") or ""), body.get("cleanup_approved") is True)
            else:
                raise ValueError("不支持的修复操作")
            return GovernorResponse(success=True, data=data)
        except Exception as error:  # noqa: BLE001 - API 边界必须把宿主异常转成可读响应
            return GovernorResponse(success=False, message=str(error))

    def _register_transfer_events(self) -> None:
        if self._registered_events or not eventmanager or not EventType:
            return
        for event_type in (EventType.TransferComplete, EventType.TransferFailed):
            eventmanager.add_event_listener(event_type, self._on_transfer_result)
        self._registered_events = True

    def _on_transfer_result(self, event: Any) -> None:
        self._service.mark_dirty(event)

    def _unregister_transfer_events(self) -> None:
        if getattr(self, "_registered_events", False) and eventmanager and EventType:
            for event_type in (EventType.TransferComplete, EventType.TransferFailed):
                eventmanager.remove_event_listener(event_type, self._on_transfer_result)
        self._registered_events = False

    def stop_service(self) -> None:
        self._unregister_transfer_events()
        service = getattr(self, "_service", None)
        if service:
            service.stop()


__all__ = ["GovernorResponse", "MediaGovernor", "identity_key"]
