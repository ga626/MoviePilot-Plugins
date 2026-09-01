"""MediaGovernor 的纯领域模型、问题台状态机与零写入计划闸门。

本模块不导入 MoviePilot 宿主，也不访问文件、网络或数据库。宿主适配仅在
``__init__.py`` 中发生；这样可用脱敏夹具验证归并、状态、去重与计划安全边界。
"""

from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
import json
import time
from typing import Any, Callable, Mapping


def _value(source: Any, name: str, default: Any = None) -> Any:
    """同时读取宿主模型、夹具对象和字典，绝不读取文件路径。"""
    return source.get(name, default) if isinstance(source, Mapping) else getattr(source, name, default)


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


def _now() -> int:
    return int(time.time())


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
    transfer_mode: str | None

    @classmethod
    def from_contract(cls, event_kind: str, payload: Any, history: Any = None) -> "EventObservation | None":
        """从公开事件合同和只读历史记录构造投影。"""
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
            transfer_mode=_text(
                _value(payload, "transfer_mode")
                or _value(payload, "transfer_type")
                or _value(history, "transfer_mode")
                or _value(history, "transfer_type")
            ),
        )

    def identity_fields(self) -> dict[str, str | None]:
        return {
            "media_source": self.media_source,
            "media_id": self.media_id,
            "media_type": self.media_type,
            "title": self.title,
            "year": self.year,
            "season": self.season,
        }

    @property
    def package_id(self) -> str:
        return f"mg-{_digest(self.identity_fields())[:16]}"

    @property
    def dedup_key(self) -> str:
        if self.history_id is not None:
            return f"history:{self.history_id}"
        return f"event:{_digest({'idempotency_key': self.event_key})[:24]}"

    def public_fields(self) -> dict[str, str | int | None]:
        return {**self.identity_fields(), "history_id": self.history_id, "transfer_mode": self.transfer_mode}


class GovernanceQueue:
    """作品包聚合、后置对账与零写入计划；不含文件名、路径或宿主对象。"""

    _SCHEMA = "mediagovernor-queue/v2"
    _PLAN_TTL_SECONDS = 15 * 60

    def __init__(self, packages: dict[str, dict[str, Any]] | None = None, plans: dict[str, dict[str, Any]] | None = None, dedup_index: dict[str, dict[str, str]] | None = None) -> None:
        self._packages = packages or {}
        self._plans = plans or {}
        self._dedup_index = dedup_index or {}

    @classmethod
    def from_data(cls, raw: Any) -> "GovernanceQueue":
        if not isinstance(raw, Mapping) or raw.get("schema") not in {cls._SCHEMA, "mediagovernor-s3-queue/v1"}:
            return cls()
        packages = raw.get("packages")
        plans = raw.get("plans") if raw.get("schema") == cls._SCHEMA else {}
        dedup_index = raw.get("dedup_index") if raw.get("schema") == cls._SCHEMA else {}
        return cls(dict(packages) if isinstance(packages, Mapping) else {}, dict(plans) if isinstance(plans, Mapping) else {}, dict(dedup_index) if isinstance(dedup_index, Mapping) else {})

    @staticmethod
    def _identity_complete(observation: EventObservation) -> bool:
        return bool(observation.media_source and observation.media_id and observation.media_type and observation.title)

    @staticmethod
    def _normalise_mode(value: str | None) -> str | None:
        if not value:
            return None
        lowered = value.lower()
        return "link" if lowered in {"link", "hardlink", "hard_link"} else lowered

    @staticmethod
    def _add_reason(package: dict[str, Any], reason: str) -> None:
        if reason not in package.setdefault("reason_codes", []):
            package["reason_codes"].append(reason)

    def _package_for(self, observation: EventObservation) -> dict[str, Any]:
        package = self._packages.get(observation.package_id)
        if package is None:
            package = {
                "package_id": observation.package_id,
                "dedup_keys": [],
                "dedup_identities": {},
                "history_ids": [],
                "failed_history_ids": [],
                "event_count": 0,
                "success_count": 0,
                "failure_count": 0,
                "status": "awaiting_host_information",
                "reason_codes": [],
                "transfer_modes": [],
                "receipt_version": 0,
                **observation.public_fields(),
            }
            self._packages[observation.package_id] = package
        return package

    def _reconcile(self, package: dict[str, Any], observation: EventObservation) -> None:
        """只基于已公开字段做后置结论；信息不足时明确降级。"""
        reasons = package.setdefault("reason_codes", [])
        if package.get("failure_count", 0):
            package["status"] = "needs_attention"
            self._add_reason(package, "transfer_failed")
            return
        if "identity_conflict" in reasons:
            package["status"] = "needs_selection"
            return
        mode = self._normalise_mode(observation.transfer_mode)
        if mode and mode != "link":
            package["status"] = "needs_attention"
            self._add_reason(package, "unexpected_transfer_mode")
            return
        missing: list[str] = []
        if not self._identity_complete(observation):
            missing.append("media_identity")
        if mode is None:
            missing.append("transfer_mode")
        if missing:
            package["status"] = "awaiting_host_information"
            for field in missing:
                self._add_reason(package, f"missing_{field}")
            return
        package["status"] = "verified"
        package["reason_codes"] = [reason for reason in reasons if not reason.startswith("missing_")]

    def observe(self, observation: EventObservation) -> bool:
        """归并事件；同一去重键的身份改变会变成通用冲突问题。"""
        identity_digest = _digest(observation.identity_fields())
        known = self._dedup_index.get(observation.dedup_key)
        if known:
            if known.get("identity") != identity_digest:
                package = self._packages.get(known.get("package_id", ""))
                if package:
                    self._add_reason(package, "identity_conflict")
                    package["status"] = "needs_selection"
                    package["receipt_version"] += 1
                    return True
            return False
        package = self._package_for(observation)
        package["dedup_keys"].append(observation.dedup_key)
        package["dedup_identities"][observation.dedup_key] = identity_digest
        self._dedup_index[observation.dedup_key] = {"identity": identity_digest, "package_id": package["package_id"]}
        package["event_count"] += 1
        package["receipt_version"] += 1
        mode = self._normalise_mode(observation.transfer_mode)
        if mode and mode not in package["transfer_modes"]:
            package["transfer_modes"].append(mode)
        if observation.history_id is not None and observation.history_id not in package["history_ids"]:
            package["history_ids"].append(observation.history_id)
        if observation.event_kind == "failed":
            package["failure_count"] += 1
            if observation.history_id is not None and observation.history_id not in package["failed_history_ids"]:
                package["failed_history_ids"].append(observation.history_id)
        else:
            package["success_count"] += 1
        self._reconcile(package, observation)
        return True

    def observe_failed_history(self, history: Any) -> bool:
        history_id = _value(history, "id")
        observation = EventObservation.from_contract("failed", {"transfer_history_id": history_id}, history)
        return bool(observation) and self.observe(observation)

    def to_data(self) -> dict[str, Any]:
        return {"schema": self._SCHEMA, "packages": self._packages, "plans": self._plans, "dedup_index": self._dedup_index}

    @staticmethod
    def _public_package(package: Mapping[str, Any]) -> dict[str, Any]:
        fields = (
            "package_id", "media_source", "media_id", "media_type", "title", "year", "season",
            "history_ids", "event_count", "success_count", "failure_count", "status", "reason_codes",
            "transfer_modes", "receipt_version", "last_preview",
        )
        return {field: package.get(field) for field in fields}

    def public_items(self) -> list[dict[str, Any]]:
        return [self._public_package(package) for package in sorted(self._packages.values(), key=lambda item: item["package_id"])]

    def public_summary(self) -> dict[str, int]:
        summary = {"verified": 0, "needs_attention": 0, "needs_selection": 0, "awaiting_host_information": 0}
        for package in self._packages.values():
            status = package.get("status")
            if status in summary:
                summary[status] += 1
        return summary

    def allows_preview(self, history_id: int) -> bool:
        return any(history_id in package.get("failed_history_ids", []) for package in self._packages.values())

    def record_preview(self, history_id: int, result: Mapping[str, Any], now: int | None = None) -> dict[str, Any] | None:
        """登记一份有时效、可审计、零写入的补救计划。"""
        if not self.allows_preview(history_id) or not bool(result.get("ok")):
            return None
        package = next((item for item in self._packages.values() if history_id in item.get("failed_history_ids", [])), None)
        if package is None:
            return None
        issued_at = _now() if now is None else now
        plan_id = f"mgp-{_digest({'package_id': package['package_id'], 'history_id': history_id, 'receipt_version': package['receipt_version']})[:16]}"
        plan = {
            "plan_id": plan_id,
            "package_id": package["package_id"],
            "history_id": history_id,
            "status": "ready",
            "mode": "preview",
            "transfer_type": "link",
            "issued_at": issued_at,
            "expires_at": issued_at + self._PLAN_TTL_SECONDS,
            "receipt_version": package["receipt_version"],
            "detail": str(result.get("detail") or "preview_ready"),
        }
        self._plans[plan_id] = plan
        return dict(plan)

    def record_preview_outcome(self, history_id: int, result: Mapping[str, Any], now: int | None = None) -> dict[str, Any] | None:
        """把最近一次零写入预演的结果归回对应问题卡，不保存路径或宿主对象。"""
        package = next((item for item in self._packages.values() if history_id in item.get("failed_history_ids", [])), None)
        if package is None:
            return None
        outcome = {
            "history_id": history_id,
            "status": "ready" if bool(result.get("ok")) else "rejected",
            "mode": "preview",
            "transfer_type": "link",
            "checked_at": _now() if now is None else now,
            "detail": str(result.get("detail") or ("preview_ready" if result.get("ok") else "preview_rejected")),
        }
        package["last_preview"] = outcome
        package["receipt_version"] += 1
        return dict(outcome)

    def public_plans(self) -> list[dict[str, Any]]:
        return [dict(plan) for plan in sorted(self._plans.values(), key=lambda item: item["plan_id"])]

    def public_plan(self, plan_id: str, now: int | None = None) -> dict[str, Any] | None:
        plan = self._plans.get(plan_id)
        if plan is None:
            return None
        public = dict(plan)
        if (now if now is not None else _now()) >= public["expires_at"]:
            public["status"] = "expired"
        return public

    def begin_repair(self, plan_id: str, now: int | None = None) -> dict[str, Any] | None:
        """原子地占用已验证的计划，避免一次确认被重复执行。"""
        public = self.public_plan(plan_id, now=now)
        if public is None or public.get("status") != "ready":
            return None
        plan = self._plans[plan_id]
        plan["status"] = "executing"
        plan["repair_started_at"] = _now() if now is None else now
        return dict(plan)

    def complete_repair(self, plan_id: str, result: Mapping[str, Any], now: int | None = None) -> dict[str, Any] | None:
        """只保留执行状态和时间，不保存目标路径或宿主返回对象。"""
        plan = self._plans.get(plan_id)
        if plan is None or plan.get("status") != "executing":
            return None
        plan["status"] = "completed" if bool(result.get("ok")) else "failed"
        plan["repair_finished_at"] = _now() if now is None else now
        plan["repair_detail"] = str(result.get("detail") or ("repair_completed" if result.get("ok") else "repair_failed"))
        return dict(plan)


class NativePreviewGateway:
    """唯一允许的原生整理调用：强制硬链接预演，且不返回路径。"""

    def __init__(self, chain_factory: Callable[[], Any]) -> None:
        self._chain_factory = chain_factory

    def preview(self, fileitem: Any) -> dict[str, str | bool]:
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
        return {"mode": "preview", "transfer_type": "link", "ok": bool(state), "detail": "preview_ready" if state else "preview_rejected"}

    def repair(self, fileitem: Any) -> dict[str, str | bool]:
        """只允许用户确认后的单计划硬链接修复，绝不删除、覆盖或重整。"""
        state, _result = self._chain_factory().manual_transfer(
            fileitem=fileitem,
            transfer_type="link",
            preview=False,
            background=False,
            force=False,
            scrape=False,
            reorganize=False,
            sync_extra_files=False,
        )
        return {"mode": "repair", "transfer_type": "link", "ok": bool(state), "detail": "repair_completed" if state else "repair_failed"}
