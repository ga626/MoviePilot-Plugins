import { categoryOfIdentity, categoryOfRoot, classifyFinding, destinationPath, latestHistoryRows, libraryRootForPath, pathKey, sourcePath, summarizeUnit, videoPattern } from './governance.js'
import { evaluateOfficialPreview, officialPreviewItems } from './preview-audit.js'

export function validatePreviewTarget ({ identity, preview, libraryRoots = [] } = {}) {
  const expected = categoryOfIdentity(identity)
  const roots = officialPreviewItems(preview).map(item => libraryRootForPath(item.target, libraryRoots)).filter(Boolean)
  const actual = [...new Set(roots.map(categoryOfRoot).filter(Boolean))]
  if (!expected || !actual.length) return { valid: false, reason: '无法确认官方预览选中的媒体库分类' }
  if (actual.some(value => value !== expected)) return { valid: false, reason: '官方预览选中的目录与作品类型不一致，已禁止修复' }
  return { valid: true, reason: '官方预览的目标分类已通过独立核对' }
}

/**
 * 生产和金标准共用的唯一判定入口。
 * 先用当前历史+实际目标证明问题；已完整建立且规则无冲突的作品直接正常；
 * 只有无历史或不完整项才需要官方预览作为最后证据。
 */
export function evaluateCurrentState ({ unit, identity, preview, presentPaths = new Set(), libraryRoots = [] } = {}) {
  const summary = unit?.summary || summarizeUnit(unit)
  const rules = classifyFinding({ unit, summary, history: unit?.history || [], library: libraryRoots, diagnosis: identity, presentPaths })
  if (rules.length) return rules[0]
  const sourceVideos = new Set((unit?.entries || []).filter(item => videoPattern.test(item?.name || '')).map(item => pathKey(item.path)))
  const currentVideoSources = new Set(latestHistoryRows(unit?.history || [])
    .filter(row => row?.status === true && videoPattern.test(sourcePath(row)) && presentPaths.has(pathKey(destinationPath(row))))
    .map(row => pathKey(sourcePath(row))))
  if (sourceVideos.size && [...sourceVideos].every(path => currentVideoSources.has(path))) return null
  return evaluateOfficialPreview({ unit, identity, preview, presentPaths, libraryRootFor: path => libraryRootForPath(path, libraryRoots) })
}
