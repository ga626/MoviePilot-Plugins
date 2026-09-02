<script setup>
import { computed, ref } from 'vue'

const props = defineProps({ api: { type: Object, default: () => ({}) } })
const tab = ref('identity')
const loading = ref(false)
const notice = ref('')
const cards = ref([])
const selected = ref(null)
const audit = ref(null)
const confirmRepair = ref(false)
const sources = ref([])
const control = ref({ paused: false, stopped: false })
const run = ref(newRun())
const tick = ref(0)
let resumeWaiter = null
let timer = null

const pageSize = 100
const workers = 3
const maxDirs = 24
const maxDepth = 3
const maxNames = 24
const videoExt = /\.(mkv|mp4|avi|m2ts|ts|mov|webm)$/i
const subtitleExt = /\.(ass|ssa|srt|sub|vtt)$/i
const canUseApi = computed(() => typeof props.api?.get === 'function' && typeof props.api?.post === 'function')
const progress = computed(() => run.value.total ? Math.round(run.value.completed * 100 / run.value.total) : 0)
const elapsed = computed(() => {
  tick.value
  if (!run.value.startedAt) return '0 秒'
  const value = Math.round(((run.value.finishedAt || Date.now()) - run.value.startedAt) / 1000)
  return value < 60 ? `${value} 秒` : `${Math.floor(value / 60)} 分 ${value % 60} 秒`
})
const confirmed = computed(() => cards.value.filter(item => item.state === 'confirmed'))

function newRun() { return { phase: '尚未开始', total: 0, completed: 0, current: '', startedAt: 0, finishedAt: 0, stats: { confirmed: 0, selection: 0, insufficient: 0, unavailable: 0 } } }
const dataOf = value => value?.data ?? value
const safe = value => String(value || '').replace(/[\\/]/g, '').replace(/\s+/g, ' ').trim().slice(0, 160)
const unique = values => [...new Set(values.filter(Boolean))]

function sourcePackage(source) {
  if (source?.type === 'dir') return source
  const path = String(source?.path || '')
  const split = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return split < 1 ? null : { ...source, path: path.slice(0, split), name: '', basename: '', extension: '', type: 'dir', children: [] }
}

function cleanTitle(value) {
  return safe(value).replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[._-]+/g, ' ')
    .replace(/\b(2160p|1080p|720p|web[ .-]?dl|web[ .-]?rip|bluray|bdrip|remux|x26[45]|h\.?26[45]|hevc|aac|dts|atmos|hdr10?\+?|dv|10bit|proper|repack|complete|中字|简繁|国语|粤语)\b/gi, ' ')
    .replace(/\[[^\]]*\]|【[^】]*】/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100)
}
const norm = value => cleanTitle(value).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
function episodesText(episodes) {
  const items = [...new Set(episodes)].sort((a, b) => a - b)
  return !items.length ? '' : items.length === 1 ? `第 ${items[0]} 集` : `第 ${items[0]}–${items.at(-1)} 集（${items.length} 个集号）`
}
function evidenceText(evidence) {
  const values = [`${evidence.videos} 个视频`, `${evidence.subtitles} 个字幕`]
  if (evidence.episodes.length) values.push(episodesText(evidence.episodes))
  if (evidence.nfos) values.push(`${evidence.nfos} 个 NFO`)
  return values.join('，')
}

async function packageEvidence(root, source) {
  if (!root) return { ok: false, reason: '来源文件没有可读取的父目录。' }
  const queue = [{ item: root, depth: 0 }]
  const names = [safe(source?.name)]
  const episodes = []
  let directories = 0; let videos = 0; let subtitles = 0; let nfos = 0
  while (queue.length && directories < maxDirs) {
    const current = queue.shift()
    let children
    try { children = dataOf(await props.api.post('storage/list', current.item, { feedback: 'silent' })) } catch { return { ok: false, reason: 'MoviePilot 无法读取这个来源包。' } }
    if (!Array.isArray(children)) return { ok: false, reason: '来源包返回的数据不是可读文件列表。' }
    directories += 1
    for (const child of children) {
      const name = safe(child?.name)
      if (name && names.length < maxNames) names.push(name)
      const match = name.match(/[. _-][Ss](\d{1,2})[. _-]?[Ee](\d{1,3})(?:[. _-]?[Ee]?(\d{1,3}))?/i) || name.match(/\b[Ee][Pp]?(\d{1,3})\b/)
      if (match) episodes.push(Number(match[2] || match[1]), ...(match[3] ? [Number(match[3])] : []))
      if (child?.type === 'dir') { if (current.depth < maxDepth && queue.length < maxDirs) queue.push({ item: child, depth: current.depth + 1 }) }
      else if (videoExt.test(name)) videos += 1
      else if (subtitleExt.test(name)) subtitles += 1
      else if (/\.nfo$/i.test(name)) nfos += 1
    }
  }
  const queries = unique(names.map(cleanTitle).filter(name => norm(name).length >= 2)).slice(0, 4)
  if (!videos && !queries.length) return { ok: false, reason: '包内没有可识别的视频或名称线索。' }
  return { ok: true, videos, subtitles, nfos, directories, episodes: episodes.filter(Number.isFinite), queries, truncated: queue.length > 0 }
}

function identityOf(context, via) {
  const media = context?.media_info || context?.mediaInfo || context?.media || {}
  const meta = context?.meta_info || context?.metaInfo || {}
  return candidateOf({ title: media.title || media.name || meta.title, year: media.year || meta.year, media_source: media.media_source || media.source, media_id: media.media_id || media.id, type: media.type || media.mtype || meta.type, season: media.season || meta.season }, via)
}
function candidateOf(raw, via) {
  const title = safe(raw?.title || raw?.name)
  const mediaSource = String(raw?.media_source || raw?.source || '')
  const mediaId = String(raw?.media_id || raw?.id || '')
  const type = String(raw?.type || raw?.mtype || '')
  return title && mediaSource && mediaId && type ? { title, year: String(raw?.year || raw?.release_year || '').slice(0, 8), media_source: mediaSource, media_id: mediaId, type_name: type, season: Number(raw?.season || 0) || undefined, via, reasons: [], conflicts: [] } : null
}
const candidateKey = candidate => `${candidate.media_source}:${candidate.media_id}:${candidate.type_name}`

async function historyRows() {
  const rows = []
  for (let page = 1; ; page += 1) {
    const payload = dataOf(await props.api.get(`history/transfer?status=false&page=${page}&count=${pageSize}`, { feedback: 'silent' }))
    if (payload?.success === false) throw new Error(payload.message || '无法读取失败整理历史')
    const data = payload?.data ?? payload
    const batch = data?.items || data?.list || data?.data || []
    if (!Array.isArray(batch)) return rows
    rows.push(...batch)
    if (batch.length < pageSize) return rows
  }
}
async function readSources() {
  try {
    const raw = dataOf(await props.api.get('media/source', { feedback: 'silent' }))
    sources.value = Array.isArray(raw) ? raw.map(item => String(item?.media_source || item?.source || '')).filter(Boolean).slice(0, 6) : []
  } catch { sources.value = [] }
}

function scoreCandidate(candidate, evidence) {
  const title = norm(candidate.title)
  let score = 0
  if (evidence.queries.some(query => { const value = norm(query); return value.length >= 3 && (title.includes(value) || value.includes(title)) })) { score += 4; candidate.reasons.push('标题与包内名称线索一致') }
  if (candidate.via.includes('原生识别')) { score += 2; candidate.reasons.push('MoviePilot 原生识别命中') }
  const detail = candidate.detail || {}
  const year = String(detail.year || detail.release_year || candidate.year || '').slice(0, 4)
  const years = unique(evidence.queries.flatMap(query => query.match(/(?:19|20)\d{2}/g) || []))
  if (years.length && year && !years.includes(year)) { score -= 3; candidate.conflicts.push('年份线索不一致') }
  else if (years.length && year) { score += 1; candidate.reasons.push('年份线索一致') }
  const count = Number(detail.number_of_episodes || detail.episode_count || detail?.seasons?.[candidate.season]?.length || 0)
  if (evidence.videos >= 3 && count) {
    if (count < Math.max(2, evidence.videos * .55)) { score -= 4; candidate.conflicts.push('候选集数与来源包视频数明显冲突') }
    else { score += 2; candidate.reasons.push('候选集数与来源包规模不矛盾') }
  }
  if (evidence.episodes.length >= 3 && count && Math.max(...evidence.episodes) > count) { score -= 4; candidate.conflicts.push('来源包集号超过候选总集数') }
  candidate.score = score
}

async function recognizeCandidates(source, evidence) {
  const map = new Map()
  const add = candidate => { if (candidate) map.set(candidateKey(candidate), { ...map.get(candidateKey(candidate)), ...candidate }) }
  if (source?.path) try { add(identityOf(dataOf(await props.api.get(`media/recognize_file?path=${encodeURIComponent(source.path)}`, { feedback: 'silent' })), '来源文件原生识别')) } catch { /* Package evidence remains available. */ }
  for (const query of evidence.queries.slice(0, 3)) try { add(identityOf(dataOf(await props.api.get(`media/recognize?title=${encodeURIComponent(query)}`, { feedback: 'silent' })), '包名原生识别')) } catch { /* Try the other evidence. */ }
  for (const query of evidence.queries.slice(0, 2)) {
    const params = new URLSearchParams({ title: query, type: 'media', count: '8' })
    sources.value.forEach(sourceId => params.append('media_source', sourceId))
    try { const raw = dataOf(await props.api.get(`media/search?${params}`, { feedback: 'silent' })); if (Array.isArray(raw)) raw.forEach(item => add(candidateOf(item, '多来源官方搜索'))) } catch { /* A data source may be unavailable. */ }
  }
  const candidates = [...map.values()].slice(0, 10)
  for (const candidate of candidates) {
    try { candidate.detail = dataOf(await props.api.get(`media/${encodeURIComponent(candidate.media_id)}?${new URLSearchParams({ media_source: candidate.media_source, type_name: candidate.type_name })}`, { feedback: 'silent' })) || {} } catch { candidate.detail = {} }
    scoreCandidate(candidate, evidence)
  }
  return candidates.sort((left, right) => right.score - left.score)
}
function resolveIdentity(candidates) {
  const first = candidates[0]; const second = candidates[1]
  if (!first) return { state: 'insufficient', reason: '已读取整包名称和结构，但官方数据源没有返回候选。', candidates: [] }
  if (first.score >= 5 && !first.conflicts.length && (!second || first.score - second.score >= 2)) return { state: 'confirmed', identity: first, candidates, reason: '标题、原生识别和文件集信息相互支持。' }
  return { state: 'needs_selection', candidates, reason: `候选存在冲突：${first.conflicts[0] || (second ? '前两个候选证据接近，不能替你猜。' : '候选证据不足。')}` }
}
async function inspectPackage(row) {
  const source = row?.src_fileitem
  if (!source?.path) return { state: 'unavailable', historyId: row?.id, reason: '失败历史没有可读取的来源文件。' }
  const evidence = await packageEvidence(sourcePackage(source), source)
  if (!evidence.ok) return { state: 'unavailable', historyId: row.id, source, reason: evidence.reason }
  const resolved = resolveIdentity(await recognizeCandidates(source, evidence))
  return { ...resolved, historyId: row.id, source, evidence }
}

function addStat(item) { if (item.state === 'confirmed') run.value.stats.confirmed += 1; else if (item.state === 'needs_selection') run.value.stats.selection += 1; else if (item.state === 'insufficient') run.value.stats.insufficient += 1; else run.value.stats.unavailable += 1 }
async function waitIfPaused() { while (control.value.paused && !control.value.stopped) await new Promise(resolve => { resumeWaiter = resolve }); return !control.value.stopped }
function pause() { control.value.paused = true; run.value.phase = '已暂停：不会再派发新的来源包' }
function resume() { control.value.paused = false; run.value.phase = '继续检查来源包'; resumeWaiter?.(); resumeWaiter = null }
function stop() { control.value.stopped = true; control.value.paused = false; run.value.phase = '正在停止：已发出的请求会自然结束'; resumeWaiter?.(); resumeWaiter = null }

async function inspect() {
  if (!canUseApi.value || loading.value) { notice.value = '当前 MoviePilot 没有注入认证 API，无法安全检查。'; return }
  loading.value = true; cards.value = []; selected.value = null; audit.value = null; confirmRepair.value = false; control.value = { paused: false, stopped: false }
  run.value = { ...newRun(), phase: '正在读取失败整理历史', startedAt: Date.now() }
  timer = window.setInterval(() => { tick.value += 1 }, 1000)
  try {
    const [rows] = await Promise.all([historyRows(), readSources()])
    run.value.total = rows.length
    if (!rows.length) { run.value.phase = '没有失败整理记录'; notice.value = '没有读取到失败整理记录；本次没有进行任何文件操作。'; return }
    run.value.phase = `正在检查来源包（最多 ${workers} 条并发）`
    const queue = [...rows]
    const worker = async () => { while (queue.length && await waitIfPaused()) { const row = queue.shift(); if (!row) return; run.value.current = `正在核对第 ${run.value.completed + 1} 条来源包`; let item; try { item = await inspectPackage(row) } catch { item = { state: 'unavailable', historyId: row.id, source: row.src_fileitem, reason: '检查这一来源包时出现异常；可稍后重试。' } }; cards.value = [...cards.value, item]; run.value.completed += 1; addStat(item) } }
    await Promise.all(Array.from({ length: Math.min(workers, rows.length) }, worker))
    run.value.finishedAt = Date.now()
    if (control.value.stopped) notice.value = `检查已停止：已完成 ${run.value.completed}/${run.value.total} 条。已完成结果可查看，全程没有写入文件。`
    else { run.value.phase = '检查完成'; notice.value = `检查完成：已确认 ${run.value.stats.confirmed} 条，待你选择 ${run.value.stats.selection} 条，资料不足 ${run.value.stats.insufficient} 条，来源不可用 ${run.value.stats.unavailable} 条。全程没有写入文件。` }
  } catch (error) { run.value.phase = '检查未完成'; notice.value = error?.message || '无法读取整理历史；没有改动文件。' }
  finally { loading.value = false; if (timer) window.clearInterval(timer); timer = null }
}

function open(card, nextTab = 'identity') { selected.value = card; audit.value = null; confirmRepair.value = false; tab.value = nextTab }
function choose(candidate) { selected.value = { ...selected.value, state: 'confirmed', identity: candidate, reason: '已由你确认这部作品；仍须先通过官方预览。', userConfirmed: true }; cards.value = cards.value.map(item => item.historyId === selected.value.historyId ? selected.value : item) }
function payload(item, preview, reorganize) { return { fileitem: item.source, logid: item.historyId, transfer_type: 'link', preview, reorganize, media_source: item.identity.media_source, media_id: item.identity.media_id, type_name: item.identity.type_name, season: item.identity.season } }
function auditIssues(preview, history, target) {
  const issues = []; const summary = preview?.summary || {}; const items = preview?.items || []
  if (!history?.reorganize) issues.push('没有查到可确认的旧成功整理历史，不能把它当作清理旧链接。')
  if (!target?.target_path) issues.push('当前目录规则没有给出唯一目标位置。')
  if (!summary.total || summary.failed || items.some(item => item?.success === false || !item?.target)) issues.push('官方预览不完整，不能执行。')
  const episodes = items.map(item => Number(item?.episode)).filter(Number.isFinite)
  if (new Set(episodes).size !== episodes.length) issues.push('官方预览存在重复集号，不能执行。')
  return issues
}
async function auditOrganization() {
  if (!selected.value?.identity || selected.value.state !== 'confirmed') return
  loading.value = true; audit.value = null
  try {
    const base = payload(selected.value, true, true)
    const [historyResponse, targetResponse, previewResponse] = await Promise.all([props.api.post('transfer/manual/history', base, { feedback: 'silent' }), props.api.post('transfer/manual/target-path', base, { feedback: 'silent' }), props.api.post('transfer/manual', base, { feedback: 'silent' })])
    const history = dataOf(historyResponse); const target = dataOf(targetResponse); const preview = dataOf(previewResponse)
    if (history?.success === false || target?.success === false || preview?.success === false) throw new Error(history?.message || target?.message || preview?.message || '官方审计被拒绝')
    const historyData = history?.data ?? history; const targetData = target?.data ?? target; const previewData = preview?.data ?? preview
    const issues = auditIssues(previewData, historyData, targetData)
    audit.value = { history: historyData || {}, target: targetData || {}, preview: previewData || {}, issues, eligible: !issues.length }
    notice.value = audit.value.eligible ? '官方审计与零写入预览完成。请核对摘要，再决定是否重整。' : '已完成只读审计，但存在风险，执行按钮已锁定。'
  } catch (error) { notice.value = error?.message || '官方审计失败；没有改动文件。' } finally { loading.value = false }
}
async function repair() {
  if (!audit.value?.eligible || !selected.value) return
  loading.value = true
  try { const result = dataOf(await props.api.post('transfer/manual', payload(selected.value, false, true), { feedback: 'all' })); if (result?.success === false) throw new Error(result.message || 'MoviePilot 重整失败'); notice.value = `MoviePilot 已按官方预览重整“${selected.value.identity.title}”。旧硬链接的处理由 MoviePilot 官方完成；插件没有直接删除、移动、改名或覆盖来源文件。`; confirmRepair.value = false; audit.value = null } catch (error) { notice.value = error?.message || '重整没有完成；请查看 MoviePilot 的官方结果。' } finally { loading.value = false }
}
</script>

<template>
  <main class="governor-page">
    <header class="hero"><div><p class="eyebrow">MediaGovernor</p><h1>媒体治理工作台</h1><p>先找对作品，再检查整理是否正确。检查和预览不会改文件；真实重整必须由你确认。</p></div><div class="actions"><button class="primary" :disabled="loading" @click="inspect">{{ loading ? '检查进行中…' : cards.length ? '重新检查' : '开始检查' }}</button><button v-if="loading && !control.paused" class="secondary" @click="pause">暂停</button><button v-if="loading && control.paused" class="secondary" @click="resume">继续</button><button v-if="loading" class="danger" @click="stop">停止</button></div></header>
    <section class="progress" aria-live="polite"><div class="progress-head"><strong>{{ run.phase }}</strong><span>{{ run.completed }}/{{ run.total }} · {{ elapsed }}</span></div><div class="track"><i :style="{ width: `${progress}%` }" /></div><p v-if="run.current">{{ run.current }}。结果会逐条出现，不必等待全部结束。</p><div class="stats"><span>已确认 <b>{{ run.stats.confirmed }}</b></span><span>待选择 <b>{{ run.stats.selection }}</b></span><span>资料不足 <b>{{ run.stats.insufficient }}</b></span><span>来源不可用 <b>{{ run.stats.unavailable }}</b></span></div></section>
    <p v-if="notice" class="notice" role="status">{{ notice }}</p>
    <nav class="tabs"><button :class="{ active: tab === 'identity' }" @click="tab = 'identity'">1. 找对作品</button><button :class="{ active: tab === 'organize' }" @click="tab = 'organize'">2. 整理正确</button></nav>
    <section v-if="tab === 'identity'" class="panel"><div class="section-head"><div><h2>找对作品</h2><p>从整包名称、季集和官方候选交叉判断。任何冲突都不会自动进入整理。</p></div><span class="chip">已发现 {{ sources.length }} 个数据源</span></div><p v-if="!cards.length" class="empty">点击“开始检查”后，进度和每个来源包的结论会立即显示在这里。</p><article v-for="card in cards" :key="card.historyId" class="card" :class="card.state"><div><span class="state">{{ card.state === 'confirmed' ? '已确认' : card.state === 'needs_selection' ? '待你选择' : card.state === 'insufficient' ? '资料不足' : '来源不可用' }}</span><h3>{{ card.identity?.title || '还没有可靠作品身份' }}{{ card.identity?.year ? `（${card.identity.year}）` : '' }}</h3><p v-if="card.evidence">{{ evidenceText(card.evidence) }}。{{ card.evidence.truncated ? '目录较深，已按安全上限抽样。' : '已完成包级抽样。' }}</p><p v-else>{{ card.reason }}</p><p v-if="card.reason" class="reason">{{ card.reason }}</p></div><button class="secondary" @click="open(card)">{{ card.state === 'confirmed' ? '查看判断' : '处理候选' }}</button></article></section>
    <section v-else class="panel"><div class="section-head"><div><h2>整理正确</h2><p>只检查已确认作品：先查旧成功历史、当前规则和官方零写入预览，再决定能否安全重整。</p></div><span class="chip">仅官方重整可处理旧硬链接</span></div><p v-if="!confirmed.length" class="empty">先在“找对作品”里得到已确认身份。冲突候选和资料不足的包不会出现执行入口。</p><article v-for="card in confirmed" :key="card.historyId" class="card confirmed"><div><span class="state">身份已确认</span><h3>{{ card.identity.title }}{{ card.identity.year ? `（${card.identity.year}）` : '' }}</h3><p>{{ evidenceText(card.evidence) }}。尚未读取或删除任何旧硬链接。</p></div><button class="primary" @click="open(card, 'organize'); auditOrganization()">检查整理方案</button></article></section>
    <div v-if="selected" class="backdrop" @click.self="selected = null"><section class="modal"><button class="close" aria-label="关闭" @click="selected = null">×</button><template v-if="tab === 'identity'"><p class="eyebrow">找对作品</p><h2>{{ selected.identity?.title || '候选核验' }}</h2><p v-if="selected.evidence">包级摘要：{{ evidenceText(selected.evidence) }}。真实路径和完整文件名不会在这里展示或保存。</p><p>{{ selected.reason || '官方候选正在等待核验。' }}</p><div v-if="selected.candidates?.length" class="candidate-list"><article v-for="candidate in selected.candidates" :key="candidateKey(candidate)" class="candidate" :class="{ conflicted: candidate.conflicts?.length }"><div><strong>{{ candidate.title }}{{ candidate.year ? `（${candidate.year}）` : '' }}</strong><p>支持：{{ candidate.reasons?.join('；') || '仅搜索命中' }}</p><p v-if="candidate.conflicts?.length" class="reason">冲突：{{ candidate.conflicts.join('；') }}</p></div><button class="secondary" @click="choose(candidate)">确认是这部</button></article></div><p v-else class="empty">没有足够的官方候选。这不代表文件为空，只表示当前公开数据源还不能确认。</p><p v-if="selected.state === 'confirmed'" class="safe">身份已确认。下一步可进入“整理正确”，先做官方零写入审计。</p></template><template v-else><p class="eyebrow">整理正确</p><h2>{{ selected.identity?.title }}</h2><p>不展示真实路径；只说明是否有旧成功硬链接、当前规则是否给出目标，以及官方预览是否完整。</p><button class="primary" :disabled="loading" @click="auditOrganization">{{ loading ? '官方审计中…' : '重新生成官方预览' }}</button><section v-if="audit" class="audit"><div class="audit-grid"><span>命中旧成功记录 <b>{{ audit.history?.history_count || 0 }}</b></span><span>预览文件 <b>{{ audit.preview?.summary?.total || audit.preview?.items?.length || 0 }}</b></span><span>可创建 <b>{{ audit.preview?.summary?.success || 0 }}</b></span><span>预览失败 <b>{{ audit.preview?.summary?.failed || 0 }}</b></span></div><p>{{ audit.target?.target_path ? '当前目录规则给出了唯一目标。' : '当前目录规则没有给出唯一目标。' }}</p><p v-if="audit.issues.length" class="reason">已锁定执行：{{ audit.issues.join('；') }}</p><p v-else class="safe">预览完整：MoviePilot 负责清理命中的旧硬链接并创建新硬链接；来源文件不会被插件直接改动。</p><button class="primary" :disabled="loading || !audit.eligible" @click="confirmRepair = true">确认重整此包</button></section></template></section></div>
    <div v-if="confirmRepair" class="backdrop"><section class="modal confirm"><p class="eyebrow">最后确认</p><h2>确认由 MoviePilot 重整？</h2><p>将按照刚才的官方预览处理旧成功硬链接并创建新硬链接。插件不会自行删除、移动、改名或覆盖来源文件。</p><button class="secondary" :disabled="loading" @click="confirmRepair = false">返回预览</button><button class="danger" :disabled="loading" @click="repair">确认执行官方重整</button></section></div>
  </main>
</template>

<style scoped>
.governor-page{max-width:1180px;margin:auto;padding:36px;color:rgb(var(--v-theme-on-background,232,231,241))}.hero,.actions,.progress-head,.section-head,.card,.audit-grid{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.hero{padding-bottom:24px}.hero h1{margin:2px 0 8px;font-size:36px}.hero p,.section-head p,.modal p,.card p{margin:0;line-height:1.65;color:rgba(255,255,255,.75)}.actions{flex-wrap:wrap;justify-content:flex-end}.eyebrow{margin:0;color:rgb(var(--v-theme-primary,139,92,246));font-size:13px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.primary,.secondary,.danger,.tabs button{border:0;border-radius:10px;padding:11px 16px;font-weight:700;cursor:pointer}.primary{background:rgb(var(--v-theme-primary,139,92,246));color:#fff}.secondary{background:rgba(255,255,255,.1);color:inherit}.danger{background:rgba(239,68,68,.86);color:#fff}.progress,.notice,.panel,.modal{border:1px solid rgba(255,255,255,.14);border-radius:16px;background:rgba(var(--v-theme-surface,23,23,34),.94)}.progress{padding:18px 20px}.progress-head span,.progress p{color:rgba(255,255,255,.65)}.track{height:8px;margin:13px 0;border-radius:999px;background:rgba(255,255,255,.1);overflow:hidden}.track i{display:block;height:100%;border-radius:inherit;background:rgb(var(--v-theme-primary,139,92,246));transition:width .2s}.stats{display:flex;flex-wrap:wrap;gap:14px;margin-top:14px;font-size:14px;color:rgba(255,255,255,.72)}.notice{padding:14px 18px;margin:18px 0}.tabs{display:flex;gap:8px;margin:24px 0 14px}.tabs button{background:transparent;color:rgba(255,255,255,.7)}.tabs button.active{background:rgba(var(--v-theme-primary,139,92,246),.22);color:#fff}.panel{padding:24px}.section-head h2,.modal h2{margin:0 0 8px}.chip{padding:7px 10px;border-radius:999px;background:rgba(255,255,255,.08);font-size:13px;white-space:nowrap}.empty{padding:34px 0;margin:0;color:rgba(255,255,255,.65)}.card{padding:20px 0;border-top:1px solid rgba(255,255,255,.12)}.card:first-of-type{border-top:0}.state{color:rgb(var(--v-theme-primary,139,92,246));font-size:13px;font-weight:800}.needs_selection .state{color:#fbbf24}.insufficient .state,.unavailable .state{color:#fb7185}.card h3{margin:6px 0;font-size:22px}.reason{margin-top:8px!important;color:#fbbf24!important}.backdrop{position:fixed;inset:0;z-index:20;display:grid;place-items:center;padding:20px;background:rgba(0,0,0,.66)}.modal{position:relative;width:min(100%,760px);max-height:calc(100vh - 40px);overflow:auto;padding:30px}.close{position:absolute;right:16px;top:10px;border:0;background:none;color:inherit;font-size:30px;cursor:pointer}.candidate-list{margin-top:20px}.candidate{display:flex;justify-content:space-between;gap:16px;align-items:start;padding:16px 0;border-top:1px solid rgba(255,255,255,.12)}.candidate p{margin-top:6px}.conflicted strong{color:#fbbf24}.safe{margin-top:16px!important;color:#86efac!important}.audit{margin-top:22px;padding-top:18px;border-top:1px solid rgba(255,255,255,.12)}.audit-grid{flex-wrap:wrap}.audit-grid span{display:grid;gap:4px;min-width:120px;padding:12px;border-radius:10px;background:rgba(255,255,255,.06);color:rgba(255,255,255,.72);font-size:13px}.audit-grid b{font-size:21px;color:#fff}.audit .primary{margin-top:8px}.confirm{text-align:center}.confirm .secondary{margin-right:10px}@media(max-width:720px){.governor-page{padding:24px 16px}.hero,.card,.section-head,.candidate{flex-direction:column;align-items:stretch}.hero h1{font-size:30px}.actions{justify-content:flex-start}.chip{white-space:normal}.audit-grid span{min-width:calc(50% - 9px)}}
</style>
