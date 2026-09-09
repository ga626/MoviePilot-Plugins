"""一次安装完成 V0-V8 的只读验证执行器。"""
from __future__ import annotations

import json
from pathlib import Path, PurePosixPath
import queue
import sqlite3
import threading
import time
import uuid
from typing import Any

from .adapters import MoviePilotReadOnlyAdapter
from .evidence import ai_payload, assert_file_conservation, compile_evidence
from .experiments import LAB_CASES, choose_candidate, classify_sce, lab_input_id, score_lab_case, validate_ai_item
from .schemas import STAGES, STAGE_DEPENDENCIES, anonymous_id, canonical, digest, normalized_path, public_error, utcnow


class ValidationLedger:
    def __init__(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        self._lock = threading.RLock()
        with self.connect() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS runs(
                    id TEXT PRIMARY KEY,status TEXT NOT NULL,current_stage TEXT NOT NULL DEFAULT '',
                    current TEXT NOT NULL DEFAULT '',error TEXT NOT NULL DEFAULT '',cancel_requested INTEGER NOT NULL DEFAULT 0,
                    started_at TEXT NOT NULL,finished_at TEXT NOT NULL DEFAULT '',options_json TEXT NOT NULL DEFAULT '{}'
                );
                CREATE TABLE IF NOT EXISTS stages(
                    run_id TEXT NOT NULL,stage TEXT NOT NULL,status TEXT NOT NULL,input_fingerprint TEXT NOT NULL DEFAULT '',
                    result_json TEXT NOT NULL DEFAULT '{}',error TEXT NOT NULL DEFAULT '',started_at TEXT NOT NULL DEFAULT '',
                    finished_at TEXT NOT NULL DEFAULT '',elapsed_ms INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY(run_id,stage)
                );
                CREATE TABLE IF NOT EXISTS artifacts(
                    run_id TEXT NOT NULL,name TEXT NOT NULL,value_json TEXT NOT NULL,PRIMARY KEY(run_id,name)
                );
            """)
            db.execute("UPDATE runs SET status='interrupted',current='宿主退出时验证尚未完成',finished_at=? WHERE status IN ('running','stopping')", (utcnow(),))

    def connect(self) -> sqlite3.Connection:
        db = sqlite3.connect(self.path, timeout=15)
        db.row_factory = sqlite3.Row
        return db

    def execute(self, sql: str, values: tuple[Any, ...] = ()) -> None:
        with self._lock, self.connect() as db:
            db.execute(sql, values)

    def one(self, sql: str, values: tuple[Any, ...] = ()) -> dict[str, Any] | None:
        with self._lock, self.connect() as db:
            row = db.execute(sql, values).fetchone()
            return dict(row) if row else None

    def all(self, sql: str, values: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        with self._lock, self.connect() as db:
            return [dict(row) for row in db.execute(sql, values).fetchall()]

    def begin(self, options: dict[str, Any]) -> str:
        run_id = uuid.uuid4().hex
        self.execute("INSERT INTO runs(id,status,current,started_at,options_json) VALUES(?,?,?,?,?)", (run_id, "running", "准备验证", utcnow(), canonical(options)))
        return run_id

    def resume(self) -> str | None:
        row = self.one("SELECT * FROM runs ORDER BY started_at DESC LIMIT 1")
        if not row:
            return None
        self.execute("UPDATE runs SET status='running',cancel_requested=0,current='从已保存阶段继续',error='',finished_at='' WHERE id=?", (row["id"],))
        return str(row["id"])

    def update_run(self, run_id: str, **values: Any) -> None:
        if values:
            self.execute(f"UPDATE runs SET {','.join(f'{key}=?' for key in values)} WHERE id=?", tuple(values.values()) + (run_id,))

    def save_stage(self, run_id: str, stage: str, status: str, result: dict[str, Any], error: str, started: str, elapsed_ms: int, input_fingerprint: str = "") -> None:
        self.execute(
            "INSERT OR REPLACE INTO stages(run_id,stage,status,input_fingerprint,result_json,error,started_at,finished_at,elapsed_ms) VALUES(?,?,?,?,?,?,?,?,?)",
            (run_id, stage, status, input_fingerprint, canonical(result), error, started, utcnow(), elapsed_ms),
        )

    def artifact(self, run_id: str, name: str, default: Any = None) -> Any:
        row = self.one("SELECT value_json FROM artifacts WHERE run_id=? AND name=?", (run_id, name))
        return json.loads(row["value_json"]) if row else default

    def save_artifact(self, run_id: str, name: str, value: Any) -> None:
        self.execute("INSERT OR REPLACE INTO artifacts(run_id,name,value_json) VALUES(?,?,?)", (run_id, name, canonical(value)))

    def snapshot(self) -> dict[str, Any]:
        run = self.one("SELECT * FROM runs ORDER BY started_at DESC LIMIT 1")
        if not run:
            return {"run": {"status": "idle", "current": "尚未运行"}, "stages": [], "summary": {}}
        stages = self.all("SELECT * FROM stages WHERE run_id=? ORDER BY stage", (run["id"],))
        for row in stages:
            row["result"] = json.loads(row.pop("result_json") or "{}")
        report = self.artifact(run["id"], "report", {})
        return {"run": run, "stages": stages, "summary": report.get("summary", {}), "report": report}


class ValidatorService:
    READ_TIMEOUT_SECONDS = 30.0
    SEARCH_TIMEOUT_SECONDS = 30.0
    PREVIEW_TIMEOUT_SECONDS = 60.0
    AI_TIMEOUT_SECONDS = 100.0

    def __init__(self, data_path: Path, adapter: MoviePilotReadOnlyAdapter | None = None) -> None:
        self.ledger = ValidationLedger(data_path / "validator-v1.sqlite3")
        salt_path = data_path / "validator-v1.salt"
        if not salt_path.exists():
            salt_path.write_bytes(uuid.uuid4().bytes + uuid.uuid4().bytes)
        self.salt = salt_path.read_bytes()
        self.adapter = adapter or MoviePilotReadOnlyAdapter()
        self._thread: threading.Thread | None = None
        self._cancel = threading.Event()
        self._lock = threading.RLock()

    def plan(self) -> dict[str, Any]:
        result = {"stages": len(STAGES), "lab_cases": len(LAB_CASES), "estimated_ai_calls": 13, "sends_media_content": False, "writes_media": False}
        try:
            torrents = self._bounded("下载任务预检", self.adapter.torrents)
            roots, configured = self._bounded("下载目录预检", self.adapter.directories, "download")
            result.update({"current_torrents": len(torrents), "configured_download_roots": configured, "unique_download_roots": len(roots)})
        except Exception as error:  # noqa: BLE001
            result["preflight_error"] = public_error(error)
        return result

    def start(self, action: str = "all", options: dict[str, Any] | None = None) -> dict[str, Any]:
        if action == "cancel":
            self._cancel.set()
            current = self.ledger.one("SELECT * FROM runs ORDER BY started_at DESC LIMIT 1")
            if current and current["status"] == "running":
                self.ledger.update_run(current["id"], status="stopping", cancel_requested=1, current="已停止领取新阶段；等待当前只读调用返回")
            return self.status()
        with self._lock:
            if self._thread and self._thread.is_alive():
                return self.status()
            self._cancel.clear()
            run_id = self.ledger.resume() if action == "resume" else self.ledger.begin(options or {})
            if not run_id:
                run_id = self.ledger.begin(options or {})
            self._thread = threading.Thread(target=self._run, args=(run_id,), name="MediaGovernorValidator-v1", daemon=True)
            self._thread.start()
        return self.status()

    def status(self) -> dict[str, Any]:
        return self.ledger.snapshot()

    def stop(self) -> bool:
        self._cancel.set()
        thread = self._thread
        if thread and thread.is_alive():
            thread.join(timeout=5)
        return not bool(thread and thread.is_alive())

    def export(self, export_format: str = "markdown") -> dict[str, Any]:
        snapshot = self.status()
        if export_format == "json":
            return {"filename": "media-governor-validation.json", "content_type": "application/json", "content": canonical(snapshot)}
        lines = ["# 媒体治理只读验证报告", "", f"状态：{snapshot['run'].get('status', 'idle')}", ""]
        for row in snapshot.get("stages") or []:
            lines.append(f"## {row['stage']} {dict(STAGES).get(row['stage'], '')}")
            lines.append("")
            lines.append(f"- 结果：{row['status']}")
            lines.append(f"- 耗时：{row['elapsed_ms']} ms")
            if row.get("error"):
                lines.append(f"- 错误：{row['error']}")
            lines.append("")
        summary = snapshot.get("summary") or {}
        lines.extend(["## 总结", "", f"- 整理失败：{summary.get('native_failure', 0)}", f"- 假成功：{summary.get('false_success', 0)}", f"- 需要确认：{summary.get('needs_confirmation', 0)}", f"- 未读完：{summary.get('incomplete', 0)}", ""])
        return {"filename": "media-governor-validation.md", "content_type": "text/markdown", "content": "\n".join(lines)}

    def _cancelled(self) -> bool:
        return self._cancel.is_set()

    def _bounded(self, label: str, callback: Any, *args: Any, timeout: float | None = None) -> Any:
        """把宿主同步只读调用限制在可见时间边界内。

        Python 不能安全强杀正在执行的第三方同步调用，因此超时后让承载线程以
        daemon 方式自行结束；执行器立即记录失败并停止等待。插件没有写接口，
        所以迟到的调用也只能完成原本的读取。
        """
        result_queue: queue.Queue[tuple[bool, Any]] = queue.Queue(maxsize=1)

        def invoke() -> None:
            try:
                result_queue.put((True, callback(*args)))
            except BaseException as error:  # noqa: BLE001 - 原样转交执行线程
                result_queue.put((False, error))

        worker = threading.Thread(target=invoke, name=f"MediaGovernorValidator-{label}", daemon=True)
        worker.start()
        deadline = time.monotonic() + float(timeout or self.READ_TIMEOUT_SECONDS)
        while True:
            if self._cancelled():
                raise RuntimeError(f"{label} 已停止等待")
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError(f"{label} 超过 {int(timeout or self.READ_TIMEOUT_SECONDS)} 秒")
            try:
                ok, value = result_queue.get(timeout=min(0.1, remaining))
            except queue.Empty:
                continue
            if ok:
                return value
            raise value

    def _run(self, run_id: str) -> None:
        try:
            for stage, label in STAGES:
                if self._cancelled():
                    self.ledger.update_run(run_id, status="cancelled", current="验证已停止", finished_at=utcnow())
                    return
                previous = self.ledger.one("SELECT status FROM stages WHERE run_id=? AND stage=?", (run_id, stage))
                if previous and previous["status"] == "passed":
                    continue
                self.ledger.update_run(run_id, current_stage=stage, current=f"{stage} · {label}")
                started = utcnow(); before = time.monotonic()
                dependencies = STAGE_DEPENDENCIES.get(stage, ())
                unsatisfied = []
                for dependency in dependencies:
                    row = self.ledger.one("SELECT status FROM stages WHERE run_id=? AND stage=?", (run_id, dependency))
                    if not row or row["status"] != "passed":
                        unsatisfied.append(dependency)
                if unsatisfied:
                    self.ledger.save_stage(run_id, stage, "blocked", {"blocked_by": unsatisfied}, "前置验证没有通过", started, int((time.monotonic() - before) * 1000))
                    continue
                try:
                    result = getattr(self, f"_stage_{stage.lower()}")(run_id)
                    status = str(result.pop("_status", "passed"))
                    error = str(result.pop("_error", ""))
                except Exception as exc:  # noqa: BLE001
                    result, status, error = {}, "failed", public_error(exc)
                if self._cancelled():
                    # 当前阶段可能只采集了一部分数据；绝不能把它保存为 passed，
                    # 否则继续运行会跳过半截 checkpoint。
                    status = "interrupted"
                    error = "用户停止时当前阶段尚未形成完整回执"
                self.ledger.save_stage(run_id, stage, status, result, error, started, int((time.monotonic() - before) * 1000), digest(result))
                if self._cancelled():
                    self.ledger.update_run(run_id, status="cancelled", current="验证已停止；继续时会重跑未完成阶段", finished_at=utcnow())
                    return
            stages = self.ledger.all("SELECT status FROM stages WHERE run_id=?", (run_id,))
            final = "completed" if stages and all(row["status"] == "passed" for row in stages) else "completed_with_findings"
            self._build_report(run_id)
            self.ledger.update_run(run_id, status=final, current="全部只读验证已结束", finished_at=utcnow())
        except Exception as error:  # noqa: BLE001
            self.ledger.update_run(run_id, status="failed", error=public_error(error), current="验证执行器失败", finished_at=utcnow())

    def _stage_v0(self, run_id: str) -> dict[str, Any]:
        probes = self._bounded("宿主能力预检", self.adapter.capability_probe)
        failed = [name for name, value in probes.items() if value.get("status") not in {"passed"}]
        required = {"host_imports", "download_list", "torrent_files", "download_directories", "library_directories", "history_pages"}
        blocking = [name for name in failed if name in required]
        self.ledger.save_artifact(run_id, "capabilities", probes)
        return {"probes": probes, "failed": failed, "blocking": blocking, "_status": "failed" if blocking else "passed"}

    def _walk(self, root: dict[str, Any]) -> tuple[list[dict[str, Any]], list[str]]:
        pending = [root]; files: list[dict[str, Any]] = []; failures: list[str] = []; visited: set[tuple[str, str, str]] = set()
        while pending and not self._cancelled():
            current = pending.pop()
            if str(current.get("type") or "").casefold() not in {"dir", "directory", "folder"}:
                files.append(current); continue
            key = (str(current.get("storage") or "local"), normalized_path(current.get("path")), str(current.get("fileid") or ""))
            if key in visited:
                failures.append("directory_cycle_or_duplicate")
                continue
            visited.add(key)
            try:
                for item in self._bounded("目录读取", self.adapter.list_dir, current):
                    if str(item.get("type") or "").casefold() in {"dir", "directory", "folder"}:
                        pending.append(item)
                    else:
                        files.append(item)
            except Exception as error:  # noqa: BLE001
                failures.append(public_error(error))
        return files, failures

    def _stage_v1(self, run_id: str) -> dict[str, Any]:
        boundaries: list[dict[str, Any]] = []
        strong_paths: list[str] = []
        torrent_errors = 0
        for torrent in self._bounded("下载任务读取", self.adapter.torrents):
            try:
                raw_files = self._bounded("torrent 文件表读取", self.adapter.torrent_files, torrent)
                content_path = str(torrent.get("content_path") or "")
                save_path = str(torrent.get("save_path") or "")
                root = content_path or save_path
                files = []
                for row in raw_files:
                    name = str(row.get("name") or "")
                    base = str(torrent.get("save_path") or root).replace("\\", "/").rstrip("/")
                    absolute = f"{base}/{name.lstrip('/')}" if name else root
                    files.append({**row, "relative": name, "path": absolute, "storage": "local", "type": "file"})
                    strong_paths.append(normalized_path(absolute))
                root_item: dict[str, Any] | None = None
                if len(files) == 1:
                    root_item = dict(files[0])
                elif content_path and normalized_path(content_path) != normalized_path(save_path):
                    root_item = {"path": content_path, "name": PurePosixPath(content_path.replace("\\", "/")).name, "storage": "local", "type": "dir"}
                else:
                    top_parts = {str(row.get("name") or "").replace("\\", "/").split("/", 1)[0] for row in raw_files if "/" in str(row.get("name") or "").replace("\\", "/")}
                    if len(top_parts) == 1:
                        normalized_save = save_path.replace("\\", "/").rstrip("/")
                        derived = f"{normalized_save}/{next(iter(top_parts))}"
                        root_item = {"path": derived, "name": PurePosixPath(derived).name, "storage": "local", "type": "dir"}
                boundaries.append({
                    "id": anonymous_id(self.salt, torrent.get("downloader"), torrent.get("hash"), prefix="torrent"),
                    "label": str(torrent.get("name") or torrent.get("title") or "下载器任务"), "source": "torrent",
                    "confidence": "strong", "root": root,
                    "root_item": root_item,
                    "files": files, "read_failures": [] if files else ["empty_torrent_file_list"],
                })
            except Exception as error:  # noqa: BLE001
                torrent_errors += 1
                boundaries.append({"id": anonymous_id(self.salt, torrent.get("hash"), prefix="torrent"), "label": "下载器任务", "source": "torrent", "confidence": "unknown", "root": "", "files": [], "read_failures": [public_error(error)]})
        roots, configured = self._bounded("下载目录读取", self.adapter.directories, "download")
        inferred = 0
        for root in roots:
            for top in self._bounded("下载根读取", self.adapter.list_dir, root):
                top_path = normalized_path(top.get("path"))
                if any(value == top_path or value.startswith(top_path + "/") for value in strong_paths):
                    continue
                files, failures = self._walk(top)
                if not files and str(top.get("type") or "").casefold() not in {"dir", "directory", "folder"}:
                    files = [top]
                boundaries.append({
                    "id": anonymous_id(self.salt, root.get("storage"), top.get("path"), prefix="legacy"),
                    "label": str(top.get("name") or "旧库存顶层项"), "source": "top_level",
                    "confidence": "inferred" if not failures else "unknown", "root": str(top.get("path") or ""),
                    "root_item": top, "files": files, "read_failures": failures,
                })
                inferred += 1
        self.ledger.save_artifact(run_id, "boundaries_private", boundaries)
        public = [{"id": row["id"], "source": row["source"], "confidence": row["confidence"], "files": len(row["files"]), "read_failures": len(row["read_failures"])} for row in boundaries]
        self.ledger.save_artifact(run_id, "boundaries_public", public)
        incomplete = sum(bool(row["read_failures"]) for row in boundaries)
        return {
            "configured_roots": configured,
            "unique_roots": len(roots),
            "torrent_boundaries": len(boundaries) - inferred,
            "inferred_boundaries": inferred,
            "incomplete": incomplete,
            "torrent_errors": torrent_errors,
            "boundaries": public,
            # 空 torrent 文件表和递归读取失败都意味着边界不完整，不能继续交给 AI。
            "_status": "failed" if torrent_errors or incomplete else "passed",
        }

    def _stage_v2(self, run_id: str) -> dict[str, Any]:
        boundaries = self.ledger.artifact(run_id, "boundaries_private", [])
        compiled = []
        failures = 0
        for boundary in boundaries:
            evidence = compile_evidence(boundary, self.salt, "structural")
            assert_file_conservation(evidence)
            if not evidence["complete"]:
                failures += 1
            compiled.append(evidence)
        self.ledger.save_artifact(run_id, "evidence", compiled)
        return {"items": len(compiled), "complete": len(compiled) - failures, "incomplete": failures, "files": sum(row["counts"]["observed"] for row in compiled), "_status": "failed" if failures else "passed"}

    def _lab_evidence(self, variant: str) -> list[dict[str, Any]]:
        values = []
        for index, case in enumerate(LAB_CASES):
            boundary = {"id": lab_input_id(index), "label": f"样本 {index + 1:02d}", "source": "fixture", "confidence": "strong", "root": "/fixture", "files": [{"relative": name, "name": name, "size": 1} for name in case["files"]], "read_failures": []}
            values.append(compile_evidence(boundary, self.salt, variant))
        return values

    def _call_ai(self, evidence: list[dict[str, Any]], batch_size: int, reverse: bool = False) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        rows = list(reversed(evidence)) if reverse else evidence
        outputs: dict[str, Any] = {}; calls = []
        for offset in range(0, len(rows), batch_size):
            if self._cancelled():
                break
            batch = [ai_payload(row) for row in rows[offset:offset + batch_size]]
            payload, receipt = self._bounded(
                "AI 作品拆分",
                self.adapter.ai_identify,
                batch,
                timeout=self.AI_TIMEOUT_SECONDS,
            )
            values = payload.get("items") or {}
            outputs.update(values)
            calls.append(receipt)
        return outputs, calls

    def _stage_v3(self, run_id: str) -> dict[str, Any]:
        matrix = []
        saved_outputs: dict[str, Any] = {}
        calls_total = 0; input_chars = 0; output_chars = 0
        plans = [("full", 5, False), ("structural", 5, False), ("representative", 5, False), ("structural", 1, False), ("structural", 3, False), ("structural", 3, True)]
        for variant, batch_size, reverse in plans:
            evidence = self._lab_evidence(variant)
            outputs, calls = self._call_ai(evidence, batch_size, reverse)
            schema_errors = 0; returned = 0
            for case, item in zip(LAB_CASES, evidence):
                payload = outputs.get(item["boundary"]["id"]) or {"works": [], "unassigned_file_ids": [row["file_id"] for row in item.get("files") or []], "abstain": True}
                schema_errors += bool(validate_ai_item(item, payload))
                returned += item["boundary"]["id"] in outputs
            key = f"{variant}:{batch_size}:{'reverse' if reverse else 'forward'}"
            saved_outputs[key] = outputs
            calls_total += len(calls); input_chars += sum(int(row.get("input_chars") or 0) for row in calls); output_chars += sum(int(row.get("output_chars") or 0) for row in calls)
            matrix.append({"variant": variant, "batch_size": batch_size, "order": "reverse" if reverse else "forward", "returned": returned, "cases": len(LAB_CASES), "schema_errors": schema_errors, "calls": len(calls)})
        # 用最佳候选格式仅识别少量真实完整边界，供 V4-V6 继续验证；不把全库传给模型。
        live = [row for row in self.ledger.artifact(run_id, "evidence", []) if row.get("complete")][:5]
        live_outputs, live_calls = self._call_ai(live, 5) if live else ({}, [])
        calls_total += len(live_calls); input_chars += sum(int(row.get("input_chars") or 0) for row in live_calls); output_chars += sum(int(row.get("output_chars") or 0) for row in live_calls)
        self.ledger.save_artifact(run_id, "ai_matrix", saved_outputs)
        self.ledger.save_artifact(run_id, "live_hypotheses", live_outputs)
        passed = any(row["variant"] == "structural" and row["returned"] == len(LAB_CASES) and row["schema_errors"] == 0 for row in matrix)
        return {"matrix": matrix, "live_items": len(live), "model_calls": calls_total, "input_chars": input_chars, "output_chars": output_chars, "_status": "passed" if passed else "failed"}

    def _stage_v4(self, run_id: str) -> dict[str, Any]:
        hypotheses = self.ledger.artifact(run_id, "live_hypotheses", {})
        decisions = []
        for boundary_id, payload in hypotheses.items():
            for index, work in enumerate(payload.get("works") or []):
                queries = work.get("search_queries") or [" ".join(str(work.get(key) or "") for key in ("title", "year")).strip()]
                candidates: list[dict[str, Any]] = []
                for query in queries[:2]:
                    if query:
                        candidates.extend(self._bounded(
                            "媒体候选搜索",
                            self.adapter.search,
                            str(query),
                            timeout=self.SEARCH_TIMEOUT_SECONDS,
                        ))
                unique = {(row.get("media_source"), row.get("media_id"), row.get("media_type")): row for row in candidates if row.get("media_id")}
                decision = choose_candidate(work, list(unique.values()))
                decisions.append({"work_id": f"{boundary_id}:{index}", "boundary_id": boundary_id, "hypothesis": work, **decision})
        self.ledger.save_artifact(run_id, "identity_decisions", decisions)
        # choose_candidate 的确认合同本身要求零冲突；这里报告的是安全门结果，
        # 不是把没有人工答案的现场候选冒充“识别正确率”。真值正确率由 V7 负责。
        unsafe_auto_confirm = sum(
            1 for row in decisions
            if row.get("state") == "confirmed"
            and any(candidate.get("conflicts") for candidate in (row.get("ranked") or [])[:1])
        )
        status = "blocked" if not decisions else "failed" if unsafe_auto_confirm else "passed"
        return {
            "works": len(decisions),
            "confirmed": sum(row["state"] == "confirmed" for row in decisions),
            "needs_confirmation": sum(row["state"] != "confirmed" for row in decisions),
            "unsafe_auto_confirm": unsafe_auto_confirm,
            "live_confirmed_is_ground_truth": False,
            "_status": status,
        }

    def _source_for(self, run_id: str, boundary_id: str, file_id: str) -> dict[str, Any] | None:
        boundaries = {row["id"]: row for row in self.ledger.artifact(run_id, "boundaries_private", [])}
        evidence = {row["boundary"]["id"]: row for row in self.ledger.artifact(run_id, "evidence", [])}
        boundary = boundaries.get(boundary_id); compiled = evidence.get(boundary_id)
        if not boundary or not compiled:
            return None
        relative_by_id = {row["file_id"]: row["relative"] for row in compiled.get("files") or []}
        relative = relative_by_id.get(file_id)
        for raw in boundary.get("files") or []:
            candidate = str(raw.get("relative") or raw.get("name") or raw.get("path") or "").replace("\\", "/")
            if candidate.endswith(relative or "\0"):
                return raw
        return None

    def _root_for(self, run_id: str, boundary_id: str) -> dict[str, Any] | None:
        boundary = next((row for row in self.ledger.artifact(run_id, "boundaries_private", []) if row["id"] == boundary_id), None)
        return dict(boundary.get("root_item") or {}) if boundary and boundary.get("root_item") else None

    def _stage_v5(self, run_id: str) -> dict[str, Any]:
        previews = []
        for decision in self.ledger.artifact(run_id, "identity_decisions", []):
            if decision.get("state") != "confirmed":
                continue
            file_ids = [str(value) for value in decision["hypothesis"].get("file_ids") or []]
            mapped = [(file_id, self._source_for(run_id, decision["boundary_id"], file_id)) for file_id in file_ids]
            missing = [file_id for file_id, source in mapped if not source]
            sources = [(file_id, source) for file_id, source in mapped if source]
            # 同一个源文件不能因为模型重复列出而重复打官方 preview。
            sources = list({normalized_path(source.get("path")): (file_id, source) for file_id, source in sources}.values())
            if not sources or missing:
                previews.append({
                    "work_id": decision["work_id"],
                    "status": "blocked",
                    "mapped": len(sources),
                    "missing": len(missing),
                    "error": "作品文件没有全部映射回真实源文件",
                })
                continue
            compiled = next(
                (row for row in self.ledger.artifact(run_id, "evidence", []) if row["boundary"]["id"] == decision["boundary_id"]),
                {},
            )
            all_video_ids = {str(row["file_id"]) for row in compiled.get("files") or [] if row.get("kind") == "video"}
            root_source = self._root_for(run_id, decision["boundary_id"])
            # 一部作品独占整个边界时，让 MoviePilot 对根项一次性 preview；
            # 混包才退回逐视频 preview，避免电视剧按每集重复扫描整目录。
            preview_sources = [root_source] if root_source and set(file_ids) == all_video_ids else [source for _, source in sources]
            minimal: dict[str, Any] | None = None
            minimal_error = ""
            try:
                minimal = self._bounded(
                    "字段消融预览",
                    self.adapter.preview,
                    sources[0][1],
                    decision["identity"],
                    False,
                    timeout=self.PREVIEW_TIMEOUT_SECONDS,
                )
            except Exception as error:  # noqa: BLE001
                # 字段消融失败本身是实验结果，不能阻止完整身份合同继续执行。
                minimal_error = public_error(error)
            try:
                complete_payloads = [
                    self._bounded(
                        "完整身份预览",
                        self.adapter.preview,
                        source,
                        decision["identity"],
                        True,
                        timeout=self.PREVIEW_TIMEOUT_SECONDS,
                    )
                    for source in preview_sources
                ]
                complete_items = [
                    item
                    for payload in complete_payloads
                    for item in (payload.get("items") or [])
                    if isinstance(item, dict)
                ]
                complete_items = list({
                    (normalized_path(item.get("source")), normalized_path(item.get("target"))): item
                    for item in complete_items
                }.values())
                complete = {
                    "summary": {
                        "total": len(complete_items),
                        "success": sum(item.get("success") is not False for item in complete_items),
                        "failed": sum(item.get("success") is False for item in complete_items),
                    },
                    "items": complete_items,
                    "message": "；".join(str(payload.get("message") or "") for payload in complete_payloads if payload.get("message"))[:400],
                }
                complete_ok = bool(complete_items) and all(
                    item.get("success") is not False and item.get("target")
                    for item in complete_items
                )
                previews.append({
                    "work_id": decision["work_id"],
                    "boundary_id": decision["boundary_id"],
                    "source_file_ids": {normalized_path(source.get("path")): file_id for file_id, source in sources},
                    "identity": decision["identity"],
                    "status": "passed" if complete_ok else "failed",
                    "minimal": self._redact_preview(minimal or {}),
                    "minimal_error": minimal_error,
                    "complete": self._redact_preview(complete),
                    "private_complete": complete,
                    "error": "" if complete_ok else "完整身份预览没有返回可用目标",
                })
            except Exception as error:  # noqa: BLE001
                previews.append({
                    "work_id": decision["work_id"],
                    "status": "failed",
                    "minimal": self._redact_preview(minimal or {}),
                    "minimal_error": minimal_error,
                    "error": public_error(error),
                })
        self.ledger.save_artifact(run_id, "previews", previews)
        failed = sum(row["status"] == "failed" for row in previews)
        blocked = sum(row["status"] == "blocked" for row in previews)
        status = "passed" if previews and not failed and not blocked else "blocked" if not previews or blocked else "failed"
        return {"works": len(previews), "passed": sum(row["status"] == "passed" for row in previews), "failed": failed, "blocked": blocked, "_status": status}

    @staticmethod
    def _redact_preview(payload: dict[str, Any]) -> dict[str, Any]:
        rows = payload.get("items") or []
        return {"summary": payload.get("summary") or {}, "items": [{"success": row.get("success"), "has_source": bool(row.get("source")), "has_target": bool(row.get("target"))} for row in rows]}

    def _stage_v6(self, run_id: str) -> dict[str, Any]:
        histories = self._bounded("整理历史读取", self.adapter.histories)
        by_source: dict[str, list[dict[str, Any]]] = {}
        for row in histories:
            by_source.setdefault(normalized_path(row.get("src")), []).append(row)
        findings = []
        for preview in self.ledger.artifact(run_id, "previews", []):
            if preview.get("status") != "passed":
                continue
            for item in preview.get("private_complete", {}).get("items") or []:
                source_path = normalized_path(item.get("source"))
                file_id = (preview.get("source_file_ids") or {}).get(source_path)
                source = self._source_for(run_id, preview["boundary_id"], file_id) if file_id else None
                if not source:
                    findings.append({"work_id": preview["work_id"], "state": "read_error", "reason": "官方预览源无法映射回证据文件"})
                    continue
                source_histories = by_source.get(normalized_path(source.get("path")), [])
                target = str(item.get("target") or "")
                existence: dict[str, bool] = {}
                if target:
                    existence[target] = self._bounded("应有目标读取", self.adapter.exists, str(item.get("target_storage") or "local"), target)
                for history in source_histories:
                    history_target = str(history.get("dest") or "")
                    if history_target:
                        existence[history_target] = self._bounded("当前目标读取", self.adapter.exists, str(history.get("dest_storage") or "local"), history_target)
                source_exists = self._bounded("源文件复读", self.adapter.exists, str(source.get("storage") or "local"), str(source.get("path") or ""))
                state = classify_sce(source_exists, source_histories, item, existence)
                findings.append({"work_id": preview["work_id"], "state": state["state"], "reason": state["reason"]})
        self.ledger.save_artifact(run_id, "findings", findings)
        incomplete = sum(row["state"] in {"read_error", "preview_error"} for row in findings)
        return {"checked": len(findings), "native_failure": sum(row["state"] == "native_failure" for row in findings), "false_success": sum(row["state"] == "false_success" for row in findings), "normal": sum(row["state"] == "normal" for row in findings), "needs_confirmation": sum(row["state"] == "needs_confirmation" for row in findings), "incomplete": incomplete, "_status": "blocked" if not findings else "failed" if incomplete else "passed"}

    def _stage_v7(self, run_id: str) -> dict[str, Any]:
        from .truth import LAB_TRUTH

        matrix_outputs = self.ledger.artifact(run_id, "ai_matrix", {})
        scores = []
        for key, outputs in matrix_outputs.items():
            exact = sum(
                bool(score_lab_case(LAB_TRUTH[case["id"]], outputs.get(lab_input_id(index), {}))["exact"])
                for index, case in enumerate(LAB_CASES)
            )
            scores.append({"experiment": key, "exact": exact, "cases": len(LAB_CASES)})
        exact = next((row["exact"] for row in scores if row["experiment"] == "structural:5:forward"), 0)
        # 确定性对账真值，不访问答案之外的产品状态。
        fixtures = [
            ({"source_exists": True, "histories": [], "preview_item": {"target": "/expected", "success": True}, "current_exists": {}}, "native_failure"),
            ({"source_exists": True, "histories": [{"status": True, "dest": "/wrong"}], "preview_item": {"target": "/expected", "success": True}, "current_exists": {"/wrong": True}}, "false_success"),
            ({"source_exists": True, "histories": [{"status": True, "dest": "/expected"}], "preview_item": {"target": "/expected", "success": True}, "current_exists": {"/expected": True}}, "normal"),
            ({"source_exists": True, "histories": [{"status": True, "dest": "/gone"}], "preview_item": {"target": "/expected", "success": True}, "current_exists": {}}, "needs_confirmation"),
        ]
        deterministic = sum(classify_sce(**payload)["state"] == expected for payload, expected in fixtures)
        passed = exact == len(LAB_CASES) and deterministic == len(fixtures)
        return {"ai_cases": len(LAB_CASES), "ai_exact": exact, "experiment_scores": scores, "reconciliation_cases": len(fixtures), "reconciliation_exact": deterministic, "_status": "passed" if passed else "failed"}

    def _stage_v8(self, run_id: str) -> dict[str, Any]:
        stages = self.ledger.all("SELECT stage,elapsed_ms,status FROM stages WHERE run_id=?", (run_id,))
        fingerprints = {name: digest(self.ledger.artifact(run_id, name, {})) for name in ("boundaries_public", "evidence", "live_hypotheses", "identity_decisions")}
        return {"checkpointed_stages": len(stages), "stage_elapsed_ms": {row["stage"]: row["elapsed_ms"] for row in stages}, "artifact_fingerprints": fingerprints, "cancel_mode": "cooperative_bounded_call", "resume_mode": "skip_passed_stage", "incremental_contract": "input_fingerprint", "_status": "passed"}

    def _build_report(self, run_id: str) -> None:
        stages = self.ledger.all("SELECT stage,status,error,elapsed_ms FROM stages WHERE run_id=?", (run_id,))
        v6 = next((row for row in stages if row["stage"] == "V6"), None)
        result = self.ledger.one("SELECT result_json FROM stages WHERE run_id=? AND stage='V6'", (run_id,))
        counts = json.loads(result["result_json"]) if result else {}
        summary = {
            "overall": "passed" if stages and all(row["status"] == "passed" for row in stages) else "not_ready",
            "native_failure": counts.get("native_failure", 0), "false_success": counts.get("false_success", 0),
            "needs_confirmation": counts.get("needs_confirmation", 0), "incomplete": counts.get("incomplete", 0),
            "critical_failed": [row["stage"] for row in stages if row["status"] in {"failed", "blocked"}],
        }
        self.ledger.save_artifact(run_id, "report", {"summary": summary, "stages": stages, "generated_at": utcnow(), "write_operations": 0})
