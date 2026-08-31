# 媒体治理（MediaGovernor）

这是符合 MoviePilot V3 插件目录与索引规范的 S1 兼容性骨架，插件 ID 为 `MediaGovernor`，源码目录为 `plugins.v3/mediagovernor/`。

## 当前能做与不能做

- 能做：已在真实 MoviePilot V3 宿主中验证插件发现、市场安装、配置页、详情页，以及“启用后运行 / 停用后恢复禁用”的生命周期。
- 不能做：不监听整理成功或失败事件，不调用 MoviePilot 整理链，不访问下载或媒体目录，不移动、硬链接、改名或删除任何文件，也不发起网络请求。
- 默认停用；`package.v3.json` 的 `release` 为 `true`，已由 GitHub Release 分发并完成 MoviePilot 市场安装验证。它仍不是媒体整理方案：S1 不执行任何媒体操作。

## 上游合同

- 新插件使用 `plugins.v3/<plugin_id_lower>/`、`tests/v3/<plugin_id_lower>/` 和 `package.v3.json`。
- `MediaGovernor`、`mediagovernor`、`plugin_version` 和索引 `version` 必须始终对应。
- 后续需要媒体治理能力时，先在 `docs/architecture/` 定义通用状态机、异常分类、预演、幂等性和人工兜底，再实现。若上游未提供所需稳定扩展点，应先向 `MoviePilot` 主仓补宿主能力，而不是在插件中绕开边界。

官方参考：

- `docs/Plugin_Development.md`
- `docs/Repository_Guide.md`
- https://wiki.movie-pilot.org/plugin
