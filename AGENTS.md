# MoviePilot Media Governor（V3）

## 产品边界

- 本仓库是 MoviePilot V3 的第三方插件仓库基线；必须保持上游 `MoviePilot-Plugins` 的目录、索引与发布合同。新插件只使用 `plugins.v3/<plugin_id_lower>/`、`tests/v3/<plugin_id_lower>/` 与 `package.v3.json`。
- 当前唯一产品是 `MediaGovernor`，目录 `plugins.v3/mediagovernor/`。它的目标是通用媒体治理：识别置信度、命名冲突、文件集完整性、硬链接条件和可诊断异常队列；禁止为单一影视作品写硬编码特例。
- S1 仅验证 V3 加载、页面和生命周期合同，默认停用，且不得监听整理事件、调用整理链、访问下载/媒体目录、移动/改名/删除文件、写宿主媒体历史或发起网络请求。进入任何会影响媒体的阶段前，必须先完成设计、预演、幂等与回执合同，并获得明确 NAS 安装/启用授权。

## 上游兼容与实现规则

- 以 `docs/Plugin_Development.md`、`docs/Repository_Guide.md` 和当前 `main` 的上游源码为准；不凭目录名字猜测 API，不自创市场清单或安装机制。
- 插件主类继承 `app.plugins._PluginBase`；新能力优先使用 `app.sdk`、公开 Oper、Chain 或宿主已声明扩展点。禁止新代码导入 `app.sdk._legacy`、`app.core.*`、`app.helper.*`、`app.utils.*`、`app.db.models.*`，也不得持有宿主 SessionFactory。
- 不在模块导入期或类定义期启动线程、任务、网络、数据库或文件操作；在 `init_plugin()` 建立资源，在 `stop_service()` 可重复、安全释放资源。配置与结构化状态使用基类数据接口，运行态不写回源码目录。
- `plugin_version`、`package.v3.json.version` 和 `history` 最新条目必须一致；历史按语义版本从新到旧排列。只有真实候选完成且决定发布时才将 `release` 改为 `true`。
- 无额外依赖时不创建 `pyproject.toml`；需要依赖时只在该文件声明 `[project].dependencies`，不提交 `uv.lock`，不从插件代码执行 pip/uv，也不覆盖宿主核心依赖。

## 开发、PR 与发布

- `main` 只作基线/合并后验证；每项独立改动先同步 `main`，新建 `codex/<topic>`，一分支一 PR，PR 后不叠加新功能。并行/外部 worker 才建隔离 worktree；`upstream` 仅读，绝不推送。
- 修改后跑受影响 `py_compile`/`compileall`、`tests/v3/mediagovernor`、`.github/scripts/check_plugin_versions.py`、`git diff --check`。PR 标题用 `type(scope): 中文结果`；正文中文且仅含 `变更 / 验证 / 风险或未验`，发布影响另列候选 SHA。全局规则的停止点、代理、CI、合并、Release/收口为准。
- 候选须为干净提交，绑定版本、包 SHA、真实 V3 加载和回执；公开/市场只提升同一制品，随后核对第三方仓 `main`、远端下载哈希和稳定安装。源码/本地测试/NAS 重启均不能替代这些证据。

## 数据与安全

- 不提交或输出 NAS 配置、Cookie、订阅、节点、控制密钥、PT 链接、tracker、媒体/下载路径、数据库、运行日志或未脱敏样例。`runtime/`、`local/` 和 `*.local.json` 保持忽略。
- qB/PT 永远直连；本插件不得改变现有代理、下载、媒体目录或硬链接策略。仅公开元数据是否经现有代理由 NAS 总项目规则决定，不在本插件中重写网络拓扑。
