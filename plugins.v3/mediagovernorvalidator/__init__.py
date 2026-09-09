"""MediaGovernorValidator：单次安装、全链只读验证台。"""
from __future__ import annotations

from typing import Any

from app.plugins import _PluginBase
from fastapi import Request
from pydantic import BaseModel, Field

from .validator import ValidatorService


class ValidatorResponse(BaseModel):
    success: bool
    message: str = ""
    data: dict[str, Any] = Field(default_factory=dict)


class MediaGovernorValidator(_PluginBase):
    plugin_name = "媒体治理验证台"
    plugin_desc = "一次安装完成源文件边界、AI、候选、官方预览和问题对账的全链只读验证。"
    plugin_icon = "Moviepilot_A.png"
    plugin_version = "0.1.0"
    plugin_author = "MoviePilotMediaGovernor contributors"
    author_url = ""
    plugin_config_prefix = "mediagovernorvalidator_"
    plugin_order = 100
    auth_level = 1

    def init_plugin(self, config: dict[str, Any] | None = None) -> None:
        self._enabled = bool((config or {}).get("enabled"))
        previous = getattr(self, "_service", None)
        if previous and not previous.stop():
            self._service = previous
            return
        self._service = ValidatorService(self.get_data_path())

    def get_state(self) -> bool:
        return self._enabled

    @staticmethod
    def get_command() -> list[dict[str, Any]]:
        return []

    @staticmethod
    def get_render_mode() -> tuple[str, str]:
        return "vue", "dist/v0.1.0/assets"

    def get_sidebar_nav(self) -> list[dict[str, Any]]:
        return []

    def get_form(self) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        return [], {"enabled": False}

    def get_page(self) -> list[dict[str, Any]]:
        return []

    def get_service(self) -> list[dict[str, Any]]:
        return []

    def get_api(self) -> list[dict[str, Any]]:
        return [
            {"path": "/plan", "endpoint": self.api_plan, "methods": ["GET"], "auth": "bear", "summary": "读取脱敏验证计划与成本预估", "response_model": ValidatorResponse},
            {"path": "/run", "endpoint": self.api_run, "methods": ["POST"], "auth": "bear", "summary": "启动、继续或停止只读验证", "response_model": ValidatorResponse},
            {"path": "/status", "endpoint": self.api_status, "methods": ["GET"], "auth": "bear", "summary": "读取阶段状态与总结果", "response_model": ValidatorResponse},
            {"path": "/export", "endpoint": self.api_export, "methods": ["GET"], "auth": "bear", "summary": "导出脱敏验证报告", "response_model": ValidatorResponse},
        ]

    async def api_plan(self) -> ValidatorResponse:
        try:
            return ValidatorResponse(success=True, data=self._service.plan())
        except Exception as error:  # noqa: BLE001
            return ValidatorResponse(success=False, message=str(error))

    async def api_run(self, request: Request) -> ValidatorResponse:
        try:
            body = await request.json() or {}
            action = str(body.get("action") or "all")
            if action not in {"all", "resume", "cancel"}:
                raise ValueError("不支持的验证动作")
            return ValidatorResponse(success=True, data=self._service.start(action, body.get("options") or {}))
        except Exception as error:  # noqa: BLE001
            return ValidatorResponse(success=False, message=str(error))

    async def api_status(self) -> ValidatorResponse:
        return ValidatorResponse(success=True, data=self._service.status())

    async def api_export(self, format: str = "markdown") -> ValidatorResponse:  # noqa: A002 - API query contract
        if format not in {"markdown", "json"}:
            return ValidatorResponse(success=False, message="只支持 markdown 或 json")
        return ValidatorResponse(success=True, data=self._service.export(format))

    def stop_service(self) -> None:
        service = getattr(self, "_service", None)
        if service:
            service.stop()


__all__ = ["MediaGovernorValidator", "ValidatorResponse"]
