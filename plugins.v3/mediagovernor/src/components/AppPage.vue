<script setup>
import { computed, onMounted, ref } from 'vue'
import { cleanTitle, createDownloadUnits, findingLabel, historyIndex, rootFingerprint, summarizeUnit, videoPattern } from '../lib/governance.js'
import { evaluateUnitAudit } from '../lib/audit-evaluator.js'

const props = defineProps({ api: { type: Object, default: () => ({}) } })
const state = ref({ ready: false, updated_at: '', download_units: 0, library_nodes: 0, findings: 0, dirty: 0 })
const phase = ref('尚未建立地图'), notice = ref(''), running = ref(false), stopped = ref(false), aiAvailable = ref(null)
const progress = ref({ done: 0, total: 0, current: '' }), findings = ref([]), units = ref([]), histories = ref([]), preview = ref(null), selected = ref(null)
const pageSize = 100, maxNodes = 30000, entryLimit = 1200
const dataOf = value => value?.data ?? value
const canUseApi = computed(() => typeof props.api?.get === 'function' && typeof props.api?.post === 'function')
const percent = computed(() => progress.value.total ? Math.min(100, Math.round(progress.value.done * 100 / progress.value.total)) : 0)
const elapsedLabel = computed(() => running.value ? '正在读取真实文件状态' : state.value.updated_at ? '已有媒体地图' : '首次建立地图会较久，之后只复核变动项')
const cards = computed(() => findings.value.filter(item => item.kind !== 'unconfirmed' && item.kind !== 'uncovered'))
const uncoveredCount = computed(() => findings.value.filter(item => item.kind === 'uncovered').length)
const safe = value => String(value || '').replace(/[\\/]/g, '').replace(/\s+/g, ' ').trim().slice(0, 160)
function previewForDisplay(value) {
  if (Array.isArray(value)) return value.map(previewForDisplay)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, /(path|src|dest|root)/i.test(key) ? '已隐藏' : previewForDisplay(item)]))
}
const pathKey = value => String(value || '').replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '').toLowerCase()
const relation = (left, right) => { const a = pathKey(left), b = pathKey(right); return a && b && (a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`)) }
const keyOf = item => `${item?.storage || 'local'}:${item?.path || item?.name || ''}`
function fail(error, fallback) { notice.value = error?.message || fallback }
function resetRun(label) { running.value = true; stopped.value = false; notice.value = ''; phase.value = label; progress.value = { done: 0, total: 0, current: '' }; findings.value = []; units.value = []; histories.value = [] }
function stop() { stopped.value = true; notice.value = '已停止；已完成部分会保留到本轮结束前。' }
async function get(path) { const value = dataOf(await props.api.get(path, { feedback: 'silent' })); if (value?.success === false) throw new Error(value.message); return value?.data ?? value }
async function post(path, body) { const value = dataOf(await props.api.post(path, body, { feedback: 'silent' })); if (value?.success === false) throw new Error(value.message); return value?.data ?? value }
async function status() { if (!canUseApi.value) return; try { state.value = { ...state.value, ...await get('plugin/MediaGovernor/map_status') } } catch (error) { fail(error, '无法读取地图状态') } }
function listOf(raw) { return Array.isArray(raw) ? raw : raw?.items || raw?.list || raw?.data || [] }
async function directories(kind) { return listOf(await get(`storage/directories?directory_type=${kind}`)) }
async function list(item) { const value = await post('storage/list', item); if (!Array.isArray(value)) throw new Error('MoviePilot 没有返回目录列表'); return value }
async function history(status) { const rows = []; for (let page = 1; !stopped.value; page += 1) { const data = await get(`history/transfer?status=${status}&page=${page}&count=${pageSize}`); const batch = listOf(data); rows.push(...batch); if (batch.length < pageSize) break } return rows }
async function walk(root, recursive = true) {
  const entries = []; const queue = root?.type === 'dir' ? [{ item: root, depth: 0 }] : []
  if (root?.type !== 'dir') entries.push({ ...root, depth: 0 })
  while (queue.length && !stopped.value) {
    const current = queue.shift(); const children = await list(current.item)
    for (const child of children) {
      if (entries.length >= entryLimit) return { entries, complete: false }
      const item = { ...child, depth: current.depth + 1 }; entries.push(item)
      if (recursive && child?.type === 'dir') queue.push({ item: child, depth: current.depth + 1 })
    }
  }
  return { entries, complete: !stopped.value }
}
function sourceRowsFor(unit, index) {
  const root = unit.root?.path || ''; const matched = []
  for (const [path, rows] of index) if (relation(path, root)) matched.push(...rows)
  return matched
}
function targetPaths(rows) { return rows.map(row => row?.dest_fileitem?.path || row?.dest).filter(Boolean) }
async function scanLibrary(roots) {
  const nodes = []; const paths = new Set(); const queue = roots.map(root => ({ item: root, depth: 0 })); let readFailures = 0
  while (queue.length && nodes.length < maxNodes && !stopped.value) {
    const current = queue.shift(); let children
    try { children = await list(current.item) } catch { readFailures += 1; continue }
    for (const child of children) {
      nodes.push({ id: keyOf(child), root: child, fingerprint: `${safe(child.name)}|${child.size || 0}|${child.modify_time || ''}`, video_count: videoPattern.test(child?.name || '') ? 1 : 0, category: safe(current.item?.name) })
      if (child?.path) paths.add(pathKey(child.path))
      if (child?.type === 'dir') queue.push({ item: child, depth: current.depth + 1 })
    }
    phase.value = `读取媒体库：${nodes.length} 项`; progress.value.current = '只读取当前文件清单，不会改动媒体'
  }
  return { nodes, paths, complete: !queue.length && !stopped.value && !readFailures, readFailures }
}
function parentOf(path, storage = 'local') { const value = String(path || ''); const cut = Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\')); return cut > 0 ? { type: 'dir', path: value.slice(0, cut), storage } : null }
async function currentTargetPaths(rows) {
  const expected = targetPaths(rows); const parents = new Map()
  for (const row of rows) { const target = row?.dest_fileitem?.path || row?.dest; const parent = parentOf(target, row?.dest_fileitem?.storage || row?.dest_storage); if (parent) parents.set(keyOf(parent), parent) }
  const present = new Set()
  for (const parent of parents.values()) { try { for (const child of await list(parent)) if (child?.path) present.add(pathKey(child.path)) } catch { /* 不把暂不可读目录误判为已删除。 */ } }
  return { expected, present }
}
function modelEvidence(unit, summary) { return { title_hints: summary.names, entries: unit.entries.slice(0, 500).map(item => ({ name: safe(item.name), type: item.type, depth: item.depth })), video_count: summary.video_count, episodes: summary.episodes } }
async function askAi(candidates) {
  if (!candidates.length || aiAvailable.value === false) return new Map()
  phase.value = `让智能助手复核 ${candidates.length} 个无法靠规则确认的单元`
  try {
    const rows = candidates.slice(0, 12).map(item => ({ id: item.id, evidence: modelEvidence(item, item.summary) })); const result = await post('plugin/MediaGovernor/bundle_analyze_batch', { items: rows })
    return new Map(Object.entries(result.diagnoses || {}))
  } catch (error) { aiAvailable.value = false; notice.value = `${error?.message || '智能助手不可用'}；本轮只保留规则能证明的问题。`; return new Map() }
}
async function buildMap(full = false) {
  if (!canUseApi.value) { notice.value = 'MoviePilot 页面 API 尚未注入，无法建立地图。'; return }
  resetRun(full ? '建立完整媒体地图' : '复核当前变动')
  try {
    const [downloadRoots, libraryRoots, failed, successful] = await Promise.all([directories('download'), directories('library'), history(false), history(true)])
    histories.value = [...failed, ...successful]; const index = historyIndex(histories.value)
    phase.value = '读取下载区顶层下载单元'; const top = []
    for (const root of downloadRoots) { if (stopped.value) break; top.push(...createDownloadUnits(root, await list(root))) }
    const initial = !state.value.ready || full
    const plan = initial ? { unchanged: [] } : await post('plugin/MediaGovernor/map_plan', { units: top.map(unit => ({ id: keyOf(unit.root), fingerprint: rootFingerprint([unit.root]) })) })
    const toScan = initial ? top : top.filter(unit => !new Set(plan.unchanged || []).has(keyOf(unit.root)))
    progress.value.total = toScan.length + (initial ? libraryRoots.length : 0); progress.value.current = initial ? `发现 ${top.length} 个当前下载单元；历史记录只用来关联，不当成问题数。` : `发现 ${top.length} 个下载单元，其中 ${toScan.length} 个发生变动，需要深度复核。`
    for (const unit of toScan) {
      if (stopped.value) break
      phase.value = `读取下载单元：${progress.value.done + 1}/${top.length}`; const tree = await walk(unit.root)
      unit.entries = tree.entries; unit.complete = tree.complete; unit.summary = summarizeUnit(unit); unit.history = sourceRowsFor(unit, index); unit.id = keyOf(unit.root)
      units.value.push(unit); progress.value.done += 1
    }
    phase.value = initial ? '读取媒体库当前结果' : '核对变动单元的当前整理目标'
    const library = initial ? await scanLibrary(libraryRoots) : { nodes: [], paths: new Set(), complete: true }
    progress.value.done = Math.min(progress.value.total, toScan.length + (initial ? libraryRoots.length : 0))
    const preliminary = []
    for (const unit of units.value) {
      if (!unit.summary.video_count) continue
      if (!unit.complete) {
        preliminary.push(...evaluateUnitAudit({ unit, history: unit.history, coverageComplete: false }).findings)
        continue
      }
      const targetState = initial ? { expected: targetPaths(unit.history), present: library.paths } : await currentTargetPaths(unit.history)
      const missingTargets = targetState.expected.filter(path => !targetState.present.has(pathKey(path)))
      const audit = evaluateUnitAudit({ unit, history: unit.history, library: library.nodes, targetPresent: !missingTargets.length, coverageComplete: unit.complete && library.complete })
      preliminary.push(...audit.findings)
    }
    // 只给“已有异常信号但作品身份不确定”的单元发送一次批量 AI 复核；不把整个库盲猜一遍。
    const candidates = units.value.filter(unit => preliminary.some(item => item.unit_id === unit.id) && unit.summary.video_count)
    const diagnoses = await askAi(candidates)
    const refined = []
    for (const item of preliminary) {
      const unit = units.value.find(value => value.id === item.unit_id); const diagnosis = diagnoses.get(unit?.id)
      refined.push(item)
      if (unit && diagnosis && !diagnosis.abstain) refined.push(...evaluateUnitAudit({ unit, history: unit.history, library: library.nodes, diagnosis }).findings)
    }
    findings.value = dedupe(refined); phase.value = stopped.value ? '已停止（未保存不完整地图）' : '保存当前媒体地图'
    if (!stopped.value) {
      const commit = await post('plugin/MediaGovernor/map_commit', { baseline: initial, partial: !initial, download_units: units.value.map(unit => ({ id: unit.id, root: unit.root, fingerprint: unit.summary.fingerprint, header_fingerprint: rootFingerprint([unit.root]), video_count: unit.summary.video_count, subtitle_count: unit.summary.subtitle_count, nfo_count: unit.summary.nfo_count, episodes: unit.summary.episodes, names: unit.summary.names, history: unit.history.map(row => row.id), status: 'checked' })), library_nodes: library.nodes, findings: findings.value, history_summary: histories.value.map(row => ({ id: row.id, status: row.status, mode: row.mode, media_source: row.media_source, media_id: row.media_id, target: row?.dest_fileitem?.path || row?.dest })) })
      state.value = { ...state.value, ...commit }; phase.value = '地图已更新'; notice.value = `已按当前文件状态核对：${units.value.length} 个下载单元，发现 ${cards.value.length} 个待处理问题；${uncoveredCount.value} 个项目尚未覆盖，不会被算作正常。`
    }
  } catch (error) { fail(error, '建立地图失败；没有改变任何媒体。'); phase.value = '建立地图未完成' }
  finally { running.value = false }
}
function dedupe(rows) { const map = new Map(); for (const row of rows) { const key = `${row.unit_id}:${row.kind}:${row.reason}`; if (!map.has(key)) map.set(key, row) } return [...map.values()] }
function titleFor(card) { const unit = units.value.find(item => item.id === card.unit_id); return cleanTitle(unit?.root?.name) || '未命名下载单元' }
async function recognize(card) {
  const unit = units.value.find(item => item.id === card.unit_id); if (!unit?.root?.path) return
  selected.value = { card, unit, candidate: null, error: '' }
  try { selected.value.candidate = await get(`media/recognize_file?path=${encodeURIComponent(unit.root.path)}`) } catch { selected.value.error = 'MoviePilot 当前无法给出原生候选；可在官方整理页补充准确作品名后再预览。' }
}
function previewPayload() {
  const row = selected.value?.unit?.history?.find(item => item?.id === selected.value?.card?.history_id) || selected.value?.unit?.history?.at(-1)
  const candidate = selected.value?.candidate?.media_info || selected.value?.candidate?.mediaInfo || selected.value?.candidate || {}
  return { logid: row?.id, media_source: candidate.media_source || candidate.source, media_id: candidate.media_id || candidate.id, type_name: candidate.type || candidate.mtype, src_fileitem: selected.value?.unit?.root, preview: true, reorganize: false }
}
async function makePreview() { try { preview.value = await post('transfer/manual', previewPayload()) } catch (error) { fail(error, '官方预览没有生成；没有删除或重建任何硬链接。') } }
async function repair() {
  if (!window.confirm('确认按 MoviePilot 官方预览重建这个下载单元吗？这会由官方清理旧整理结果并重新建立硬链接。')) return
  try { const payload = { ...previewPayload(), preview: false, reorganize: false }; await post('transfer/manual', payload); notice.value = '官方已接收重建任务。请重新复核此下载单元，确认预览与实际一致后问题才会关闭。'; preview.value = null; selected.value = null } catch (error) { fail(error, '官方没有执行重建；旧硬链接没有被本插件直接删除。') }
}
async function probeAi() { try { const result = await post('plugin/MediaGovernor/ai_probe', {}); aiAvailable.value = Boolean(result.available); notice.value = aiAvailable.value ? '智能助手可用：只会复核规则无法确认的异常单元。' : '智能助手未返回可用状态。' } catch (error) { aiAvailable.value = false; fail(error, '智能助手不可用，仍可建立地图和检查规则问题。') } }
onMounted(status)
</script>

<template>
  <main class="governor-page">
    <section class="hero"><div><p class="eyebrow">MediaGovernor 3.0</p><h1>先建立真实地图，再处理真实问题</h1><p>从当前下载区和媒体库读取状态；失败历史只作线索，绝不再当成问题数量。</p></div><div class="actions"><button class="secondary" :disabled="running" @click="probeAi">测试智能助手</button><button class="primary" :disabled="running" @click="buildMap(!state.ready)">{{ state.ready ? '复核当前变动' : '建立完整地图' }}</button></div></section>
    <section class="summary"><span><b>{{ state.download_units }}</b>下载单元</span><span><b>{{ state.library_nodes }}</b>媒体库项目</span><span><b>{{ state.findings }}</b>上次结论</span><span><b>{{ state.dirty }}</b>待复核变动</span></section>
    <section v-if="running || progress.total" class="progress"><div><b>{{ phase }}</b><button v-if="running" class="link" @click="stop">停止</button></div><p>{{ progress.current }}</p><i><em :style="{ width: `${percent}%` }"></em></i><small>{{ progress.done }}/{{ progress.total }} · {{ elapsedLabel }}</small></section>
    <p v-if="notice" class="notice">{{ notice }}</p>
    <section class="panel"><header><div><h2>需要处理的问题</h2><p>只有当前文件状态能证明有异常的单元才在这里出现。无法确认的不会假装成问题。</p></div><button class="secondary" :disabled="running" @click="buildMap(true)">完整复核</button></header>
      <p v-if="!cards.length" class="empty">{{ running ? '正在核对，还没有形成结论。' : uncoveredCount ? `目前没有已证明的问题；另有 ${uncoveredCount} 个项目尚未覆盖，不能算作正常。` : '当前没有已证明的问题。首次使用请先建立完整地图。' }}</p>
      <p v-else-if="uncoveredCount" class="warning">另有 {{ uncoveredCount }} 个项目尚未覆盖；它们没有被计入“没有问题”。</p>
      <article v-for="card in cards" :key="`${card.unit_id}-${card.kind}-${card.reason}`" class="card"><div><span class="kind">{{ findingLabel(card.kind) }}</span><h3>{{ titleFor(card) }}</h3><p>{{ card.reason }}</p><small>这是当前状态核对结果，不是历史失败数量。</small></div><button class="primary" @click="recognize(card)">查看并预览修复</button></article>
    </section>
    <div v-if="selected" class="backdrop"><section class="modal"><button class="close" @click="selected = null; preview = null">×</button><p class="eyebrow">先确认，再预览</p><h2>{{ titleFor(selected.card) }}</h2><p>{{ selected.card.reason }}</p><div v-if="selected.candidate" class="candidate"><b>{{ selected.candidate?.media_info?.title || selected.candidate?.title || '原生候选' }}</b><span>{{ selected.candidate?.media_info?.year || selected.candidate?.year || '' }}</span></div><p v-if="selected.error" class="warning">{{ selected.error }}</p><button class="primary" @click="makePreview">生成 MoviePilot 官方逐文件预览</button><div v-if="preview" class="preview"><h3>官方预览已生成</h3><p>请核对官方列出的源文件与目标位置。确认无误后才会交给 MoviePilot 清理旧整理结果并重建硬链接。</p><details><summary>查看官方预览数据</summary><pre>{{ JSON.stringify(previewForDisplay(preview), null, 2) }}</pre></details><button class="danger" @click="repair">确认按此预览重建</button></div></section></div>
  </main>
</template>

<style scoped>
.governor-page{max-width:1180px;margin:auto;padding:34px;color:rgb(var(--v-theme-on-surface,245,245,245))}.hero,header,.card,.actions,.summary{display:flex;gap:18px;align-items:center;justify-content:space-between}.hero{padding:30px;border-radius:20px;background:linear-gradient(125deg,rgba(var(--v-theme-primary,112,77,255),.25),rgba(20,20,35,.35))}.hero h1{font-size:32px;margin:5px 0}.hero p,header p,.card p,small{color:rgba(255,255,255,.7);line-height:1.6}.eyebrow,.kind{color:rgb(var(--v-theme-primary,160,120,255));font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.actions{flex-wrap:wrap}.primary,.secondary,.danger,.link{border:0;border-radius:10px;padding:10px 15px;font-weight:700;cursor:pointer}.primary{background:rgb(var(--v-theme-primary,139,92,246));color:#fff}.secondary{background:rgba(255,255,255,.1);color:inherit}.danger{background:#dc2626;color:#fff;margin-top:14px}.link{background:transparent;color:#fbbf24;padding:0}.summary{margin:18px 0;justify-content:flex-start;flex-wrap:wrap}.summary span{min-width:125px;padding:13px;border:1px solid rgba(255,255,255,.12);border-radius:12px;color:rgba(255,255,255,.7)}.summary b{display:block;color:#fff;font-size:22px}.progress,.panel,.notice,.modal{border:1px solid rgba(255,255,255,.14);border-radius:16px;background:rgba(var(--v-theme-surface,23,23,34),.94);padding:20px}.progress div{display:flex;justify-content:space-between}.progress i{display:block;height:8px;background:rgba(255,255,255,.12);border-radius:99px;overflow:hidden;margin:12px 0}.progress em{display:block;height:100%;background:rgb(var(--v-theme-primary,139,92,246))}.notice{margin-bottom:18px;color:#fef3c7}.panel header{align-items:flex-start}.empty{padding:30px 0;color:rgba(255,255,255,.65)}.card{padding:20px 0;border-top:1px solid rgba(255,255,255,.12)}.card h3{margin:7px 0}.card:first-of-type{border-top:0}.backdrop{position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:10;display:grid;place-items:center;padding:20px}.modal{position:relative;width:min(780px,100%);max-height:calc(100vh - 40px);overflow:auto}.close{position:absolute;right:15px;top:8px;border:0;background:transparent;color:inherit;font-size:28px}.candidate,.preview{margin-top:18px;padding:15px;border-radius:12px;background:rgba(255,255,255,.06)}.warning{color:#fbbf24}.preview pre{max-height:240px;overflow:auto;white-space:pre-wrap;font-size:12px}@media(max-width:720px){.governor-page{padding:18px}.hero,header,.card{align-items:stretch;flex-direction:column}.hero h1{font-size:25px}}
</style>
