"""MediaGovernorValidator 确定性合同测试；不访问 NAS、网络或真实模型。"""
from __future__ import annotations

import ast
from dataclasses import dataclass
import importlib
import json
import sys
import tempfile
import time
import types
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
PLUGIN_DIR = ROOT / "plugins.v3/mediagovernorvalidator"
MANIFEST = ROOT / "package.v3.json"

package = types.ModuleType("mediagovernorvalidator")
package.__path__ = [str(PLUGIN_DIR)]
sys.modules.setdefault("mediagovernorvalidator", package)
S = importlib.import_module("mediagovernorvalidator.schemas")
E = importlib.import_module("mediagovernorvalidator.evidence")
X = importlib.import_module("mediagovernorvalidator.experiments")
T = importlib.import_module("mediagovernorvalidator.truth")
V = importlib.import_module("mediagovernorvalidator.validator")


def evidence_for(files, variant="structural"):
    boundary = {"id": "case", "label": "Case", "source": "fixture", "confidence": "strong", "root": "/fixture", "files": [{"path": f"/fixture/{name}", "name": name, "size": 10} for name in files], "read_failures": []}
    return E.compile_evidence(boundary, b"test-salt", variant)


def test_slotted_sdk_snapshots_are_projected_without_a_session():
    @dataclass(frozen=True, slots=True)
    class Snapshot:
        id: int
        src: str
        status: bool = True

    assert S.model_dict(Snapshot(7, "/fixture/source")) == {"id": 7, "src": "/fixture/source", "status": True}


def test_file_conservation_and_representative_variant_are_explicit():
    full = evidence_for(["Show.S01E01.mkv", "Show.S01E01.zh.srt", "poster.jpg", "Thumbs.db"])
    E.assert_file_conservation(full)
    assert full["complete"] is True
    assert full["counts"] == {"observed": 4, "represented": 3, "included_in_body": 3, "ignored": 1, "omitted": 0, "read_failed": 0}
    representative = evidence_for([f"Show.S01E{index:02d}.mkv" for index in range(1, 8)], "representative")
    E.assert_file_conservation(representative)
    assert representative["complete"] is False
    assert representative["counts"]["omitted"] == 4


def test_structural_projection_really_compresses_without_losing_file_ids():
    files = [f"Long.Repeated.Show.Title.2024.S01E{index:02d}.1080p.mkv" for index in range(1, 9)]
    structural = evidence_for(files, "structural")
    full = evidence_for(files, "full")
    projected = E.ai_payload(structural)
    assert len(S.canonical(projected)) < len(S.canonical(E.ai_payload(full)))
    assert {row["file_id"] for row in projected["files"]} == {row["file_id"] for row in structural["files"]}
    assert any("$" in row["relative"] for row in projected["files"])
    assert all("compact_relative" not in row for row in projected["files"])
    assert "ignored_files" not in projected and "omitted_file_ids" not in projected


def test_lab_inputs_do_not_leak_answer_through_ids_or_labels(tmp_path):
    service = V.ValidatorService(tmp_path, FakeAdapter())
    evidence = service._lab_evidence("structural")
    visible = S.canonical([{"id": row["boundary"]["id"], "label": row["boundary"]["label"]} for row in evidence]).casefold()
    assert all(case["id"].casefold() not in visible for case in X.LAB_CASES)
    assert [row["boundary"]["id"] for row in evidence] == [X.lab_input_id(index) for index in range(len(X.LAB_CASES))]


def test_candidate_guard_blocks_live_action_animation_and_year_conflicts():
    hint = {"title": "Forrest Gump", "year": 1994, "media_type": "movie", "presentation": "live_action"}
    wrong = {"title": "Forrest Gump", "year": 1994, "media_type": "movie", "presentation": "animation", "media_source": "themoviedb", "media_id": "wrong"}
    right = {"title": "Forrest Gump", "year": 1994, "media_type": "movie", "presentation": "live_action", "media_source": "themoviedb", "media_id": "right"}
    assert X.choose_candidate(hint, [wrong])["state"] == "needs_confirmation"
    selected = X.choose_candidate(hint, [wrong, right])
    assert selected["state"] == "confirmed" and selected["identity"]["media_id"] == "right"
    same_name_wrong_year = {**right, "year": 2020, "media_id": "other"}
    assert X.choose_candidate(hint, [same_name_wrong_year])["state"] == "needs_confirmation"
    unknown_presentation = {key: value for key, value in right.items() if key != "presentation"}
    assert X.choose_candidate(hint, [unknown_presentation])["state"] == "needs_confirmation"


def test_sce_classes_are_deterministic_and_unknown_is_not_normal():
    expected = {"target": "/library/right.mkv", "success": True}
    assert X.classify_sce(True, [], expected, {})["state"] == "native_failure"
    assert X.classify_sce(True, [{"status": False}], expected, {})["state"] == "native_failure"
    assert X.classify_sce(True, [{"status": True, "dest": "/library/wrong.mkv"}], expected, {"/library/wrong.mkv": True})["state"] == "false_success"
    assert X.classify_sce(True, [{"status": True, "dest": "/library/wrong.mkv"}], expected, {"/library/right.mkv": True, "/library/wrong.mkv": True})["state"] == "false_success"
    assert X.classify_sce(True, [{"status": True, "dest": "/library/right.mkv"}], expected, {"/library/right.mkv": True})["state"] == "normal"
    assert X.classify_sce(True, [{"status": True, "dest": "/library/gone.mkv"}], expected, {})["state"] == "needs_confirmation"
    assert X.classify_sce(True, [{"id": 1, "status": False}, {"id": 2, "status": True, "dest": "/library/gone.mkv"}], expected, {})["state"] == "needs_confirmation"
    assert X.classify_sce(False, [], expected, {})["state"] == "read_error"


class FakeAdapter:
    def __init__(self):
        self.ai_calls = 0
        self.preview_calls = 0

    def capability_probe(self):
        return {name: {"status": "passed"} for name in ("host_imports", "download_list", "torrent_files", "download_directories", "library_directories", "history_pages", "media_search", "media_detail", "official_preview", "llm")}

    def torrents(self):
        return [{"hash": "secret-hash", "downloader": "qb", "name": "Forrest Gump", "save_path": "/private/downloads"}]

    def torrent_files(self, torrent):
        return [{"name": "Forrest.Gump.1994.mkv", "size": 100, "progress": 1.0}]

    def directories(self, kind):
        if kind == "download":
            return ([{"path": "/private/downloads", "storage": "local", "type": "dir"}], 3)
        return ([{"path": "/private/library", "storage": "local", "type": "dir"}], 1)

    def list_dir(self, item):
        path = str(item.get("path"))
        if path == "/private/downloads":
            return [
                {"path": "/private/downloads/Forrest.Gump.1994.mkv", "name": "Forrest.Gump.1994.mkv", "type": "file", "storage": "local", "size": 100},
                {"path": "/private/downloads/Legacy", "name": "Legacy", "type": "dir", "storage": "local"},
            ]
        if path.endswith("/Legacy"):
            return [{"path": f"{path}/Forrest.Gump.1994.mkv", "name": "Forrest.Gump.1994.mkv", "type": "file", "storage": "local", "size": 100}]
        return []

    def ai_identify(self, items, timeout=90):
        self.ai_calls += 1
        output = {}
        expected = {X.lab_input_id(index): T.LAB_TRUTH[row["id"]] for index, row in enumerate(X.LAB_CASES)}
        for item in items:
            item_id = item["boundary"]["id"]
            file_ids = [row["file_id"] for row in item.get("files") or []]
            attachments = [row["file_id"] for row in item.get("files") or [] if row.get("kind") != "video"]
            videos = [value for value in file_ids if value not in attachments]
            truth = expected.get(item_id, [{"title": "Forrest Gump", "year": 1994, "media_type": "movie", "presentation": "live_action"}])
            works = []
            for index, work in enumerate(truth):
                owned = videos if len(truth) == 1 else [videos[min(index, len(videos) - 1)]]
                works.append({**work, "original_title": work["title"], "season": None, "file_ids": owned, "attachment_file_ids": attachments if index == 0 else [], "search_queries": [f"{work['title']} {work.get('year') or ''}".strip()], "confidence": "high"})
            assigned = {value for work in works for value in work["file_ids"] + work["attachment_file_ids"]}
            output[item_id] = {"works": works, "unassigned_file_ids": [value for value in file_ids if value not in assigned], "abstain": False}
        return {"items": output}, {"input_chars": 100, "output_chars": 50, "usage": {"total_tokens": 30}}

    def search(self, query):
        year = next((value for value in (1994, 2023, 1998, 1999, 2003, 2017, 2024) if str(value) in query), 1994)
        title = query.replace(str(year), "").strip()
        presentation = "animation" if "Cowboy" in title else "live_action"
        mtype = "tv" if any(value in title for value in ("One Piece", "Cowboy", "Dark")) else "movie"
        return [{"title": title, "original_title": title, "year": year, "media_type": mtype, "presentation": presentation, "media_source": "themoviedb", "media_id": f"{title}-{year}"}]

    def preview(self, source, identity, complete=True):
        self.preview_calls += 1
        source_path = f"{source['path']}/Forrest.Gump.1994.mkv" if str(source.get("type")) == "dir" else source["path"]
        return {"summary": {"total": 1, "success": 1, "failed": 0}, "items": [{"source": source_path, "target": "/private/library/Forrest Gump/Forrest.Gump.1994.mkv", "target_storage": "local", "success": True}]}

    def histories(self):
        return []

    def exists(self, storage, path):
        return str(path).startswith("/private/downloads")


class MinimalPreviewFailsAdapter(FakeAdapter):
    def preview(self, source, identity, complete=True):
        self.preview_calls += 1
        if not complete:
            raise RuntimeError("minimal contract rejected")
        return {
            "summary": {"total": 1, "success": 1, "failed": 0},
            "items": [{
                "source": source["path"],
                "target": "/private/library/Forrest Gump/Forrest.Gump.1994.mkv",
                "target_storage": "local",
                "success": True,
            }],
        }


class EmptyTorrentFilesAdapter(FakeAdapter):
    def torrent_files(self, torrent):
        return []


class MissingCoreCapabilityAdapter(FakeAdapter):
    def capability_probe(self):
        probes = super().capability_probe()
        probes["torrent_files"] = {"status": "failed"}
        return probes


class MissingOptionalCapabilityAdapter(FakeAdapter):
    def capability_probe(self):
        probes = super().capability_probe()
        probes["llm"] = {"status": "unavailable"}
        return probes


class SlowAIAdapter(FakeAdapter):
    def ai_identify(self, items, timeout=90):
        time.sleep(0.08)
        return super().ai_identify(items, timeout)


class MultiEpisodeAdapter(FakeAdapter):
    def torrent_files(self, torrent):
        return [
            {"name": "Show.S01E01.mkv", "size": 100, "progress": 1.0},
            {"name": "Show.S01E02.mkv", "size": 100, "progress": 1.0},
        ]

    def ai_identify(self, items, timeout=90):
        payload, receipt = super().ai_identify(items, timeout)
        for item in items:
            if item["boundary"]["source"] != "fixture":
                work = payload["items"][item["boundary"]["id"]]["works"][0]
                work.update({"title": "Show", "original_title": "Show", "year": 2024, "media_type": "tv"})
                work["search_queries"] = ["Show 2024"]
        return payload, receipt

    def preview(self, source, identity, complete=True):
        self.preview_calls += 1
        episode = "E02" if "E02" in source["path"] else "E01"
        return {
            "summary": {"total": 1, "success": 1, "failed": 0},
            "items": [{
                "source": source["path"],
                "target": f"/private/library/Show/Season 1/Show.S01{episode}.mkv",
                "target_storage": "local",
                "success": True,
            }],
        }

    def search(self, query):
        if query == "Show 2024":
            return [{"title": "Show", "original_title": "Show", "year": 2024, "media_type": "tv", "presentation": "live_action", "media_source": "themoviedb", "media_id": "show-2024"}]
        return super().search(query)


def wait_for_finish(service, seconds=5):
    deadline = time.monotonic() + seconds
    while service.status()["run"]["status"] in {"running", "stopping"} and time.monotonic() < deadline:
        time.sleep(0.02)
    return service.status()


def test_full_v0_v8_run_is_one_candidate_and_export_is_redacted(tmp_path):
    adapter = FakeAdapter()
    service = V.ValidatorService(tmp_path, adapter)
    service.start("all", {"ai_confirmed": True})
    snapshot = wait_for_finish(service)
    assert snapshot["run"]["status"] == "completed"
    assert [row["stage"] for row in snapshot["stages"]] == [f"V{index}" for index in range(9)]
    assert all(row["status"] == "passed" for row in snapshot["stages"])
    assert snapshot["summary"]["native_failure"] >= 1
    assert adapter.ai_calls == 13
    exported = service.export("markdown")["content"]
    assert "/private" not in exported and "secret-hash" not in exported
    assert "整理失败" in exported and "假成功" in exported


def test_minimal_preview_failure_does_not_hide_complete_contract(tmp_path):
    adapter = MinimalPreviewFailsAdapter()
    service = V.ValidatorService(tmp_path, adapter)
    service.start("all", {"ai_confirmed": True})
    snapshot = wait_for_finish(service)
    stage = next(row for row in snapshot["stages"] if row["stage"] == "V5")
    assert stage["status"] == "passed"
    assert adapter.preview_calls == stage["result"]["works"] * 2
    previews = service.ledger.artifact(snapshot["run"]["id"], "previews", [])
    assert previews[0]["minimal_error"].startswith("RuntimeError:")
    assert previews[0]["private_complete"]["items"][0]["target_storage"] == "local"


def test_incomplete_torrent_boundary_blocks_downstream_stages(tmp_path):
    service = V.ValidatorService(tmp_path, EmptyTorrentFilesAdapter())
    service.start("all", {"ai_confirmed": True})
    snapshot = wait_for_finish(service)
    states = {row["stage"]: row["status"] for row in snapshot["stages"]}
    assert states["V0"] == "passed"
    assert states["V1"] == "failed"
    assert all(states[f"V{index}"] == "blocked" for index in range(2, 9))
    assert snapshot["summary"]["overall"] == "not_ready"


def test_only_core_v0_capabilities_block_collection(tmp_path):
    optional = V.ValidatorService(tmp_path / "optional", MissingOptionalCapabilityAdapter())
    optional.start("all", {"ai_confirmed": True})
    optional_snapshot = wait_for_finish(optional)
    optional_states = {row["stage"]: row["status"] for row in optional_snapshot["stages"]}
    assert optional_states["V0"] == "passed" and optional_states["V1"] == "passed"

    core = V.ValidatorService(tmp_path / "core", MissingCoreCapabilityAdapter())
    core.start("all", {"ai_confirmed": True})
    core_snapshot = wait_for_finish(core)
    core_states = {row["stage"]: row["status"] for row in core_snapshot["stages"]}
    assert core_states["V0"] == "failed"
    assert all(core_states[f"V{index}"] == "blocked" for index in range(1, 9))


def test_cancelled_stage_is_not_reused_as_complete_checkpoint(tmp_path):
    service = V.ValidatorService(tmp_path, SlowAIAdapter())
    service.start("all", {"ai_confirmed": True})
    deadline = time.monotonic() + 3
    while service.status()["run"].get("current_stage") != "V3" and time.monotonic() < deadline:
        time.sleep(0.01)
    service.start("cancel")
    cancelled = wait_for_finish(service)
    assert cancelled["run"]["status"] == "cancelled"
    assert next(row for row in cancelled["stages"] if row["stage"] == "V3")["status"] == "interrupted"

    service.start("resume")
    resumed = wait_for_finish(service)
    assert resumed["run"]["status"] == "completed"
    assert next(row for row in resumed["stages"] if row["stage"] == "V3")["status"] == "passed"


def test_all_video_files_in_a_work_reach_preview_and_reconciliation(tmp_path):
    adapter = MultiEpisodeAdapter()
    service = V.ValidatorService(tmp_path, adapter)
    service.start("all", {"ai_confirmed": True})
    snapshot = wait_for_finish(service)
    run_id = snapshot["run"]["id"]
    previews = service.ledger.artifact(run_id, "previews", [])
    torrent_preview = next(row for row in previews if len(row.get("source_file_ids") or {}) == 2)
    assert torrent_preview["private_complete"]["summary"]["total"] == 2
    findings = [row for row in service.ledger.artifact(run_id, "findings", []) if row["work_id"] == torrent_preview["work_id"]]
    assert len(findings) == 2


def test_resume_skips_passed_stages(tmp_path):
    ledger = V.ValidationLedger(tmp_path / "resume.sqlite3")
    run_id = ledger.begin({})
    ledger.save_stage(run_id, "V0", "passed", {"ok": True}, "", S.utcnow(), 1)
    ledger.update_run(run_id, status="interrupted")
    assert ledger.resume() == run_id
    assert ledger.one("SELECT status FROM stages WHERE run_id=? AND stage='V0'", (run_id,))["status"] == "passed"


def test_manifest_api_and_frontend_contract_are_read_only():
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))["MediaGovernorValidator"]
    package_json = json.loads((PLUGIN_DIR / "package.json").read_text(encoding="utf-8"))
    source = (PLUGIN_DIR / "__init__.py").read_text(encoding="utf-8")
    page = (PLUGIN_DIR / "src/components/AppPage.vue").read_text(encoding="utf-8")
    assert manifest["version"] == package_json["version"] == "0.1.0"
    assert next(iter(manifest["history"])) == "v0.1.0"
    assert 'plugin_version = "0.1.0"' in source
    assert 'return "vue", "dist/v0.1.0/assets"' in source
    assert [value in source for value in ("/plan", "/run", "/status", "/export")] == [True] * 4
    for forbidden in ("repair", "rebuild", "delete", "manual_transfer", "preview=false"):
        assert forbidden not in source.casefold()
    for label in ("运行全部只读验证", "继续未完成验证", "停止", "导出脱敏报告"):
        assert label in page
    for token in ("--v-theme-surface", "--v-theme-on-surface", "--v-theme-primary", "prefers-reduced-motion", "aria-live", "role=\"dialog\""):
        assert token in page
    assert "writes_media: true" not in page


def test_every_manual_transfer_call_is_compile_time_preview_only():
    forbidden_calls = {"unlink", "removedirs", "rename", "move", "rmtree", "rebuild", "delete"}
    for path in PLUGIN_DIR.glob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            name = node.func.attr if isinstance(node.func, ast.Attribute) else node.func.id if isinstance(node.func, ast.Name) else ""
            assert name.casefold() not in forbidden_calls
            if name == "manual_transfer":
                preview = next((keyword.value for keyword in node.keywords if keyword.arg == "preview"), None)
                assert isinstance(preview, ast.Constant) and preview.value is True


def test_plugin_can_initialize_against_minimal_host_stub(monkeypatch):
    app = types.ModuleType("app"); plugins = types.ModuleType("app.plugins")
    class Base:
        def __init__(self): self.path = Path(tempfile.mkdtemp())
        def get_data_path(self): return self.path
    plugins._PluginBase = Base
    monkeypatch.setitem(sys.modules, "app", app); monkeypatch.setitem(sys.modules, "app.plugins", plugins)
    sys.modules.pop("mediagovernorvalidator", None)
    spec = importlib.util.spec_from_file_location("mediagovernorvalidator", PLUGIN_DIR / "__init__.py", submodule_search_locations=[str(PLUGIN_DIR)])
    module = importlib.util.module_from_spec(spec); sys.modules["mediagovernorvalidator"] = module
    assert spec and spec.loader; spec.loader.exec_module(module)
    plugin = module.MediaGovernorValidator(); plugin.init_plugin({"enabled": True})
    assert plugin.get_state() is True
    assert [row["path"] for row in plugin.get_api()] == ["/plan", "/run", "/status", "/export"]
    assert all(row["auth"] == "bear" for row in plugin.get_api())
    plugin.stop_service()


def test_built_federation_artifact_matches_render_contract():
    assets = PLUGIN_DIR / "dist/v0.1.0/assets"
    remote = assets / "remoteEntry.js"
    assert remote.is_file() and remote.stat().st_size > 1000
    text = remote.read_text(encoding="utf-8")
    assert all(name in text for name in ("./Page", "./Config", "./AppPage"))
    assert any(path.name.startswith("__federation_expose_AppPage-") and path.suffix == ".js" for path in assets.iterdir())
