"""AI、候选和 S/C/E 的纯函数实验。"""
from __future__ import annotations

import re
from typing import Any


LAB_CASES = [
    {
        "id": "lab_forrest_gump",
        "files": ["Forrest.Gump.1994.1080p.BluRay.mkv", "Forrest.Gump.1994.zh.ass"],
    },
    {
        "id": "lab_one_piece_live",
        "files": ["ONE.PIECE.2023.S01E01.mkv", "ONE.PIECE.2023.S01E02.mkv"],
    },
    {
        "id": "lab_cowboy_bebop_anime",
        "files": ["Cowboy.Bebop.1998.S01E01.mkv", "Cowboy.Bebop.1998.S01E02.ass"],
    },
    {
        "id": "lab_two_movies",
        "files": ["The.Matrix.1999/The.Matrix.1999.mkv", "The.Matrix.Reloaded.2003/The.Matrix.Reloaded.2003.mkv"],
    },
    {
        "id": "lab_multi_season",
        "files": ["Dark.2017/Season 1/Dark.S01E01.mkv", "Dark.2017/Season 2/Dark.S02E01.mkv", "Dark.2017/Season 2/Dark.S02E01.zh.srt"],
    },
]


def lab_input_id(index: int) -> str:
    """模型只能看到无语义样本号；作品名和答案不得从 case id 泄漏。"""
    return f"sample_{index + 1:02d}"


def title_key(value: Any) -> str:
    return re.sub(r"[^a-z0-9\u4e00-\u9fff]+", "", str(value or "").casefold())


def media_type(value: Any) -> str:
    text = str(value or "unknown").casefold()
    if text in {"movie", "电影"} or "movie" in text:
        return "movie"
    if text in {"tv", "电视剧", "series"} or "tv" in text:
        return "tv"
    return "unknown"


def validate_ai_item(evidence: dict[str, Any], payload: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    expected_ids = {row["file_id"] for row in evidence.get("files") or []}
    assigned: list[str] = []
    for work in payload.get("works") or []:
        if media_type(work.get("media_type")) not in {"movie", "tv", "unknown"}:
            errors.append("invalid_media_type")
        assigned.extend(str(value) for value in work.get("file_ids") or [])
        assigned.extend(str(value) for value in work.get("attachment_file_ids") or [])
    assigned.extend(str(value) for value in payload.get("unassigned_file_ids") or [])
    if set(assigned) != expected_ids:
        errors.append("file_coverage_mismatch")
    if len(assigned) != len(set(assigned)):
        errors.append("duplicate_file_assignment")
    return errors


def score_lab_case(expected: list[dict[str, Any]], payload: dict[str, Any]) -> dict[str, Any]:
    works = payload.get("works") or []
    matched = 0
    for truth in expected:
        truth_title = title_key(truth["title"])
        for work in works:
            titles = {title_key(work.get("title")), title_key(work.get("original_title"))}
            year_ok = not truth.get("year") or str(work.get("year") or "") == str(truth["year"])
            type_ok = media_type(work.get("media_type")) == truth["media_type"]
            presentation = str(work.get("presentation") or "unknown")
            presentation_ok = presentation == truth["presentation"]
            if truth_title in titles and year_ok and type_ok and presentation_ok:
                matched += 1
                break
    return {"expected": len(expected), "matched": matched, "exact": matched == len(expected) and len(works) == len(expected)}


def candidate_score(hypothesis: dict[str, Any], candidate: dict[str, Any]) -> tuple[int, list[str]]:
    score = 0
    conflicts: list[str] = []
    hint_titles = {title_key(hypothesis.get("title")), title_key(hypothesis.get("original_title"))} - {""}
    candidate_titles = {title_key(candidate.get("title")), title_key(candidate.get("original_title"))} - {""}
    if hint_titles & candidate_titles:
        score += 4
    else:
        conflicts.append("title")
    if hypothesis.get("year"):
        if not candidate.get("year"):
            conflicts.append("year_unverified")
        elif str(hypothesis["year"]) == str(candidate["year"]):
            score += 3
        else:
            conflicts.append("year")
    if media_type(hypothesis.get("media_type")) != "unknown":
        if media_type(candidate.get("media_type")) == "unknown":
            conflicts.append("media_type_unverified")
        elif media_type(hypothesis["media_type"]) == media_type(candidate["media_type"]):
            score += 3
        else:
            conflicts.append("media_type")
    hint_presentation = str(hypothesis.get("presentation") or "unknown")
    candidate_presentation = str(candidate.get("presentation") or "unknown")
    if hint_presentation != "unknown":
        if candidate_presentation == "unknown":
            conflicts.append("presentation_unverified")
        elif hint_presentation == candidate_presentation:
            score += 3
        else:
            conflicts.append("presentation")
    return score, conflicts


def choose_candidate(hypothesis: dict[str, Any], candidates: list[dict[str, Any]]) -> dict[str, Any]:
    ranked = []
    for candidate in candidates[:5]:
        score, conflicts = candidate_score(hypothesis, candidate)
        ranked.append({"candidate": candidate, "score": score, "conflicts": conflicts})
    ranked.sort(key=lambda row: row["score"], reverse=True)
    if not ranked:
        return {"state": "needs_confirmation", "reason": "数据库没有返回候选", "ranked": []}
    first = ranked[0]
    margin = first["score"] - (ranked[1]["score"] if len(ranked) > 1 else 0)
    if first["score"] >= 7 and margin >= 2 and not first["conflicts"]:
        return {"state": "confirmed", "reason": f"字段一致且领先 {margin} 分", "identity": first["candidate"], "ranked": ranked}
    return {"state": "needs_confirmation", "reason": "同名、年份、类型或真人/动画仍有歧义", "ranked": ranked}


def classify_sce(source_exists: bool, histories: list[dict[str, Any]], preview_item: dict[str, Any], current_exists: dict[str, bool]) -> dict[str, Any]:
    if not source_exists:
        return {"state": "read_error", "reason": "原始文件当前不可读"}
    expected = str(preview_item.get("target") or "")
    if not expected or preview_item.get("success") is False:
        return {"state": "preview_error", "reason": "官方预览没有给出唯一应有目标"}
    successful = [row for row in histories if row.get("status") and row.get("dest")]
    live_wrong = [row for row in successful if current_exists.get(str(row.get("dest"))) and str(row.get("dest")) != expected]
    if live_wrong:
        reason = "正确目标与错误旧目标同时存在" if current_exists.get(expected) else "当前目标存在，但与明确身份下的应有目标不同"
        return {"state": "false_success", "reason": reason}
    if current_exists.get(expected):
        return {"state": "normal", "reason": "应有目标当前存在"}
    latest = max(
        histories,
        key=lambda row: (int(row.get("id") or 0), str(row.get("date") or "")),
        default=None,
    )
    if latest and not latest.get("status"):
        return {"state": "native_failure", "reason": "历史失败且应有目标当前不存在"}
    if not histories:
        return {"state": "native_failure", "reason": "源文件存在，但应有目标当前不存在"}
    return {"state": "needs_confirmation", "reason": "旧目标已经消失，无法区分手工移动和整理失败"}
