"""MoviePilot 只读适配器；所有宿主导入延迟到实际调用。"""
from __future__ import annotations

import asyncio
import inspect
import json
from pathlib import Path
import re
from typing import Any

from .schemas import model_dict, normalized_path, public_error


class MoviePilotReadOnlyAdapter:
    def __init__(self) -> None:
        self._ports: dict[str, Any] | None = None

    def ports(self) -> dict[str, Any]:
        if self._ports is None:
            from app.application.directory import DirectoryHelper
            from app.chain.download import DownloadChain
            from app.chain.media import MediaChain
            from app.chain.storage import StorageChain
            from app.chain.transfer import TransferChain
            from app.schemas.file import FileItem
            from app.schemas.types import MediaSource, MediaType
            from app.sdk.queries import list_transfer_history
            self._ports = {
                "directory": DirectoryHelper(), "download": DownloadChain(), "media": MediaChain(),
                "storage": StorageChain(), "transfer": TransferChain(), "FileItem": FileItem,
                "MediaSource": MediaSource, "MediaType": MediaType, "histories": list_transfer_history,
            }
        return self._ports

    def capability_probe(self) -> dict[str, Any]:
        probes: dict[str, Any] = {}
        try:
            ports = self.ports()
        except Exception as error:  # noqa: BLE001
            return {"host_imports": {"status": "failed", "error": public_error(error)}}
        checks = {
            "host_imports": bool(ports),
            "download_list": callable(getattr(ports["download"], "list_torrents", None)),
            "torrent_files": callable(getattr(ports["download"], "torrent_files", None)),
            "download_directories": callable(getattr(ports["directory"], "get_download_dirs", None)),
            "library_directories": callable(getattr(ports["directory"], "get_library_dirs", None)),
            "history_pages": callable(ports["histories"]),
            "media_search": callable(getattr(ports["media"], "search", None)),
            "media_detail": callable(getattr(ports["media"], "recognize_media", None)),
            "official_preview": "preview" in inspect.signature(ports["transfer"].manual_transfer).parameters,
        }
        for name, ok in checks.items():
            probes[name] = {"status": "passed" if ok else "failed"}
        try:
            from app.agent.llm.helper import LLMHelper
            probes["llm"] = {"status": "passed" if callable(getattr(LLMHelper, "get_llm", None)) else "failed", "structured_output": "local_schema_validation"}
        except Exception as error:  # noqa: BLE001
            probes["llm"] = {"status": "unavailable", "error": public_error(error)}
        return probes

    @staticmethod
    def _directory(value: Any, kind: str) -> dict[str, Any]:
        data = model_dict(value)
        path_key = "download_path" if kind == "download" else "library_path"
        storage_key = "storage" if kind == "download" else "library_storage"
        return {**data, "path": str(data.get(path_key) or ""), "storage": str(data.get(storage_key) or "local"), "type": "dir"}

    def directories(self, kind: str) -> tuple[list[dict[str, Any]], int]:
        ports = self.ports()
        raw = ports["directory"].get_download_dirs() if kind == "download" else ports["directory"].get_library_dirs()
        result: list[dict[str, Any]] = []
        seen: set[tuple[str, str]] = set()
        for row in raw or []:
            item = self._directory(row, kind)
            key = (item["storage"], normalized_path(item["path"]))
            if not key[1] or key[1] in {"/"} or re.fullmatch(r"[a-z]:", key[1]):
                continue
            if key not in seen:
                seen.add(key)
                result.append(item)
        return result, len(raw or [])

    def torrents(self) -> list[dict[str, Any]]:
        rows = self.ports()["download"].list_torrents(include_all_tags=True) or []
        return [model_dict(row) for row in rows]

    def torrent_files(self, torrent: dict[str, Any]) -> list[dict[str, Any]]:
        rows = self.ports()["download"].torrent_files(str(torrent.get("hash") or ""), torrent.get("downloader")) or []
        return [model_dict(row) for row in rows]

    def list_dir(self, item: dict[str, Any]) -> list[dict[str, Any]]:
        ports = self.ports()
        keys = ("path", "storage", "type", "name", "fileid", "parent_fileid")
        fileitem = ports["FileItem"](**{key: item.get(key) for key in keys if item.get(key) is not None})
        return [model_dict(row) for row in (ports["storage"].list_files(fileitem) or [])]

    def histories(self) -> list[dict[str, Any]]:
        result: list[dict[str, Any]] = []
        page = 1
        while True:
            response = self.ports()["histories"](None, {"page": page, "count": 200, "sort": {"field": "id", "direction": "asc"}})
            result.extend(model_dict(row) for row in getattr(response, "items", []) or [])
            if not getattr(response, "has_next", False):
                return result
            page += 1

    def search(self, query: str) -> list[dict[str, Any]]:
        _, rows = self.ports()["media"].search(query)
        return [self.media_identity(row) for row in rows or []][:5]

    @staticmethod
    def media_identity(value: Any) -> dict[str, Any]:
        data = model_dict(value)
        media_id = data.get("media_id") or data.get("tmdb_id") or data.get("douban_id")
        source = data.get("source") or data.get("media_source") or ("themoviedb" if data.get("tmdb_id") else "douban" if data.get("douban_id") else "")
        mtype = str(data.get("type") or data.get("media_type") or "unknown").casefold()
        if "movie" in mtype or "电影" in mtype:
            mtype = "movie"
        elif "tv" in mtype or "电视剧" in mtype:
            mtype = "tv"
        genres = data.get("genres") or data.get("genre_ids") or []
        return {
            "title": data.get("title") or "", "original_title": data.get("original_title") or "",
            "year": data.get("year"), "media_type": mtype, "media_source": str(source),
            "media_id": str(media_id or ""), "genres": genres,
            "presentation": "animation" if any("animation" in str(item).casefold() or "动画" in str(item) for item in genres) else "unknown",
        }

    def media_info(self, identity: dict[str, Any]) -> Any:
        ports = self.ports()
        source = ports["MediaSource"](identity["media_source"])
        mtype = ports["MediaType"].MOVIE if identity.get("media_type") == "movie" else ports["MediaType"].TV
        return ports["media"].recognize_media(media_source=source, media_id=str(identity["media_id"]), mtype=mtype)

    def preview(self, source: dict[str, Any], identity: dict[str, Any], complete: bool = True) -> dict[str, Any]:
        ports = self.ports()
        media = self.media_info(identity)
        if not media:
            raise RuntimeError("MoviePilot 无法读取候选详情")
        keys = ("path", "storage", "type", "name", "fileid", "parent_fileid")
        fileitem = ports["FileItem"](**{key: source.get(key) for key in keys if source.get(key) is not None})
        directory = ports["directory"].get_dir(media=media, src_path=Path(str(source["path"])), storage=source.get("storage") or "local")
        if not directory or not directory.library_path:
            raise RuntimeError("MoviePilot 没有返回匹配的媒体库目录")
        kwargs: dict[str, Any] = {
            "fileitem": fileitem, "target_storage": directory.library_storage,
            "target_path": Path(directory.library_path), "force": True, "background": False,
            "reorganize": False, "sync_extra_files": True,
            "transfer_type": directory.transfer_type or "link", "scrape": False,
        }
        if complete:
            kwargs.update({
                "media_source": ports["MediaSource"](identity["media_source"]), "media_id": str(identity["media_id"]),
                "mtype": media.type, "season": int(identity.get("season") or 0) or None,
                "library_type_folder": directory.library_type_folder,
                "library_category_folder": directory.library_category_folder,
            })
        # preview 必须在调用点写成字面量 True，便于静态门禁证明没有写入路径。
        state, payload = ports["transfer"].manual_transfer(preview=True, **kwargs)
        if isinstance(payload, dict):
            # MoviePilot 的 preview item 当前只返回 source/target，不携带目标存储。
            # 在只读适配器边界补齐真实目录配置，避免 S/C/E 对账把非本地媒体库
            # 错当成 local 去查询。
            normalized = dict(payload)
            normalized["items"] = [
                {**model_dict(item), "target_storage": directory.library_storage}
                for item in (payload.get("items") or [])
            ]
            return normalized
        if not state:
            raise RuntimeError(str(payload or "官方预览失败"))
        return {"summary": {"total": 0, "success": 0, "failed": 0}, "items": []}

    def exists(self, storage: str, path: str) -> bool:
        return bool(self.ports()["storage"].get_file_item_strict(storage=storage or "local", path=Path(path)))

    def ai_identify(self, items: list[dict[str, Any]], timeout: float = 90.0) -> tuple[dict[str, Any], dict[str, Any]]:
        from app.agent.llm.helper import LLMHelper
        prompt = (
            "你只负责在每个完整下载边界内拆分影视作品并提出数据库搜索假设。"
            "不得判断整理成功失败，不得输出数据库ID或目标路径。每个输入file_id必须且只能进入某个work.file_ids、"
            "work.attachment_file_ids 或 unassigned_file_ids 三者之一。shared_tokens 是共享词典，路径里的 $0、$1 按下标引用它；"
            "ignored_summary 和 omitted_count 只有数量、没有待分配 file_id；"
            "无法确定就abstain=true。只输出JSON对象："
            '{"items":{"<boundary_id>":{"works":[{"title":"","original_title":"","year":null,'
            '"media_type":"movie|tv|unknown","presentation":"live_action|animation|unknown","season":null,'
            '"file_ids":[],"attachment_file_ids":[],"search_queries":[],"confidence":"high|medium|low"}],'
            '"unassigned_file_ids":[],"abstain":false}}}.\n'
            + json.dumps({"items": items}, ensure_ascii=False, separators=(",", ":"))
        )

        async def invoke() -> Any:
            model = LLMHelper.get_llm(streaming=False, thinking_level="off", prompt_cache_key="mediagovernor-validator-v1")
            if inspect.isawaitable(model):
                model = await model
            if callable(getattr(model, "ainvoke", None)):
                return await asyncio.wait_for(model.ainvoke(prompt), timeout=timeout)
            if callable(getattr(model, "invoke", None)):
                return await asyncio.wait_for(asyncio.to_thread(model.invoke, prompt), timeout=timeout)
            raise TypeError("当前大模型没有可用调用接口")

        response = asyncio.run(invoke())
        text = LLMHelper.extract_text_content(getattr(response, "content", response))
        match = re.search(r"\{.*\}", str(text), re.DOTALL)
        if not match:
            raise ValueError("大模型没有返回 JSON 对象")
        value = json.loads(match.group(0))
        usage = model_dict(getattr(response, "usage_metadata", None) or getattr(response, "response_metadata", {}).get("token_usage"))
        return value, {"usage": usage, "input_chars": len(prompt), "output_chars": len(str(text))}
