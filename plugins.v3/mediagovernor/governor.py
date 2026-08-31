"""S3 的纯内存媒体治理模型。

本模块不导入 MoviePilot 宿主，也不访问文件、网络或数据库。宿主适配仅在
``__init__.py`` 中发生；这样可以用脱敏夹具验证归并、去重和预览闸门。
"""

from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
import json
from typing import Any, Callable, Mapping


def _value(source: Any, name: str, default: Any = None) -> Any:
    """同时读取宿主模型、夹具对象和字典，绝不读取文件路径。"""
    if isinstance(source, Mapping):
        return source.get(name, default)
    return getattr(source, name, default)


def _text(value: Any, limit: int = 160) -> str | None:
    """把可展示的元数据压缩为稳定、非路径的文本。"""
    if value is None:
        return None
    raw = getattr(value, "value", value)
    text = str(raw).strip()
    return text[:limit] if text else None


def _digest(parts: Mapping[str, Any]) -> str:
    """为脱敏结构生成稳定指纹。"""
    encoded = json.dumps(parts, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return sha256(encoded.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class EventObservation:
    """整理结果的最小、无路径观察投影。"""

    event_kind: str
    history_id: int | None
    event_key: str | None
    media_source: str | None
    media_id: str | None
    media_type: str | None
    title: str | None
    year: str | None
    season: str | None

    @classmethod
    def from_contract(
        cls,
        event_kind: str,
        payload: Any,
        history: Any = None,
    ) -> "EventObservation | None":
        """从稳定事件合同和可选的只读历史记录构造投影。

        缺少历史 ID 与事件幂等键时直接拒绝观察，避免以源文件路径充当去重键。
        """
        history_id = _value(payload, "transfer_history_id")
        try:
            history_id = int(history_id) if history_id is not None else None
        except (TypeError, ValueError):
            history_id = None
        event_key = _text(_value(payload, "idempotency_key"), 256)
        if history_id is None and event_key is None:
            return None

        media = _value(payload, "mediainfo") or history
        return cls(
            event_kind=event_kind,
            history_id=history_id,
            event_key=event_key,
            media_source=_text(_value(media, "media_source")),
            media_id=_text(_value(media, "media_id")),
            media_type=_text(_value(media, "type") or _value(media, "mtype")),
            title=_text(_value(media, "title")),
            year=_text(_value(media, "year")),
            season=_text(_value(media, "season") or _value(media, "seasons")),
        )

    @property
    def package_id(self) -> str:
        """按规范媒体身份优先的通用作品包指纹。"""
        identity = {
            "media_source": self.media_source,
            "media_id": self.media_id,
            "media_type": self.media_type,
            "title": self.title,
            "year": self.year,
            "season": self.season,
        }
        return f"mg-{_digest(identity)[:16]}"

    @property
    def dedup_key(self) -> str:
        """只以稳定历史号或上游幂等键去重。"""
        if self.history_id is not None:
            return f"history:{self.history_id}"
        return f"event:{_digest({'idempotency_key': self.event_key})[:24]}"

    def public_fields(self) -> dict[str, str | int | None]:
        """返回可持久化及展示的脱敏字段。"""
        return {
            "media_source": self.media_source,
            "media_id": self.media_id,
            "media_type": self.media_type,
            "title": self.title,
            "year": self.year,
            "season": self.season,
            "history_id": self.history_id,
        }


class GovernanceQueue:
    """作品包聚合与至少一次事件去重；不含文件名、路径或宿主对象。"""

    _SCHEMA = "mediagovernor-s3-queue/v1"

    def __init__(self, packages: dict[str, dict[str, Any]] | None = None) -> None:
        self._packages = packages or {}

    @classmethod
    def from_data(cls, raw: Any) -> "GovernanceQueue":
        """只接受本插件此前保存的受限结构。"""
        if not isinstance(raw, Mapping) or raw.get("schema") != cls._SCHEMA:
            return cls()
        packages = raw.get("packages")
        return cls(dict(packages) if isinstance(packages, Mapping) else {})

    def observe(self, observation: EventObservation) -> bool:
        """归并一条事件；重复事件不改变队列。"""
        package = self._packages.get(observation.package_id)
        if package is None:
            package = {
                "package_id": observation.package_id,
                "dedup_keys": [],
                "history_ids": [],
                "failed_history_ids": [],
                "event_count": 0,
                "success_count": 0,
                "failure_count": 0,
                "status": "observed",
                **observation.public_fields(),
            }
            self._packages[observation.package_id] = package
        if observation.dedup_key in package["dedup_keys"]:
            return False

        package["dedup_keys"].append(observation.dedup_key)
        package["event_count"] += 1
        if observation.history_id is not None and observation.history_id not in package["history_ids"]:
            package["history_ids"].append(observation.history_id)
        if observation.event_kind == "failed":
            package["failure_count"] += 1
            package["status"] = "needs_review"
            if observation.history_id is not None and observation.history_id not in package["failed_history_ids"]:
                package["failed_history_ids"].append(observation.history_id)
        else:
            package["success_count"] += 1
        return True

    def to_data(self) -> dict[str, Any]:
        """序列化插件自己的状态；不包含源路径、目标路径或 FileItem。"""
        return {"schema": self._SCHEMA, "packages": self._packages}

    def public_items(self) -> list[dict[str, Any]]:
        """返回页面/API 所需的最小队列卡片。"""
        fields = (
            "package_id", "media_source", "media_id", "media_type", "title", "year",
            "season", "history_ids", "event_count", "success_count", "failure_count", "status",
        )
        return [
            {field: package.get(field) for field in fields}
            for package in sorted(self._packages.values(), key=lambda item: item["package_id"])
        ]

    def allows_preview(self, history_id: int) -> bool:
        """仅允许队列中已出现过的失败作品包请求预览。"""
        return any(history_id in package.get("failed_history_ids", []) for package in self._packages.values())


class NativePreviewGateway:
    """唯一允许的原生整理调用：强制为硬链接预览，且不会返回路径。"""

    def __init__(self, chain_factory: Callable[[], Any]) -> None:
        self._chain_factory = chain_factory

    def preview(self, fileitem: Any) -> dict[str, str | bool]:
        """调用宿主预览，不提供任何可执行参数给调用方。"""
        state, _result = self._chain_factory().manual_transfer(
            fileitem=fileitem,
            transfer_type="link",
            preview=True,
            background=False,
            force=False,
            scrape=False,
            reorganize=False,
            sync_extra_files=False,
        )
        return {
            "mode": "preview",
            "transfer_type": "link",
            "ok": bool(state),
            "detail": "preview_ready" if state else "preview_rejected",
        }
