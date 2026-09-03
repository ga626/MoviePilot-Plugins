const clean = value => String(value || '').trim()
const unique = values => [...new Set(values.filter(Boolean))]
const pathKey = value => {
  const normalized = clean(value).replace(/\\/g, '/').replace(/\/+/g, '/')
  return (normalized === '/' ? normalized : normalized.replace(/\/$/, '')).toLowerCase()
}

export function pathRelationship(left, right) {
  const parent = pathKey(left), child = pathKey(right)
  if (!parent || !child) return 'unrelated'
  if (parent === child) return 'same'
  if (child.startsWith(`${parent}/`)) return 'ancestor'
  if (parent.startsWith(`${child}/`)) return 'descendant'
  return 'unrelated'
}

export function bundleFamily(value) {
  return clean(value)
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[\[【(（].*?[\]】)）]/g, ' ')
    .replace(/(?:[. _-]|^)s\d{1,2}(?:[. _-]?e\d{1,3})+(?=$|[. _-])/ig, ' ')
    .replace(/(?:[. _-]|^)(?:e|ep)?\d{1,3}(?=$|[. _-])/ig, ' ')
    .replace(/\b(?:2160p|1080p|720p|web[ .-]?dl|web[ .-]?rip|bluray|bdrip|remux|x26[45]|h\.?26[45]|hevc|aac|dts|atmos|hdr10?\+?|dv|10bit|proper|repack|complete)\b/ig, ' ')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 120)
}

export function dedupeRoots(roots) {
  const accepted = [], skipped = []
  for (const root of [...roots].sort((a, b) => pathKey(a?.path).length - pathKey(b?.path).length)) {
    const candidate = pathKey(root?.path)
    if (!candidate) continue
    const duplicate = accepted.find(item => {
      const parent = pathKey(item?.path)
      return String(item?.storage || 'local') === String(root?.storage || 'local') && (candidate === parent || candidate.startsWith(`${parent}/`))
    })
    if (duplicate) skipped.push(root)
    else accepted.push(root)
  }
  return { roots: accepted, skipped }
}

export function episodeAudit(episodes = []) {
  const values = episodes.map(Number).filter(value => Number.isInteger(value) && value > 0).sort((a, b) => a - b)
  const duplicates = unique(values.filter((value, index) => values.indexOf(value) !== index))
  const known = unique(values)
  const missing = known.length > 1 ? Array.from({ length: known.at(-1) - known[0] + 1 }, (_, index) => known[0] + index).filter(value => !known.includes(value)) : []
  return { episodes: known, duplicates, missing }
}

export function candidateFamily(candidate = {}) {
  return [clean(candidate.title || candidate.original_title).toLowerCase(), clean(candidate.year), clean(candidate.type_name).toLowerCase(), Number(candidate.episodeCount) || ''].join(':')
}

export function resolveIdentity(candidates = [], diagnosis = {}) {
  if (diagnosis?.classification === 'sample' || diagnosis?.classification === 'test') return { state: 'non_media', candidates: [], reason: '包被识别为样片或测试残留。' }
  const first = candidates[0]
  const families = new Map()
  for (const candidate of candidates) {
    const key = candidateFamily(candidate)
    const current = families.get(key)
    if (!current || Number(candidate.score) > Number(current.score)) families.set(key, candidate)
  }
  const competitors = [...families.values()].sort((a, b) => Number(b.score) - Number(a.score))
  const second = competitors.find(candidate => candidate !== first)
  if (!first) return { state: 'insufficient', candidates, reason: diagnosis?.abstain ? '模型放弃判断，且官方数据源没有可核验候选。' : '完整包证据已读取，但没有可核验候选。' }
  if (Number(first.score) >= 9 && !(first.conflicts || []).length && (!second || Number(first.score) - Number(second.score) >= 3)) return { state: 'confirmed', identity: first, candidates, reason: '候选经过标题、类型、年份和集数的交叉核验。' }
  return { state: 'needs_selection', candidates, reason: first.conflicts?.[0] || '仍有接近候选，必须查看详细资料后确认。' }
}

export function organizationAudit({ evidence = {}, identity = {}, diagnosis = {} } = {}) {
  const issues = []
  if (!identity?.title) return ['作品身份未确认，不能判断现有目录是否正确']
  const type = clean(identity.type_name).toLowerCase()
  const audit = episodeAudit(evidence.episodes)
  const expected = Math.max(0, ...(diagnosis.expected_episodes || []), ...audit.episodes)
  if (/(tv|电视剧|剧集|series)/i.test(type) && expected > 1 && identity.episodeCount && identity.episodeCount < expected) issues.push(`目录含第 ${expected} 集，但所选作品只有 ${identity.episodeCount} 集`)
  if (/(tv|电视剧|剧集|series)/i.test(type) && identity.episodeCount && Number(evidence.videos) > identity.episodeCount) issues.push(`${evidence.videos} 个视频多于作品总集数 ${identity.episodeCount}`)
  const duplicates = unique([...audit.duplicates, ...(evidence.duplicateEpisodes || [])])
  if (duplicates.length) issues.push(`发现重复集号：${duplicates.join('、')}`)
  if (audit.missing.length) issues.push(`集号缺失：${audit.missing.join('、')}`)
  return issues
}

function fixture(id, label, input, expected) {
  const actual = id === 'sample' ? resolveIdentity([], { classification: 'sample' }).state
    : id === 'empty' ? resolveIdentity([], { abstain: true }).state
      : id === 'conflict' ? resolveIdentity(input.candidates, {}).state
        : id === 'confirmed' ? resolveIdentity(input.candidates, {}).state
          : organizationAudit(input).length ? 'locked' : 'clear'
  return { id, label, input, expected, actual, pass: actual === expected }
}

export function acceptanceFixtures() {
  return [
    fixture('confirmed', '正常单季', { candidates: [{ title: '示例剧', year: '2024', type_name: 'tv', episodeCount: 12, score: 12, conflicts: [] }] }, 'confirmed'),
    fixture('conflict', '动画与真人版冲突', { candidates: [{ title: 'Cowboy Bebop', year: '1998', type_name: 'tv', episodeCount: 26, score: 10, conflicts: [] }, { title: 'Cowboy Bebop', year: '2021', type_name: 'tv', episodeCount: 10, score: 8, conflicts: [] }] }, 'needs_selection'),
    fixture('sample', '样片或测试残留', {}, 'non_media'),
    fixture('empty', '无可靠候选', {}, 'insufficient'),
    fixture('missing', '缺集审计', { evidence: { episodes: [1, 2, 4], videos: 3 }, identity: { title: '示例剧', type_name: 'tv', episodeCount: 4 }, diagnosis: {} }, 'locked'),
    fixture('duplicate', '重复集审计', { evidence: { episodes: [1, 2, 2], videos: 3 }, identity: { title: '示例剧', type_name: 'tv', episodeCount: 2 }, diagnosis: {} }, 'locked'),
  ]
}
