const text = value => String(value || '').trim()
const unique = values => [...new Set(values.filter(Boolean))]

export const videoPattern = /\.(mkv|mp4|avi|m2ts|ts|mov|webm)$/i
export const subtitlePattern = /\.(ass|ssa|srt|sub|vtt)$/i

export function cleanTitle(value) {
  return text(value).replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[\[【(（].*?[\]】)）]/g, ' ')
    .replace(/\b(2160p|1080p|720p|web[ .-]?(dl|rip)|bluray|bdrip|remux|x26[45]|h\.?26[45]|hevc|aac|dts|atmos|hdr10?\+?|dv|10bit|proper|repack|complete|中字|简繁|国语|粤语)\b/gi, ' ')
    .replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
}

export function strictEpisodeHints(value) {
  const name = text(value); const found = []
  for (const match of name.matchAll(/\bS\d{1,2}E(\d{1,3})\b/ig)) found.push(Number(match[1]))
  for (const match of name.matchAll(/\b(?:EP|E)(\d{1,3})\b/ig)) found.push(Number(match[1]))
  for (const match of name.matchAll(/[\[【](\d{1,3})[\]】]/g)) found.push(Number(match[1]))
  return unique(found.filter(value => value > 0 && value < 1000)).sort((a, b) => a - b)
}

export function fileFingerprint(item = {}) {
  return [text(item.name), text(item.type), Number(item.size) || 0, text(item.modify_time || item.mtime)].join('|')
}

export function unitFingerprint(unit = {}) {
  return [text(unit.root?.path || unit.root), ...(unit.entries || []).map(fileFingerprint).sort()].join('\n')
}

export function rootFingerprint(items = []) { return [...items].map(fileFingerprint).sort().join('\n') }

export function pathKey(value) {
  return String(value || '').replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '').toLowerCase()
}

export function isRootPath(value) {
  const path = pathKey(value)
  return !path || path === '/' || /^[a-z]:$/i.test(path)
}

export function isWithinPath(value, root) {
  const path = pathKey(value); const base = pathKey(root)
  return Boolean(path && base && (path === base || path.startsWith(`${base}/`)))
}

/** 把“目录配置”显式转换为 FileItem；配置对象本身绝不能送进 storage/list。 */
export function configuredDownloadRoots(configurations = []) {
  const roots = []; const rejected = []; const seen = new Set()
  for (const configuration of configurations) {
    const path = String(configuration?.download_path || '').trim()
    const storage = String(configuration?.storage || 'local').trim() || 'local'
    if (isRootPath(path)) { rejected.push({ name: text(configuration?.name) || '未命名目录配置', reason: '下载目录为空或指向容器根目录' }); continue }
    const key = `${storage}:${pathKey(path)}`
    if (seen.has(key)) continue
    seen.add(key)
    roots.push({ type: 'dir', storage, path, name: text(configuration?.name) || path, configured: true, media_type: text(configuration?.media_type), media_category: text(configuration?.media_category) })
  }
  return { roots, rejected }
}

export function configuredLibraryRoots(configurations = []) {
  const roots = []; const seen = new Set()
  for (const configuration of configurations) {
    const path = String(configuration?.library_path || '').trim()
    const storage = String(configuration?.library_storage || 'local').trim() || 'local'
    if (isRootPath(path)) continue
    const key = `${storage}:${pathKey(path)}`
    if (seen.has(key)) continue
    seen.add(key)
    roots.push({ type: 'dir', storage, path, name: text(configuration?.name) || path, media_type: text(configuration?.media_type), media_category: text(configuration?.media_category) })
  }
  return roots
}

export function libraryRootForPath(path, roots = []) {
  return [...roots].filter(root => isWithinPath(path, root?.path)).sort((left, right) => pathKey(right?.path).length - pathKey(left?.path).length)[0] || null
}

export function sourcePath(row = {}) {
  const item = row.src_fileitem || row.source_fileitem || row.fileitem || {}
  return String(item.path || row.src || row.source || '')
}

export function destinationPath(row = {}) {
  const item = row.dest_fileitem || {}
  return String(item.path || row.dest || '')
}

/** 仅允许“历史源文件位于下载单元内”的单向归属；父目录历史不能被猜测分配给多个包。 */
export function historyRowsForUnit(unit, rows = []) {
  const root = unit?.root?.path || ''
  return rows.filter(row => isWithinPath(sourcePath(row), root)).sort(latestFirst)
}

export function latestFirst(left, right) {
  const leftDate = Date.parse(left?.date || '') || 0; const rightDate = Date.parse(right?.date || '') || 0
  if (leftDate !== rightDate) return rightDate - leftDate
  const sequence = value => Number(String(value || '').match(/(\d+)$/)?.[1] || 0)
  return sequence(right?.id) - sequence(left?.id)
}

export function latestHistory(rows = []) { return [...rows].sort(latestFirst)[0] || null }

/** 同一源文件的旧整理记录只作审计依据，当前目标只认该源文件最近一次结果。 */
export function latestHistoryRows(rows = []) {
  const bySource = new Map()
  for (const row of [...rows].sort(latestFirst)) {
    const source = pathKey(sourcePath(row)) || `history:${row?.id || bySource.size}`
    if (!bySource.has(source)) bySource.set(source, row)
  }
  return [...bySource.values()].sort(latestFirst)
}

export function createDownloadUnits(root, children = []) {
  // 顶层目录或顶层视频各是一个下载单元；不再用相似标题拼成虚构“包”。
  return children.filter(item => item?.type === 'dir' || videoPattern.test(item?.name || '')).map(item => ({
    id: `${root?.storage || 'local'}:${item?.path || item?.name}`, root: item, entries: [], status: 'pending',
  }))
}

/** 地图只持久化媒体库根摘要；具体存在性由整理历史指向的目标目录逐一核验。 */
export function libraryRootSnapshot(roots = []) {
  return roots.filter(root => root && typeof root === 'object').map(root => ({
    id: `${root.storage || 'local'}:${root.path || root.name || ''}`,
    root,
    fingerprint: fileFingerprint(root),
    video_count: 0,
    episodes: [],
    category: cleanTitle(root.name) || '媒体库根',
  }))
}

export function summarizeUnit(unit = {}) {
  const episodeFiles = new Map(); let video_count = 0; let subtitle_count = 0; let nfo_count = 0
  for (const item of unit.entries || []) {
    const name = text(item.name)
    if (videoPattern.test(name)) { video_count += 1; for (const episode of strictEpisodeHints(name)) episodeFiles.set(episode, [...(episodeFiles.get(episode) || []), name]) }
    else if (subtitlePattern.test(name)) subtitle_count += 1
    else if (/\.nfo$/i.test(name)) nfo_count += 1
  }
  const episodes = [...episodeFiles.keys()].sort((a, b) => a - b)
  const duplicateEpisodes = [...episodeFiles].filter(([, files]) => new Set(files).size > 1).map(([episode]) => episode)
  return { video_count, subtitle_count, nfo_count, episodes, duplicateEpisodes, fingerprint: unitFingerprint(unit), names: unique([cleanTitle(unit.root?.name), ...(unit.entries || []).map(item => cleanTitle(item.name))].filter(Boolean)).slice(0, 50) }
}

export function historyIndex(rows = []) {
  const bySource = new Map()
  for (const row of rows) {
    const source = row?.src_fileitem || row?.source_fileitem || row?.fileitem || {}
    const key = text(source.path || row?.src || row?.source)
    if (!key) continue
    const group = bySource.get(key) || []; group.push(row); bySource.set(key, group)
  }
  return bySource
}

const mediaKind = value => /tv|series|电视剧|剧集|动漫|动画|综艺|纪录片/i.test(text(value)) ? 'tv' : /movie|film|电影/i.test(text(value)) ? 'movie' : ''

export function classifyFinding({ unit, summary, history = [], library = [], diagnosis = null }) {
  const finding = (kind, reason, strength = 'strong') => ({ kind, reason, strength, unit_id: unit.id, history_id: latestHistory(history)?.id || null })
  if (!summary.video_count) return []
  const successful = history.filter(row => row?.status === true)
  const failed = history.filter(row => row?.status === false)
  const targetMissing = successful.length && successful.every(row => !row?.dest_fileitem?.path && !row?.dest)
  if (failed.length && !successful.length) return [finding('native_failure', '原生整理失败后，当前下载单元仍在且没有成功整理记录')]
  if (targetMissing) return [finding('native_failure', '原生整理记录没有当前可核验的媒体库目标')]
  if (summary.duplicateEpisodes.length) return [finding('episode_error', `同一下载单元有重复集号：${summary.duplicateEpisodes.join('、')}`)]
  if (!diagnosis || diagnosis.abstain || diagnosis.confidence < .5) return []
  const record = successful[0] || {}; const recordKind = mediaKind(record.type || record.media_type || record.category)
  const expectedKind = diagnosis.media_type
  if (recordKind && expectedKind !== 'unknown' && recordKind !== expectedKind) return [finding('category_error', '媒体类型对不上：当前整理目录与已确认作品类型不同')]
  const titles = [record.title, record.original_title, record.media_name].map(cleanTitle).filter(Boolean)
  const proposed = [diagnosis.title, diagnosis.original_title].map(cleanTitle).filter(Boolean)
  if (titles.length && proposed.length && !titles.some(left => proposed.some(right => left === right || left.includes(right) || right.includes(left)))) return [finding('identity_error', '当前整理作品名与整包证据确认的作品不一致', 'review')]
  if (diagnosis.season && record.season && Number(record.season) !== Number(diagnosis.season)) return [finding('hierarchy_error', '季目录对不上：当前整理季与整包证据不一致', 'review')]
  return []
}

export function diffMap(previous = {}, next = {}) {
  const oldUnits = new Map((previous.download_units || []).map(item => [item.id, item.fingerprint]))
  const changed = (next.download_units || []).filter(item => oldUnits.get(item.id) !== item.fingerprint).map(item => item.id)
  return { changed, unchanged: (next.download_units || []).length - changed.length, first: !previous.map_version }
}

export function findingLabel(kind) {
  return ({ native_failure: '原生整理失败', category_error: '目录分类错误', hierarchy_error: '目录层级错误', episode_error: '剧集对应错误', identity_error: '作品识别错误', unconfirmed: '无法确认', uncovered: '尚未覆盖' })[kind] || '需要核对'
}
