"""把完整边界编译成可审计、可压缩且不丢文件的 AI 证据。"""
from __future__ import annotations

from collections import Counter
import copy
from pathlib import PurePosixPath
import re
from typing import Any

from .schemas import anonymous_id, digest, safe_relative


VIDEO_EXTENSIONS = {".mkv", ".mp4", ".avi", ".mov", ".m2ts", ".ts", ".wmv", ".flv", ".webm", ".iso"}
SUBTITLE_EXTENSIONS = {".srt", ".ass", ".ssa", ".sub", ".sup", ".vtt"}
METADATA_EXTENSIONS = {".nfo", ".xml", ".json"}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
IGNORE_NAMES = {"thumbs.db", ".ds_store"}


def file_kind(relative: str) -> str:
    suffix = PurePosixPath(relative).suffix.casefold()
    if suffix in VIDEO_EXTENSIONS:
        return "video"
    if suffix in SUBTITLE_EXTENSIONS:
        return "subtitle"
    if suffix in METADATA_EXTENSIONS:
        return "metadata"
    if suffix in IMAGE_EXTENSIONS:
        return "image"
    return "other"


def weak_hints(relative: str) -> dict[str, Any]:
    name = PurePosixPath(relative).name
    year = re.search(r"(?<!\d)((?:19|20)\d{2})(?!\d)", name)
    season_episode = re.search(r"(?i)S(\d{1,2})(?:E(\d{1,3}))?", name)
    resolution = re.search(r"(?i)(2160p|1080p|720p|4k)", name)
    result: dict[str, Any] = {}
    if year:
        result["year"] = int(year.group(1))
    if season_episode:
        result["season"] = int(season_episode.group(1))
        if season_episode.group(2):
            result["episode"] = int(season_episode.group(2))
    if resolution:
        result["resolution"] = resolution.group(1).lower()
    return result


def _row(boundary: dict[str, Any], raw: dict[str, Any], salt: bytes) -> dict[str, Any]:
    relative = safe_relative(raw.get("relative") or raw.get("name") or raw.get("path"), boundary.get("root"))
    return {
        "file_id": anonymous_id(salt, boundary["id"], relative, prefix="file"),
        "relative": relative,
        "kind": file_kind(relative),
        "size": int(raw.get("size") or 0),
        "progress": raw.get("progress"),
        "hints": weak_hints(relative),
    }


def compile_evidence(boundary: dict[str, Any], salt: bytes, variant: str = "structural") -> dict[str, Any]:
    rows = [_row(boundary, raw, salt) for raw in boundary.get("files") or []]
    represented: list[dict[str, Any]] = []
    ignored: list[dict[str, Any]] = []
    for row in rows:
        name = PurePosixPath(row["relative"]).name.casefold()
        if name in IGNORE_NAMES:
            ignored.append({"file_id": row["file_id"], "relative": row["relative"], "reason": "system_noise"})
        else:
            represented.append(row)

    common = Counter()
    for row in represented:
        for token in re.split(r"[. _\-\[\]()]+", PurePosixPath(row["relative"]).name):
            lowered = token.casefold()
            if len(lowered) >= 3:
                common[lowered] += 1
    shared = [token for token, count in common.most_common(12) if count >= max(2, len(represented) // 2)]

    if variant == "structural" and shared:
        for row in represented:
            compact = row["relative"]
            for index, token in enumerate(shared):
                compact = re.sub(
                    rf"(?<![A-Za-z0-9\u4e00-\u9fff]){re.escape(token)}(?![A-Za-z0-9\u4e00-\u9fff])",
                    f"${index}",
                    compact,
                    flags=re.IGNORECASE,
                )
            row["compact_relative"] = compact

    if variant == "representative":
        selected = represented[:2] + ([represented[-1]] if len(represented) > 2 else [])
        seen = {row["file_id"] for row in selected}
        body = selected
        omitted = [row["file_id"] for row in represented if row["file_id"] not in seen]
    else:
        body = represented
        omitted = []

    evidence = {
        "schema_version": "mediagovernor-source-evidence/v1",
        "boundary": {
            "id": boundary["id"],
            "source": boundary.get("source", "inferred"),
            "confidence": boundary.get("confidence", "unknown"),
            "label": boundary.get("label", "下载项"),
        },
        "variant": variant,
        "shared_tokens": shared if variant == "structural" else [],
        "files": body,
        "ignored_files": ignored,
        "omitted_file_ids": omitted,
        "read_failures": list(boundary.get("read_failures") or []),
        "counts": {
            "observed": len(rows),
            "represented": len(represented),
            "included_in_body": len(body),
            "ignored": len(ignored),
            "omitted": len(omitted),
            "read_failed": len(boundary.get("read_failures") or []),
        },
    }
    evidence["complete"] = (
        evidence["counts"]["observed"] == evidence["counts"]["represented"] + evidence["counts"]["ignored"]
        and not evidence["read_failures"]
        and not omitted
    )
    evidence["fingerprint"] = digest(evidence)
    return evidence


def ai_payload(evidence: dict[str, Any]) -> dict[str, Any]:
    """生成模型可见投影；内部回查所需的原相对路径不会重复发送。"""
    payload = copy.deepcopy(evidence)
    for row in payload.get("files") or []:
        compact = row.pop("compact_relative", None)
        if compact is not None:
            row["relative"] = compact
    # 指纹是本地账本字段，不帮助作品识别。
    payload.pop("fingerprint", None)
    ignored = payload.pop("ignored_files", [])
    payload["ignored_summary"] = {
        "count": len(ignored),
        "reasons": sorted({str(row.get("reason") or "ignored") for row in ignored}),
    }
    omitted = payload.pop("omitted_file_ids", [])
    payload["omitted_count"] = len(omitted)
    return payload


def assert_file_conservation(evidence: dict[str, Any]) -> None:
    counts = evidence["counts"]
    if counts["observed"] != counts["represented"] + counts["ignored"]:
        raise ValueError("文件守恒失败：读取到的文件没有全部进入证据或忽略清单")
    if counts["included_in_body"] + counts["omitted"] != counts["represented"]:
        raise ValueError("证据正文与省略清单不能覆盖全部有效文件")
    ids = [row["file_id"] for row in evidence.get("files") or []]
    ids += [row["file_id"] for row in evidence.get("ignored_files") or []]
    ids += list(evidence.get("omitted_file_ids") or [])
    if len(ids) != len(set(ids)):
        raise ValueError("一个文件被重复表示")
