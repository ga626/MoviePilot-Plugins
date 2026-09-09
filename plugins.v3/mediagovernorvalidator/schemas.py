"""MediaGovernorValidator 的稳定状态与脱敏工具。"""
from __future__ import annotations

from datetime import datetime, timezone
from dataclasses import asdict, is_dataclass
import hashlib
import hmac
import json
from pathlib import PurePosixPath
from typing import Any


STAGES = (
    ("V0", "宿主能力预检"),
    ("V1", "新下载与旧库存边界"),
    ("V2", "完整证据编译"),
    ("V3", "AI 格式与批次实验"),
    ("V4", "数据库候选核验"),
    ("V5", "官方预览合同"),
    ("V6", "源、当前目标与应有目标对账"),
    ("V7", "隐藏答案真值回放"),
    ("V8", "停止、恢复与增量验证"),
)

STAGE_DEPENDENCIES = {
    "V0": (), "V1": ("V0",), "V2": ("V1",), "V3": ("V2",),
    "V4": ("V3",), "V5": ("V4",), "V6": ("V1", "V5"),
    "V7": ("V6",), "V8": ("V7",),
}

TERMINAL_STAGE_STATES = {"passed", "failed", "blocked", "skipped"}
RUNNING_STATES = {"running", "stopping"}


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def model_dict(value: Any) -> dict[str, Any]:
    if value is None:
        return {}
    if isinstance(value, dict):
        return dict(value)
    if is_dataclass(value):
        return asdict(value)
    for method in ("model_dump", "dict"):
        fn = getattr(value, method, None)
        if callable(fn):
            return fn(mode="json") if method == "model_dump" else fn()
    try:
        return {key: item for key, item in vars(value).items() if not key.startswith("_")}
    except TypeError:
        return {}


def canonical(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)


def digest(value: Any) -> str:
    return hashlib.sha256(canonical(value).encode("utf-8")).hexdigest()


def anonymous_id(salt: bytes, *parts: Any, prefix: str = "item") -> str:
    message = "\0".join(str(part) for part in parts).encode("utf-8", errors="replace")
    return f"{prefix}_{hmac.new(salt, message, hashlib.sha256).hexdigest()[:16]}"


def normalized_path(value: Any) -> str:
    text = str(value or "").replace("\\", "/").strip()
    while "//" in text:
        text = text.replace("//", "/")
    return text.rstrip("/").casefold()


def safe_relative(path: Any, root: Any) -> str:
    full = str(path or "").replace("\\", "/").strip("/")
    base = str(root or "").replace("\\", "/").strip("/")
    if base and full.casefold().startswith((base + "/").casefold()):
        full = full[len(base) + 1 :]
    elif base and full.casefold() == base.casefold():
        full = PurePosixPath(full).name
    # 不把盘符或绝对根写入运行态证据。
    parts = [part for part in PurePosixPath(full).parts if part not in {"/", "..", "."}]
    if parts and parts[0].endswith(":"):
        parts = parts[1:]
    return "/".join(parts) or "item"


def public_error(error: BaseException) -> str:
    name = type(error).__name__
    text = str(error).replace("\\", "/")
    # 错误正文只保留最后一段，避免真实根路径进入报告。
    if "/" in text:
        text = text.rsplit("/", 1)[-1]
    return f"{name}: {text[:240]}"
