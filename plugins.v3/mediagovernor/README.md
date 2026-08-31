# 媒体治理（MediaGovernor）

这是符合 MoviePilot V3 插件目录与索引规范的 S1 兼容性骨架，插件 ID 为 `MediaGovernor`，源码目录为 `plugins.v3/mediagovernor/`。

## 当前能做与不能做

- 能做：在真实 MoviePilot V3 宿主中验证插件发现、加载、配置页、详情页与停止生命周期。
- 不能做：不监听整理成功或失败事件，不调用 MoviePilot 整理链，不访问下载或媒体目录，不移动、硬链接、改名或删除任何文件，也不发起网络请求。
- 默认停用；`package.v3.json` 的 `release` 为 `false`。因此它不是可安装的媒体整理方案，更不是已经上架的插件。

## 上游合同

- 新插件使用 `plugins.v3/<plugin_id_lower>/`、`tests/v3/<plugin_id_lower>/` 和 `package.v3.json`。
- `MediaGovernor`、`mediagovernor`、`plugin_version` 和索引 `version` 必须始终对应。
- 后续需要媒体治理能力时，先在 `docs/architecture/` 定义通用状态机、异常分类、预演、幂等性和人工兜底，再实现。若上游未提供所需稳定扩展点，应先向 `MoviePilot` 主仓补宿主能力，而不是在插件中绕开边界。

官方参考：

- `docs/Plugin_Development.md`
- `docs/Repository_Guide.md`
- https://wiki.movie-pilot.org/plugin
