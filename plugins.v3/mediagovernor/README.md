# 媒体治理（MediaGovernor）

这是符合 MoviePilot V3 插件目录与索引规范的 MediaGovernor S3，当前版本为 `v0.3.5`，插件 ID 为 `MediaGovernor`，源码目录为 `plugins.v3/mediagovernor/`。

## 当前能做与不能做

- 已完成的 S1：`v0.1.0` 已在真实 MoviePilot V3 宿主验证发现、市场安装、配置页、详情页，以及“启用后运行 / 停用后恢复禁用”的生命周期；该稳定版本仍保持在 NAS 上禁用。
- S3 能做：默认关闭时不处理任何事件；普通启用后，新发生的 `TransferComplete` / `TransferFailed` 会进入队列，所有记录按规范媒体身份聚合为脱敏作品包。既有失败历史回溯默认关闭，只有用户显式开启“`backfill_existing_failures`”才会分批只读回溯一次；完成后自动停止，绝不按周期重复扫描已确认的旧历史。较早稳定宿主不提供历史分页接口时，插件仍可正常加载并明确显示“历史回溯降级”，不会把缺失接口误变成安装失败。
- S3 候选不能做：不移动、硬链接、改名、删除、重试或写入宿主整理历史；没有真实整理 API、远程命令或后台服务。唯一预览接口要求用户已认证、插件已启用、历史号已被失败队列记录；它固定为 `transfer_type="link"` 与 `preview=true`，不返回路径，也不会触发整理。
- 当前发布版本使用市场 Release 分发；安装完成后仍默认关闭，不会自动对媒体执行任何操作。

## 上游合同

- 新插件使用 `plugins.v3/<plugin_id_lower>/`、`tests/v3/<plugin_id_lower>/` 和 `package.v3.json`。
- `MediaGovernor`、`mediagovernor`、`plugin_version` 和索引 `version` 必须始终对应。
- S3 使用已确认的 `app.sdk.events`、`app.db.oper.transferhistory.TransferHistoryOper` 和官方 `TransferChain.manual_transfer(..., preview=true)` 合同；禁止 ORM、SessionFactory、`app.sdk._legacy` 和任何私有宿主模块。
- 后续若要进入真实整理，必须先完成 S3 候选验收，并由用户单独授权 S4 的测试媒体副本验证。若上游未提供所需稳定扩展点，应先向 `MoviePilot` 主仓补宿主能力，而不是在插件中绕开边界。

官方参考：

- `docs/Plugin_Development.md`
- `docs/Repository_Guide.md`
- https://wiki.movie-pilot.org/plugin
