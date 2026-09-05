import { cleanTitle, latestHistoryRows, pathKey, sourcePath, strictEpisodeHints, videoPattern } from './governance.js'

const seasonOf = value => Number(String(value || '').match(/(?:^|[\\/ ._-])S(?:eason[ ._-]?)?(\d{1,2})(?=E\d|$|[\\/ ._-])/i)?.[1] || 0)
const matchingRoot = (path, roots = []) => [...roots]
  .filter(root => { const value = pathKey(path); const base = pathKey(root?.path); return value === base || value.startsWith(`${base}/`) })
  .sort((left, right) => pathKey(right?.path).length - pathKey(left?.path).length)[0]
const relativeParts = (path, root) => {
  const value = pathKey(path); const base = pathKey(root?.path || root)
  return value.startsWith(`${base}/`) ? value.slice(base.length + 1).split('/') : []
}

/**
 * 下载任务只是证据边界，不等于一部作品。优先按包内第一层作品目录拆分；
 * 没有独立子目录时再按季拆分。单文件电影和普通单季剧保持为一个作品单元。
 */
export function createWorkUnits (pkg = {}) {
  const videos = (pkg.entries || []).filter(item => videoPattern.test(item?.name || '') && item?.path)
  if (!videos.length) return []
  const topGroups = new Map()
  for (const video of videos) {
    const root = matchingRoot(video.path, pkg.roots || [pkg.root]) || pkg.root
    const parts = relativeParts(video.path, root)
    const rootKey = pathKey(root?.path)
    const key = (pkg.roots || []).length > 1 ? `root:${rootKey}` : parts.length > 1 ? `dir:${parts[0]}` : ''
    if (!topGroups.has(key)) topGroups.set(key, [])
    topGroups.get(key).push(video)
  }
  const namedTopGroups = [...topGroups].filter(([key]) => key)
  let groups
  if (namedTopGroups.length > 1 && !topGroups.has('')) groups = namedTopGroups.map(([key, rows]) => ({ key, rows }))
  else {
    const seasons = new Map()
    for (const video of videos) {
      const season = seasonOf(video.path) || seasonOf(video.name)
      const key = season ? `season:${season}` : 'all'
      if (!seasons.has(key)) seasons.set(key, [])
      seasons.get(key).push(video)
    }
    groups = seasons.size > 1 && !seasons.has('all') ? [...seasons].map(([key, rows]) => ({ key, rows })) : [{ key: 'all', rows: videos }]
  }
  return groups.map((group, index) => {
    const paths = new Set(group.rows.map(item => pathKey(item.path)))
    const history = latestHistoryRows((pkg.history || []).filter(row => paths.has(pathKey(sourcePath(row)))))
    const seasons = [...new Set(group.rows.flatMap(item => [seasonOf(item.path), seasonOf(item.name)].filter(Boolean)))]
    return {
      ...pkg,
      id: `${pkg.id}:work:${group.key || index}`,
      package_id: pkg.id,
      entries: group.rows,
      history,
      work_key: group.key,
      work_label: cleanTitle(group.rows[0]?.name) || cleanTitle(pkg.root?.name) || `作品 ${index + 1}`,
      season_hint: seasons.length === 1 ? seasons[0] : 0,
      episode_hints: [...new Set(group.rows.flatMap(item => strictEpisodeHints(item.name)))].sort((a, b) => a - b),
    }
  })
}
