import { previewSourceFiles } from './evidence-pipeline.js'

/** 只生成 MoviePilot ManualTransferItem 已声明的字段；绝不发送旧版不存在的 src_fileitem。 */
export function manualPreviewRequest (pkg, identity, target = {}) {
  const fileitems = previewSourceFiles(pkg)
  return {
    fileitems,
    media_source: identity?.media_source || undefined,
    media_id: identity?.media_id || undefined,
    type_name: identity?.media_type || undefined,
    season: identity?.season || undefined,
    target_storage: target?.target_storage || undefined,
    target_path: target?.target_path || undefined,
    transfer_type: 'link',
    preview: true,
    reorganize: false,
  }
}

/** 每个成功历史单独交给官方重建，令宿主只清理该历史可归因的旧目标。 */
export function manualRebuildRequests (historyIds = [], identity = {}) {
  return [...new Set(historyIds.filter(value => Number.isInteger(Number(value))).map(Number))].map(logid => ({
    logid,
    media_source: identity.media_source,
    media_id: identity.media_id,
    type_name: identity.media_type,
    season: identity.season || undefined,
    transfer_type: 'link',
    preview: false,
    reorganize: false,
  }))
}
