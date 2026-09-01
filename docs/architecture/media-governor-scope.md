# MediaGovernor 架构与安全边界

MediaGovernor 是 MoviePilot V3 的整理结果质检插件。它仅在原生整理结果产生后进行观察、归并、对账和零写入预演；不替代 MoviePilot 的识别、分类、下载或整理链路。

## 数据模型

`EventObservation` 只投影公开事件与只读历史中的媒体身份、稳定历史号/幂等键和整理方式。`GovernanceQueue` 以媒体身份聚合为作品包，保存状态、原因码、计数和脱敏指纹，绝不保存文件路径、文件名、`FileItem` 或宿主对象。

问题状态是：

- `verified`：身份和硬链接方式均由公开字段确认；
- `needs_attention`：原生失败或整理方式与预期不一致；
- `needs_selection`：同一稳定事件的身份发生冲突；
- `awaiting_host_information`：公开字段不足，插件不猜测。

## 预演计划

失败记录可以调用 MoviePilot 原生 `manual_transfer`，但网关把参数固定为 `transfer_type="link"` 与 `preview=True`。计划只保存状态、时效、历史号、作品包指纹和回执版本；它不包含目标路径，也没有对应的执行 API。

任何未来的真实补建都必须先有公开稳定合同、独立测试副本验证、幂等与用户确认。删除、覆盖、移动和改名必须永远与补建分离。

## 用户界面

插件使用官方 Vue 模块联邦，暴露 `Page`、`Config` 与 `AppPage`。页面只调用当前实例的 bearer API，并复用 MoviePilot 宿主的通知和确认能力；不创建独立登录、全局 HTTP 客户端或弹窗容器。

## 上游边界

如果 MoviePilot 未公开某个完成凭证、媒体服务器库存或真实写入合同，插件将该情况标记为等待宿主信息。不得通过私有 API、ORM、宿主数据库或扫描媒体目录绕过这个边界。
