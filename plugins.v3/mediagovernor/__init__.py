"""MoviePilot V3 媒体治理插件的 S1 兼容性骨架。

本阶段只验证官方 V3 的插件加载、配置页与生命周期合同。它不监听整理事件，
不调用整理链，不读取下载或媒体目录，也不产生文件、数据库或网络副作用。
"""

from __future__ import annotations

from typing import Any

from app.plugins import _PluginBase


class MediaGovernor(_PluginBase):
    """为后续通用媒体治理预留安全、默认停用的 V3 插件入口。"""

    plugin_name = "媒体治理（S1 兼容性验证）"
    plugin_desc = "仅验证 V3 插件加载合同；不整理、不移动、不改名任何媒体文件。"
    plugin_icon = "Moviepilot_A.png"
    plugin_version = "0.1.0"
    plugin_author = "MoviePilotMediaGovernor contributors"
    author_url = ""
    plugin_config_prefix = "mediagovernor_"
    plugin_order = 99
    auth_level = 1

    _enabled = False

    def init_plugin(self, config: dict[str, Any] | None = None) -> None:
        """仅读取启用状态；重复初始化不创建资源或副作用。"""
        self._enabled = bool((config or {}).get("enabled"))

    def get_state(self) -> bool:
        """返回当前实例是否启用。"""
        return self._enabled

    @staticmethod
    def get_command() -> list[dict[str, Any]]:
        """S1 不注册远程命令，避免误触发媒体操作。"""
        return []

    def get_api(self) -> list[dict[str, Any]]:
        """S1 不暴露 HTTP API，先收窄到官方最小生命周期合同。"""
        return []

    def get_form(self) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        """提供默认关闭的显式开关。"""
        return [
            {
                "component": "VForm",
                "content": [
                    {
                        "component": "VSwitch",
                        "props": {
                            "model": "enabled",
                            "label": "启用 S1 兼容性验证",
                        },
                    }
                ],
            }
        ], {"enabled": False}

    def get_page(self) -> list[dict[str, Any]]:
        """明确显示当前不具备任何媒体整理执行能力。"""
        return [
            {
                "component": "VAlert",
                "props": {
                    "type": "info",
                    "variant": "tonal",
                    "text": (
                        "当前为 S1 兼容性验证：不监听整理事件、不调用整理链、"
                        "不访问下载目录，不移动、改名或删除任何文件。"
                    ),
                },
            }
        ]

    def stop_service(self) -> None:
        """当前没有后台资源；保持重复调用安全。"""
        self._enabled = False
