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

    def observe_history(self, history: Any) -> bool:
        """把宿主历史投影进质量闸门；状态字段只用于区分成功与失败。"""
        history_id = _value(history, "id")
        event_kind = "complete" if bool(_value(history, "status")) else "failed"
        observation = EventObservation.from_contract(event_kind, {"transfer_history_id": history_id}, history)
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

    def failed_history_ids(self) -> list[int]:
        """返回可批量检查的失败历史编号，绝不包含文件信息。"""
        return sorted({history_id for package in self._packages.values() for history_id in package.get("failed_history_ids", []) if isinstance(history_id, int)})

    def auditable_history_ids(self) -> list[int]:
        """返回已进入质量闸门的成功和失败记录，不把“成功”排除在检查外。"""
        return sorted({history_id for package in self._packages.values() for history_id in package.get("history_ids", []) if isinstance(history_id, int)})

    def history_context(self, history_id: int) -> dict[str, Any] | None:
        """提供脱敏质量核查上下文；不返回源文件、目标路径或宿主对象。"""
        package = next((item for item in self._packages.values() if history_id in item.get("history_ids", [])), None)
        if package is None:
            return None
        return {
            "event_kind": "failed" if history_id in package.get("failed_history_ids", []) else "complete",
            "identity": self.identity_for_history(history_id) or {
                "title": _text(package.get("title")),
                "year": _text(package.get("year"), 12),
                "media_source": _text(package.get("media_source"), 32),
                "media_id": _text(package.get("media_id"), 64),
                "media_type": _text(package.get("media_type"), 32),
            },
            "transfer_mode": next((mode for mode in package.get("transfer_modes", []) if isinstance(mode, str)), None),
        }

    def identity_for_history(self, history_id: int) -> dict[str, str | None] | None:
        """取回宿主曾保存的作品身份；不回退到网络识别或原始文件名。"""
        package = next((item for item in self._packages.values() if history_id in item.get("failed_history_ids", [])), None)
        if package is None:
            return None
        return {
            "title": _text(package.get("title")),
            "year": _text(package.get("year"), 12),
            "media_source": _text(package.get("media_source"), 32),
            "media_id": _text(package.get("media_id"), 64),
            "media_type": _text(package.get("media_type"), 32),
        }

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
        # 每次新的模拟检查都以本次结果为准。即使本次同样通过，旧计划
        # 也不能继续代表当前状态，避免用户误点早先的处理方案。
        for previous in self._plans.values():
            if previous.get("history_id") == history_id and previous.get("status") == "ready":
                previous["status"] = "superseded"
                previous["repair_detail"] = "superseded_by_latest_check"
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
        # 一次新的模拟检查若不能安全继续，之前为同一条历史记录准备的
        # 旧计划就不再能代表当前状态。显式作废，避免界面把旧的“可修复”
        # 误展示成仍可执行的操作。
        if outcome["status"] != "ready":
            for plan in self._plans.values():
                if plan.get("history_id") == history_id and plan.get("status") == "ready":
                    plan["status"] = "superseded"
                    plan["repair_detail"] = "superseded_by_latest_check"
        package["receipt_version"] += 1
        return dict(outcome)

    def public_plans(self) -> list[dict[str, Any]]:
        return [self.public_plan(plan["plan_id"]) for plan in sorted(self._plans.values(), key=lambda item: item["plan_id"]) if self.public_plan(plan["plan_id"]) is not None]

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


class BatchAudit:
    """可恢复的逐条检查状态；只保存中文结论，不保存路径或原始文件名。"""

    _SCHEMA = "mediagovernor-batch-audit/v3"
    _LEGACY_SCHEMAS = {"mediagovernor-batch-audit/v2"}
    _PENDING = "pending"
    _CHECKING = "checking"

    def __init__(
        self,
        records: dict[str, dict[str, Any]] | None = None,
        run: Mapping[str, Any] | None = None,
    ) -> None:
        self._records = records or {}
        self._run = dict(run or {"state": "idle", "history_ids": []})
        self._recover_interrupted_item()

    @classmethod
    def from_data(cls, raw: Any) -> "BatchAudit":
        if not isinstance(raw, Mapping) or raw.get("schema") not in {cls._SCHEMA, *cls._LEGACY_SCHEMAS}:
            return cls()
        records = raw.get("records")
        run = raw.get("run")
        return cls(
            dict(records) if isinstance(records, Mapping) else {},
            run if isinstance(run, Mapping) else None,
        )

    def _recover_interrupted_item(self) -> None:
        """宿主重载或网页中断时，把没有结论的领取项放回队列。

        一次 API 调用只处理一条记录；因此 ``checking`` 不代表可交付结论，
        不能在下次进入页面时把它永久遗漏。
        """
        interrupted = False
        for record in self._records.values():
            if record.get("status") == self._CHECKING:
                record["status"] = self._PENDING
                interrupted = True
        if interrupted:
            self._run["current_history_id"] = None
            if self._run.get("state") == "complete":
                self._run["state"] = "paused"

    def start(self, history_ids: list[int], now: int | None = None) -> dict[str, Any]:
        """开始一轮新检查，并立即持久化逐条游标以便中断后继续。"""
        issued_at = _now() if now is None else now
        unique_ids = list(dict.fromkeys(history_ids))
        self._records = {
            str(history_id): {
                "history_id": history_id,
                "status": self._PENDING,
                "checked_at": None,
                "title": None,
                "year": None,
                "media_source": None,
                "media_id": None,
                "media_type": None,
            }
            for history_id in unique_ids
        }
        self._run = {
            "state": "running" if unique_ids else "complete",
            "history_ids": unique_ids,
            "started_at": issued_at,
            "finished_at": issued_at if not unique_ids else None,
            "current_history_id": None,
        }
        return self.summary(unique_ids)

    def resume_or_start(self, history_ids: list[int], now: int | None = None) -> dict[str, Any]:
        """恢复同一轮未完成检查；只有明确完成后才开始新一轮。"""
        unique_ids = list(dict.fromkeys(history_ids))
        existing_ids = self._history_ids()
        if existing_ids == unique_ids and self._run.get("state") in {"running", "paused"}:
            self._recover_interrupted_item()
            self._run["state"] = "running"
            self._run["finished_at"] = None
            return self.summary(unique_ids)
        return self.start(unique_ids, now=now)

    def resume(self, history_ids: list[int], now: int | None = None) -> dict[str, Any]:
        """只恢复暂停的本轮，不把“再次检查”误当成恢复旧结果。"""
        unique_ids = list(dict.fromkeys(history_ids))
        if self._history_ids() == unique_ids and self._run.get("state") in {"running", "paused"}:
            return self.resume_or_start(unique_ids, now=now)
        return self.summary(unique_ids)

    def pause(self) -> dict[str, Any]:
        """请求在当前单条完成后暂停；不会中断宿主正在执行的只读识别。"""
        if self._run.get("state") == "running":
            self._run["state"] = "paused"
            self._run["current_history_id"] = None
        return self.summary(self._history_ids())

    def claim_next(self) -> int | None:
        """领取一条待检查记录；每次 HTTP 调用最多处理一条。"""
        if self._run.get("state") != "running":
            return None
        for history_id in self._history_ids():
            record = self._records.get(str(history_id))
            if record and record.get("status") == self._PENDING:
                record["status"] = self._CHECKING
                self._run["current_history_id"] = history_id
                return history_id
        self._complete()
        return None

    def _history_ids(self) -> list[int]:
        values = self._run.get("history_ids")
        return [value for value in values if isinstance(value, int)] if isinstance(values, list) else []

    def _complete(self, now: int | None = None) -> None:
        self._run["state"] = "complete"
        self._run["current_history_id"] = None
        self._run["finished_at"] = _now() if now is None else now

    @staticmethod
    def _identity(identity: Mapping[str, Any] | None) -> dict[str, str | None]:
        identity = identity or {}
        return {
            "title": _text(identity.get("title")),
            "year": _text(identity.get("year"), 12),
            "media_source": _text(identity.get("media_source"), 32),
            "media_id": _text(identity.get("media_id"), 64),
            "media_type": _text(identity.get("media_type"), 32),
        }

    @staticmethod
    def _is_reliable(identity: Mapping[str, str | None]) -> bool:
        return bool(identity.get("title") and identity.get("media_source") and identity.get("media_id") and identity.get("media_type"))

    def record(
        self,
        history_id: int,
        identity: Mapping[str, Any] | None,
        preview: Mapping[str, Any] | None = None,
        *,
        source_available: bool = True,
        checked_at: int | None = None,
    ) -> dict[str, Any]:
        """记录一次真实检查结论，只保存可展示身份和安全结论。"""
        fields = self._identity(identity)
        if not source_available:
            status, detail = "source_unavailable", "该历史记录已不可用于检查"
        elif not self._is_reliable(fields):
            status, detail = "identity_unresolved", "未能可靠识别作品"
        elif preview is None:
            status, detail = "needs_preview", "已识别作品，等待生成处理方案"
        elif bool(preview.get("ok")):
            status, detail = "ready_to_plan", "可以创建硬链接"
        else:
            status, detail = "preview_rejected", "目前不能安全创建硬链接"
        record = {
            "history_id": history_id,
            "status": status,
            "detail": detail,
            "category": {
                "source_unavailable": "历史记录不可用",
                "identity_unresolved": "作品身份无法确认",
                "needs_preview": "等待补建前检查",
                "ready_to_plan": "可安全补建硬链接",
                "preview_rejected": "补建前检查未通过",
            }[status],
            "transfer_mode": None,
            "checked_at": _now() if checked_at is None else checked_at,
            **fields,
        }
        self._records[str(history_id)] = record
        if self._run.get("current_history_id") == history_id:
            self._run["current_history_id"] = None
        if self._run.get("state") == "running" and not any(
            item.get("status") in {self._PENDING, self._CHECKING}
            for item in self._records.values()
        ):
            self._complete(checked_at)
        return dict(record)

    def record_preview(self, history_id: int, preview: Mapping[str, Any]) -> dict[str, Any] | None:
        """把单条硬链接预演写回已有的检查结论，保留原有的安全身份投影。"""
        existing = self._records.get(str(history_id))
        if existing is None:
            return None
        return self.record(history_id, existing, preview)

    def record_complete_quality(
        self,
        history_id: int,
        identity: Mapping[str, Any] | None,
        transfer_mode: str | None,
        *,
        source_available: bool = True,
        checked_at: int | None = None,
    ) -> dict[str, Any]:
        """记录成功整理后的有限结论，不把历史字段误报成文件实况。"""
        fields = self._identity(identity)
        mode = _text(transfer_mode, 32)
        normalised = mode.lower() if mode else None
        if not source_available:
            status, detail = "source_unavailable", "该历史记录已不可用于检查"
        elif not self._is_reliable(fields):
            status, detail = "identity_unresolved", "成功记录没有可靠作品身份，无法确认归类是否正确"
        elif not normalised:
            status, detail = "transfer_mode_unknown", "历史记录未保存整理方式，无法确认是否符合硬链接策略"
        elif normalised not in {"link", "hardlink", "hard_link"}:
            status, detail = "transfer_mode_mismatch", f"历史记录显示为“{mode}”；这与当前硬链接策略不一致，但尚未逐个验证实际文件"
        else:
            status, detail = "verified", "已确认作品身份和硬链接整理方式"
        category = {
            "source_unavailable": "历史记录不可用",
            "identity_unresolved": "作品身份无法确认",
            "transfer_mode_unknown": "整理方式未记录",
            "transfer_mode_mismatch": "整理方式与硬链接策略不一致",
            "verified": "已核对",
        }[status]
        record = {
            "history_id": history_id,
            "status": status,
            "detail": detail,
            "category": category,
            "transfer_mode": mode,
            "checked_at": _now() if checked_at is None else checked_at,
            **fields,
        }
        self._records[str(history_id)] = record
        if self._run.get("current_history_id") == history_id:
            self._run["current_history_id"] = None
        if self._run.get("state") == "running" and not any(item.get("status") in {self._PENDING, self._CHECKING} for item in self._records.values()):
            self._complete(checked_at)
        return dict(record)

    def summary(self, history_ids: list[int]) -> dict[str, Any]:
        known = {str(history_id) for history_id in history_ids}
        records = [record for key, record in self._records.items() if key in known]
        checked = sum(record.get("status") not in {self._PENDING, self._CHECKING} for record in records)
        state = str(self._run.get("state") or "idle")
        if state == "idle" and known and checked == len(known):
            state = "complete"
        return {
            "state": state,
            "total": len(known),
            "checked": checked,
            "pending": max(0, len(known) - checked),
            "actionable": sum(record.get("status") == "ready_to_plan" for record in records),
            "ready_for_preview": sum(record.get("status") == "needs_preview" for record in records),
            "needs_attention": sum(record.get("status") in {"identity_unresolved", "preview_rejected", "source_unavailable", "transfer_mode_unknown", "transfer_mode_mismatch"} for record in records),
            "unresolved": sum(record.get("status") == "identity_unresolved" for record in records),
            "blocked": sum(record.get("status") in {"preview_rejected", "source_unavailable"} for record in records),
            "strategy_review": sum(record.get("status") in {"transfer_mode_unknown", "transfer_mode_mismatch"} for record in records),
            "current_history_id": self._run.get("current_history_id"),
        }

    def public_items(self, history_ids: list[int]) -> list[dict[str, Any]]:
        """按作品汇总已检查结论，不用每一集或每个文件淹没用户。"""
        allowed = {str(history_id) for history_id in history_ids}
        visible_statuses = {
            "preview_rejected", "ready_to_plan", "needs_preview", "source_unavailable",
            "transfer_mode_unknown", "transfer_mode_mismatch",
        }
        groups: dict[str, list[dict[str, Any]]] = {}
        for key, stored in self._records.items():
            if key not in allowed or stored.get("status") not in visible_statuses:
                continue
            record = dict(stored)
            identity = {
                "media_source": record.get("media_source"),
                "media_id": record.get("media_id"),
                "media_type": record.get("media_type"),
            }
            if all(identity.values()):
                group_key = f"media:{_digest(identity)[:20]}"
            else:
                # 没有可靠身份时不混合不同历史记录；但这种记录不会在这里显示成
                # “待确认影片”卡，而是由摘要统一说明。
                group_key = f"history:{record.get('history_id')}"
            groups.setdefault(group_key, []).append(record)

        result: list[dict[str, Any]] = []
        for group_key, members in groups.items():
            first = max(members, key=lambda item: int(item.get("history_id") or 0))
            categories: dict[tuple[str, str, str | None], list[dict[str, Any]]] = {}
            for member in members:
                category_key = (str(member.get("status")), str(member.get("category") or "需要复核"), _text(member.get("transfer_mode"), 32))
                categories.setdefault(category_key, []).append(member)
            findings = [
                {
                    "status": status,
                    "title": category,
                    "detail": members_for_category[0].get("detail"),
                    "count": len(members_for_category),
                    "transfer_mode": mode,
                }
                for (status, category, mode), members_for_category in sorted(categories.items())
            ]
            result.append({
                "group_id": group_key,
                "title": first.get("title"),
                "year": first.get("year"),
                "media_type": first.get("media_type"),
                "record_count": len(members),
                "history_ids": sorted(int(member["history_id"]) for member in members if isinstance(member.get("history_id"), int)),
                "findings": findings,
                "repairable_count": sum(member.get("status") in {"needs_preview", "ready_to_plan"} for member in members),
                "repairable_history_ids": sorted(
                    int(member["history_id"])
                    for member in members
                    if member.get("status") in {"needs_preview", "ready_to_plan"} and isinstance(member.get("history_id"), int)
                ),
                "last_checked_at": max(int(member.get("checked_at") or 0) for member in members),
            })
        return sorted(result, key=lambda item: int(item.get("last_checked_at") or 0), reverse=True)

    def to_data(self) -> dict[str, Any]:
        return {"schema": self._SCHEMA, "records": self._records, "run": self._run}


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
