# MediaGovernor 界面合同

### UI decision: 独立只读验证台

- 用户与目标：在一次安装中验证 V0-V8 全链，明确能否进入正式 MediaGovernor 重构，而不是直接修复媒体。
- 信息层级：整体门槛、当前阶段、四类最终数量、九阶段回执；不展示内部对象堆叠成“问题数”。
- 数据与权限：页面只调用 plan/run/status/export 四类 bearer API；AI 前展示脱敏字段和预计调用，验证插件没有媒体写入 API。
- 状态合同：覆盖 idle、running、stopping、completed、completed_with_findings、cancelled、interrupted 和 failed；阶段区分 passed、failed、blocked、skipped。
- 技术选择：沿用 Vue 3、联邦构建和 MoviePilot/Vuetify 语义变量；参考 21st Task Steps 的阶段模式但不安装 React/shadcn 组件，不新增依赖。
- 响应式与无障碍：760px、480px 两级收敛，原生按钮禁用，状态使用 `aria-live`，确认层声明 dialog，遵守 `prefers-reduced-motion`。
- 验收：四按钮语义、运行前确认、阶段进度、停止/继续、脱敏导出、深浅宿主主题、移动端与真实插件页面。
- 回滚：删除独立 `MediaGovernorValidator` 条目即可，不影响正式 `MediaGovernor`。

### UI decision: v5 逐作品对账台

- 用户与目标：用户只需要看到已经证明的整理失败与假成功，在歧义时确认一次作品身份，并在逐文件预览后安全重建。
- 信息层级：首页依次显示后台任务、四个摘要数字、已经证明的问题、需要确认、本轮没读完；“完整重建”只在高级操作中出现。
- 数据与权限：浏览器只调用六类 bearer API，不扫描目录、不保存地图、不调用 AI 或 MoviePilot 整理接口；私有路径只在用户打开单项详情后返回。
- 状态合同：覆盖 idle、running、completed、failed、cancelled、empty、identity confirmation、read error、preview expired 和最终写入确认。读取失败不得显示成正常。
- 技术选择：沿用 Vue 3 和现有联邦构建，不增加组件库、外部资产、账号或动效依赖。
- 响应式与无障碍：760px 以下改为单列；按钮使用原生禁用态，任务状态使用 `aria-live`，弹层声明 dialog，遵守 `prefers-reduced-motion`。
- 性能预算：页面只轮询小型状态和结论；首次完整扫描由后端持久任务完成，日常无变化检查不得调用 AI 或生成全库预览。
- 执行顺序：每批最多四部，只为本批生成搜索词，随后立即逐部核对、保存结论并增加进度；禁止先处理全库身份、最后才显示结果。
- 取消合同：所有目录读取、身份识别、AI、候选搜索、官方预览与目标探针都通过只读超时边界等待；停止后立即放弃尚未返回的只读结果，已完成结论保留，取消不得记成失败。媒体写入不使用可抛弃调用。
- 增量合同：指纹未变化的已确认身份和待确认候选都直接复用；只有指纹变化、完整重建或用户单项重试才重新识别。完整重建不得覆盖用户确认的身份。
- 主题合同：所有文字、表面、边框、主色和状态色只使用 MoviePilot/Vuetify 语义变量；标题显式继承 `on-surface`，禁止白色固定表面或独立浅色主题。
- 安全与回滚：修复必须重新读取、生成带 token 的冻结预览并二次确认；旧 `media_map.json` 保留但不采信，回滚到 4.6 不需要迁移数据库。
- 验收：真实原始回放、API/任务生命周期、刷新续跑、Vue 构建、浏览器交互、NAS 只读 shadow 和隔离目录重建均需绑定同一候选 SHA。
