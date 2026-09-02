"""MediaGovernor V3：由页面编排公开 MoviePilot API 的媒体治理插件。"""

from __future__ import annotations

from typing import Any

from app.plugins import _PluginBase


class MediaGovernor(_PluginBase):
    """提供 Vue 治理台，不读取宿主私有数据库、Chain 或文件系统。"""

    plugin_name = "媒体治理"
    plugin_desc = "找对作品并核对整理：包级识别、可见进度、官方预览和受控硬链接重整。"
    plugin_icon = "Moviepilot_A.png"
    plugin_version = "1.1.0"
    plugin_author = "MoviePilotMediaGovernor contributors"
    author_url = ""
    plugin_config_prefix = "mediagovernor_"
    plugin_order = 99
    auth_level = 1

    _enabled = False

    def init_plugin(self, config: dict[str, Any] | None = None) -> None:
        """只读取启用开关；所有检查在用户打开页面后才发生。"""
        self._enabled = bool((config or {}).get("enabled"))

    def get_state(self) -> bool:
        return self._enabled

    @staticmethod
    def get_command() -> list[dict[str, Any]]:
        return []

    @staticmethod
    def get_render_mode() -> tuple[str, str]:
        return "vue", "dist/v1.1.0/assets"

    def get_sidebar_nav(self) -> list[dict[str, Any]]:
        return []

    def get_api(self) -> list[dict[str, Any]]:
        """不代理宿主接口，避免引入不稳定的内部 Python 合同。"""
        return []

    def get_service(self) -> list[dict[str, Any]]:
        return []

    def stop_service(self) -> None:
        """满足宿主生命周期合同；本插件不创建后台服务或外部资源。"""
        return None

    def get_form(self) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        return [], {"enabled": False}

    def get_page(self) -> list[dict[str, Any]]:
        return []
