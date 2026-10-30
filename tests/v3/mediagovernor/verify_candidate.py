"""核对既有官方打包脚本产物与固定 Git 对象；只读 ZIP，不解压或执行插件。"""
from __future__ import annotations

import argparse
import ast
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import zipfile


PLUGIN = "plugins.v3/mediagovernor"


def verify(repository: Path, package: Path, ref: str = "HEAD") -> dict:
    def git(*args: str) -> bytes:
        return subprocess.run(["git", "-C", str(repository), *args], check=True, stdout=subprocess.PIPE).stdout

    sha = git("rev-parse", f"{ref}^{{commit}}").decode().strip()
    expected = {}
    for raw in git("ls-tree", "-r", "--name-only", "-z", sha, "--", PLUGIN).split(b"\0"):
        if raw:
            path = raw.decode("utf-8")
            expected[f"mediagovernor/{path[len(PLUGIN) + 1:]}"] = git("show", f"{sha}:{path}")
    if not expected:
        raise ValueError("固定提交没有插件文件")
    with zipfile.ZipFile(package) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)):
            raise ValueError("ZIP 包含重复条目")
        if any(name.startswith("/") or "\\" in name or ".." in PurePosixPath(name).parts for name in names):
            raise ValueError("ZIP 包含越界路径")
        if set(names) != set(expected):
            raise ValueError("ZIP 文件集合与固定提交不一致")
        files = {name: archive.read(name) for name in names}
        if any(files[name] != expected[name] for name in names):
            raise ValueError("ZIP 文件字节与固定提交不一致")

    manifest = json.loads(git("show", f"{sha}:package.v3.json"))["MediaGovernor"]
    version = manifest["version"]
    init = files["mediagovernor/__init__.py"].decode("utf-8")
    front = json.loads(files["mediagovernor/package.json"])
    if f'plugin_version = "{version}"' not in init or front["version"] != version or next(iter(manifest["history"])) != f"v{version}":
        raise ValueError("候选版本合同不一致")
    asset_dir = f"dist/v{version}/assets"
    if f'"{asset_dir}"' not in init:
        raise ValueError("后端联邦入口与版本不一致")
    entry_name = f"mediagovernor/{asset_dir}/remoteEntry.js"
    if entry_name not in files:
        raise ValueError("缺少当前联邦入口")
    for name, content in files.items():
        if not name.startswith(f"mediagovernor/{asset_dir}/") or not name.endswith(".js"):
            continue
        text = content.decode("utf-8")
        relative_refs = re.findall(r'''(?:from\s*|import\s*\()\s*["'](\./[^"']+)["']''', text)
        relative_refs += re.findall(r'''["']([^"'/]+\.css)["']''', text)
        for reference in relative_refs:
            target = str(PurePosixPath(name).parent / reference)
            if target not in files:
                raise ValueError("联邦资源引用缺失")
    tree = ast.parse(files["mediagovernor/governor.py"].decode("utf-8"))
    service = next(node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == "GovernorService")
    constructor = next(node for node in service.body if isinstance(node, ast.FunctionDef) and node.name == "__init__")
    defaults = {arg.arg: ast.literal_eval(value) for arg, value in zip(constructor.args.kwonlyargs, constructor.args.kw_defaults) if value is not None}
    if defaults.get("read_only") is not True or defaults.get("ai_enabled") is not False:
        raise ValueError("候选安全默认值不符合只读验收")
    return {
        "source_commit": sha,
        "version": version,
        "package_sha256": hashlib.sha256(package.read_bytes()).hexdigest(),
        "file_count": len(files),
        "all_files_match_commit": True,
        "render_path": asset_dir,
        "remote_entry_sha256": hashlib.sha256(files[entry_name]).hexdigest(),
        "default_read_only": defaults["read_only"],
        "default_ai_enabled": defaults["ai_enabled"],
        "candidate_package_contract": "passed",
        "nas_acceptance": "not_run",
        "public_release": "not_run",
        "files_sha256": {name: hashlib.sha256(content).hexdigest() for name, content in sorted(files.items())},
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("package", type=Path)
    parser.add_argument("--repository", type=Path, default=Path(__file__).resolve().parents[3])
    parser.add_argument("--ref", default="HEAD")
    args = parser.parse_args()
    print(json.dumps(verify(args.repository, args.package, args.ref), ensure_ascii=False, indent=2))
