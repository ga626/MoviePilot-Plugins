"""MediaGovernor V3：由页面编排公开 MoviePilot API 的媒体治理插件。"""

from __future__ import annotations

from typing import Any

from app.plugins import _PluginBase


class MediaGovernor(_PluginBase):
    """提供 Vue 治理台，不读取宿主私有数据库、Chain 或文件系统。"""

    plugin_name = "媒体治理"
    plugin_desc = "恢复失败整理的作品身份，展示官方预览，并在确认后由 MoviePilot 建立正确硬链接。"
    plugin_icon = "Moviepilot_A.png"
    plugin_version = "1.0.0"
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
        return "vue", "dist/v1.0.0/assets"

    def get_sidebar_nav(self) -> list[dict[str, Any]]:
        return []

    def get_api(self) -> list[dict[str, Any]]:
        """不代理宿主接口，避免引入不稳定的内部 Python 合同。"""
        return []

    def get_service(self) -> list[dict[str, Any]]:
        return []

    def get_form(self) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        return [], {"enabled": False}

    def get_page(self) -> list[dict[str, Any]]:
        return []
