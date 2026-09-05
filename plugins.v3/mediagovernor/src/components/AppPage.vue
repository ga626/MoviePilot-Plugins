<script setup>
import { computed, onMounted, ref } from 'vue'
import { cleanTitle, configuredDownloadRoots, configuredLibraryRoots, createDownloadUnits, destinationPath, findingLabel, historyRowsForUnit, latestHistory, latestHistoryRows, libraryRootForPath, libraryRootSnapshot, pathKey, rootFingerprint, sourcePath, strictEpisodeHints, summarizeUnit, videoPattern } from '../lib/governance.js'
import { evaluateUnitAudit } from '../lib/audit-evaluator.js'
import { aiFallbackTargets, identityTargets } from '../lib/diagnostic-plan.js'
import { normaliseHistoryRows, shortTitle, unwrapMoviePilotResponse } from '../lib/moviepilot-response.js'
import { appendTreeEvidence, createEvidencePackages, packageEvidence, repairAdmission } from '../lib/evidence-pipeline.js'
import { manualPreviewRequest, manualRebuildRequests } from '../lib/manual-transfer.js'

const props = defineProps({ api: { type: Object, default: () => ({}) } })
const state = ref({ ready: false, updated_at: '', download_units: 0, library_nodes: 0, findings: 0, dirty: 0 })
const phase = ref('尚未建立地图'), notice = ref(''), running = ref(false), stopped = ref(false), aiAvailable = ref(null)
const progress = ref({ done: 0, total: 0, current: '' }), findings = ref([]), units = ref([]), histories = ref([]), preview = ref(null), selected = ref(null)
const pageSize = 100, entryLimit = 1200
const canUseApi = computed(() => typeof props.api?.get === 'function' && typeof props.api?.post === 'function')
const percent = computed(() => progress.value.total ? Math.min(100, Math.round(progress.value.done * 100 / progress.value.total)) : 0)
const elapsedLabel = computed(() => running.value ? '正在读取真实文件状态' : state.value.updated_at ? '已有媒体地图' : '首次建立地图会较久，之后只复核变动项')
const cards = computed(() => findings.value)
const provenCount = computed(() => findings.value.filter(item => item.kind !== 'unconfirmed' && item.kind !== 'uncovered').length)
const uncoveredCount = computed(() => findings.value.filter(item => item.kind === 'uncovered').length)
const safe = value => String(value || '').replace(/[\\/]/g, '').replace(/\s+/g, ' ').trim().slice(0, 160)
function previewForDisplay(value) {
  if (Array.isArray(value)) return value.map(previewForDisplay)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, /(path|src|dest|root)/i.test(key) ? '已隐藏' : previewForDisplay(item)]))
}
const keyOf = item => `${item?.storage || 'local'}:${item?.path || item?.name || ''}`
function fail(error, fallback) { notice.value = error?.message || fallback }
function resetRun(label) { running.value = true; stopped.value = false; notice.value = ''; phase.value = label; progress.value = { done: 0, total: 0, current: '' }; findings.value = []; units.value = []; histories.value = [] }
function stop() { stopped.value = true; notice.value = '已停止；已完成部分会保留到本轮结束前。' }
async function get(path) { return unwrapMoviePilotResponse(await props.api.get(path, { feedback: 'silent' })) }
async function post(path, body) { return unwrapMoviePilotResponse(await props.api.post(path, body, { feedback: 'silent' })) }
async function status() {
  if (!canUseApi.value) return
  try {
    const snapshot = await get('plugin/MediaGovernor/map_snapshot')
    state.value = { ...state.value, ...(snapshot?.summary || snapshot || {}) }
    findings.value = Array.isArray(snapshot?.findings) ? snapshot.findings : []
    if (state.value.ready) notice.value = `已载入上次地图：${state.value.download_units} 个下载单元，${provenCount.value} 个已证明问题，${uncoveredCount.value} 个尚未覆盖。`
  } catch (error) { fail(error, '无法读取已保存的媒体地图') }
}
function listOf(raw) { return Array.isArray(raw) ? raw : raw?.items || raw?.list || raw?.data || [] }
async function directories(kind) { return listOf(await get(`storage/directories?directory_type=${kind}`)) }
async function list(item) { const value = await post('storage/list', item); if (!Array.isArray(value)) throw new Error('MoviePilot 没有返回目录列表'); return value }
async function history(status) { const rows = []; for (let page = 1; !stopped.value; page += 1) { const data = await get(`history/transfer?status=${status}&page=${page}&count=${pageSize}`); const batch = listOf(data); rows.push(...batch); if (batch.length < pageSize) break } return normaliseHistoryRows(rows, status) }
async function walk(root, recursive = true) {
  const entries = []; const queue = root?.type === 'dir' ? [{ item: root, depth: 0 }] : []; let readFailures = 0
  if (root?.type !== 'dir') entries.push({ ...root, depth: 0 })
  while (queue.length && !stopped.value) {
    const current = queue.shift(); let children
    try { children = await list(current.item) } catch { readFailures += 1; continue }
    for (const child of children) {
      if (entries.length >= entryLimit) return { entries, complete: false }
      const item = { ...child, depth: current.depth + 1 }; entries.push(item)
      if (recursive && child?.type === 'dir') queue.push({ item: child, depth: current.depth + 1 })
    }
  }
  return { entries, complete: !stopped.value && !readFailures }
}
function sourceRowsFor(unit, rows) { return historyRowsForUnit(unit, rows) }
function targetPaths(rows) { return latestHistoryRows(rows).filter(row => row?.status === true).map(destinationPath).filter(Boolean) }
function parentOf(path, storage = 'local') { const value = String(path || ''); const cut = Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\')); return cut > 0 ? { type: 'dir', path: value.slice(0, cut), storage } : null }
async function scanTargetParents(allUnits) {
  const parentItems = new Map(); const expectedByUnit = new Map()
  for (const unit of allUnits) {
    const expected = targetPaths(unit.history); const parentKeys = []
    for (const row of latestHistoryRows(unit.history).filter(row => row?.status === true)) {
      const target = destinationPath(row); const parent = parentOf(target, row?.dest_fileitem?.storage || row?.dest_storage)
      if (!parent) continue
      const key = keyOf(parent); parentItems.set(key, parent); parentKeys.push(key)
    }
    expectedByUnit.set(unit.id, { expected, parentKeys: [...new Set(parentKeys)] })
  }
  const readable = new Map(); let readFailures = 0
  const parents = [...parentItems.entries()]; progress.value.total += parents.length
  for (let index = 0; index < parents.length && !stopped.value; index += 1) {
    const [key, parent] = parents[index]
    try {
      const items = (await list(parent)).filter(item => item?.path)
      readable.set(key, new Map(items.map(item => [pathKey(item.path), item])))
    }
    catch { readable.set(key, null); readFailures += 1 }
    progress.value.done += 1; phase.value = `核对当前整理目标：${index + 1}/${parents.length}`; progress.value.current = '只读取整理历史实际指向的目标目录，不扫描整座媒体库。'
  }
  const states = new Map()
  for (const unit of allUnits) {
    const plan = expectedByUnit.get(unit.id) || { expected: [], parentKeys: [] }; const present = new Map(); let complete = true
    for (const key of plan.parentKeys) {
      const entries = readable.get(key)
      if (entries == null) { complete = false; continue }
      for (const [path, entry] of entries) present.set(path, entry)
    }
    states.set(unit.id, { expected: plan.expected, present, complete })
  }
  return { states, parentCount: parents.length, readFailures }
}
function modelEvidence(unit, summary) {
  const evidence = packageEvidence(unit)
  return { title_hints: evidence.title_hints, entries: evidence.entries.map(item => ({ ...item, name: safe(item.name) })), video_count: evidence.video_count, episodes: summary.episodes, boundary: evidence.boundary, ai_truncated: evidence.ai_truncated }
}
async function askAi(candidates) {
  if (!candidates.length || aiAvailable.value === false) return new Map()
  phase.value = `让智能助手复核 ${candidates.length} 个无法靠原生识别确认的单元`
  try {
    const diagnoses = new Map()
    for (let start = 0; start < candidates.length && !stopped.value; start += 12) {
      const rows = candidates.slice(start, start + 12).map(item => ({ id: item.id, evidence: modelEvidence(item, item.summary) }))
      const result = await post('plugin/MediaGovernor/bundle_analyze_batch', { items: rows })
      for (const [id, diagnosis] of Object.entries(result.diagnoses || {})) diagnoses.set(id, diagnosis)
    }
    return diagnoses
  } catch (error) { aiAvailable.value = false; notice.value = `${error?.message || '智能助手不可用'}；本轮只保留规则能证明的问题。`; return new Map() }
}
function diagnosisFromCandidate(raw) {
  const value = raw?.media_info || raw?.mediaInfo || raw?.media || raw || {}
  const title = shortTitle(value.title || value.name || value.media_name)
  const type = String(value.type || value.media_type || value.mtype || '').toLowerCase()
  const mediaType = /tv|series|电视剧|剧集|动漫|动画/.test(type) ? 'tv' : /movie|film|电影/.test(type) ? 'movie' : 'unknown'
  const season = Number(value.season || value.season_number || 0) || 0
  return { title, original_title: shortTitle(value.original_title || value.originalName), year: String(value.year || ''), media_type: mediaType, season, media_source: value.media_source || value.source || '', media_id: String(value.media_id || value.id || ''), confidence: title ? 0.8 : 0, abstain: !title }
}
async function identifyUnits() {
  const target = identityTargets(units.value)
  if (!target.length) return
  progress.value.total += target.length
  let cursor = 0
  const worker = async () => {
    while (!stopped.value) {
      const index = cursor; cursor += 1
      if (index >= target.length) return
      const unit = target[index]; const samples = unit.entries.filter(item => videoPattern.test(item?.name || '') && item?.path).slice(0, 3)
      try {
        const candidates = await Promise.all(samples.map(async sample => diagnosisFromCandidate(await get(`media/recognize_file?path=${encodeURIComponent(sample.path)}`))))
        const usable = candidates.filter(candidate => !candidate.abstain)
        const identities = [...new Set(usable.map(candidate => `${candidate.media_source}:${candidate.media_id || cleanTitle(candidate.title)}`))]
        unit.diagnosis = usable.length && identities.length === 1 ? usable[0] : { abstain: true, confidence: 0, title: '', media_type: 'unknown', conflict: usable.length > 1 }
      } catch { unit.diagnosis = { abstain: true, confidence: 0, title: '', media_type: 'unknown' } }
      progress.value.done += 1; phase.value = `核验作品身份：${index + 1}/${target.length}`; progress.value.current = '每个有整理关系的下载单元都先走 MoviePilot 原生识别；不再等规则先报错。'
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, target.length) }, worker))
}
function mediaKind(value) {
  const type = String(value || '').toLowerCase()
  return /tv|series|电视剧|剧集|动漫|动画|综艺|纪录片/.test(type) ? 'tv' : /movie|film|电影/.test(type) ? 'movie' : 'unknown'
}
function seasonInPath(value) {
  const match = String(value || '').replace(/\\/g, '/').match(/\/(?:s|season)[ ._-]?(\d{1,2})(?=\/|$)/i)
  return match ? Number(match[1]) : 0
}
function sameTitle(left, right) {
  const a = cleanTitle(left), b = cleanTitle(right)
  return !a || !b || a === b || a.includes(b) || b.includes(a)
}
async function targetEvidenceFor(unit, targetState, libraryRoots) {
  const latest = latestHistory(unit.history); const success = latestHistoryRows(unit.history).filter(row => row?.status === true)
  const presentRows = success.map(row => ({ row, target: destinationPath(row), item: targetState.present.get(pathKey(destinationPath(row))) })).filter(item => item.target)
  const evidence = { complete: targetState.complete, category_ok: true, season_ok: true, identity_ok: true, episode_ok: true }
  if (!presentRows.length || !unit.diagnosis || unit.diagnosis.abstain) return evidence
  for (const entry of presentRows) {
    if (!entry.item) continue
    const root = libraryRootForPath(entry.target, libraryRoots)
    if (root?.media_type && unit.diagnosis.media_type !== 'unknown' && mediaKind(root.media_type) !== 'unknown' && mediaKind(root.media_type) !== unit.diagnosis.media_type) evidence.category_ok = false
    const expectedSeason = Number(unit.diagnosis.season || latest?.season || 0)
    const actualSeason = seasonInPath(entry.target)
    if (expectedSeason && actualSeason && expectedSeason !== actualSeason) evidence.season_ok = false
    const sourceEpisodes = strictEpisodeHints(sourcePath(entry.row)); const targetEpisodes = strictEpisodeHints(entry.target)
    if (sourceEpisodes.length && targetEpisodes.length && sourceEpisodes.join(',') !== targetEpisodes.join(',')) evidence.episode_ok = false
  }
  const representative = presentRows.find(entry => entry.item)
  if (representative) {
    try {
      const targetDiagnosis = diagnosisFromCandidate(await get(`media/recognize_file?path=${encodeURIComponent(representative.target)}`))
      if (!targetDiagnosis.abstain && targetDiagnosis.confidence >= 0.5 && !sameTitle(unit.diagnosis.title || unit.diagnosis.original_title, targetDiagnosis.title || targetDiagnosis.original_title)) evidence.identity_ok = false
    } catch { evidence.complete = false }
  }
  return evidence
}
async function inspectTargetEvidence(allUnits, targetAudit, libraryRoots) {
  const result = new Map(); const candidates = allUnits.filter(unit => unit.complete && unit.history.length && unit.summary.video_count)
  progress.value.total += candidates.length; let cursor = 0
  const worker = async () => {
    while (!stopped.value) {
      const index = cursor; cursor += 1; if (index >= candidates.length) return
      const unit = candidates[index]; const targetState = targetAudit.states.get(unit.id) || { present: new Map(), complete: false }
      result.set(unit.id, await targetEvidenceFor(unit, targetState, libraryRoots))
      progress.value.done += 1; phase.value = `核验实际整理结果：${index + 1}/${candidates.length}`; progress.value.current = '把原文件身份、实际目标文件、媒体库分类和集号逐项对照。'
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, candidates.length) }, worker))
  return result
}
async function scanDownloadUnits(toScan, total) {
  const results = new Array(toScan.length); let cursor = 0
  const worker = async () => {
    while (!stopped.value) {
      const index = cursor; cursor += 1
      if (index >= toScan.length) return
      const unit = toScan[index]
      try {
        const trees = await Promise.all((unit.roots || [unit.root]).map(root => walk(root)))
        Object.assign(unit, appendTreeEvidence(unit, trees)); unit.summary = summarizeUnit(unit)
      } catch { unit.entries = []; unit.complete = false; unit.summary = summarizeUnit(unit) }
      results[index] = unit; progress.value.done += 1; phase.value = `读取下载单元：${progress.value.done}/${total}`; progress.value.current = '最多同时读取 4 个下载单元；读不到的目录会保留为尚未覆盖。'
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, toScan.length) }, worker))
  units.value = results.filter(Boolean)
}
async function buildMap(full = false) {
  if (!canUseApi.value) { notice.value = 'MoviePilot 页面 API 尚未注入，无法建立地图。'; return }
  resetRun(full ? '建立完整媒体地图' : '复核当前变动')
  try {
    const [downloadConfigurations, libraryConfigurations, failed, successful] = await Promise.all([directories('download'), directories('library'), history(false), history(true)])
    histories.value = [...failed, ...successful]
    const scope = configuredDownloadRoots(downloadConfigurations)
    if (!scope.roots.length) throw new Error('没有可用下载目录：拒绝扫描空路径或容器根目录')
    phase.value = '验证下载目录并读取顶层下载项目'; const discovered = []
    for (const root of scope.roots) { if (stopped.value) break; discovered.push(...createDownloadUnits(root, await list(root))) }
    const top = [...new Map(discovered.map(unit => [keyOf(unit.root), unit])).values()]
    const packages = createEvidencePackages(top.map(unit => unit.root), histories.value)
    const libraryRoots = configuredLibraryRoots(libraryConfigurations)
    const initial = !state.value.ready || full
    const plan = initial ? { unchanged: [] } : await post('plugin/MediaGovernor/map_plan', { units: packages.map(unit => ({ id: unit.id, fingerprint: rootFingerprint(unit.roots) })) })
    const toScan = initial ? packages : packages.filter(unit => !new Set(plan.unchanged || []).has(unit.id))
    progress.value.total = toScan.length; progress.value.current = initial ? `发现 ${top.length} 个顶层项目，归为 ${packages.length} 个下载包；历史只用来关联，不当成问题数。` : `发现 ${packages.length} 个下载包，其中 ${toScan.length} 个发生变动，需要深度复核。`
    await scanDownloadUnits(toScan, packages.length)
    const libraryNodes = libraryRootSnapshot(libraryRoots)
    const targetAudit = await scanTargetParents(units.value)
    await identifyUnits()
    // AI 只补原生识别弃权的有历史单元；假成功不会因为“还没报错”而绕过原生身份核验。
    const candidates = aiFallbackTargets(units.value)
    const diagnoses = await askAi(candidates)
    for (const unit of units.value) if (diagnoses.has(unit.id)) unit.diagnosis = diagnoses.get(unit.id)
    const targetEvidence = await inspectTargetEvidence(units.value, targetAudit, libraryRoots)
    const refined = []
    if (scope.rejected.length) refined.push({ unit_id: 'scope:invalid', title: `${scope.rejected.length} 个下载目录配置`, kind: 'uncovered', reason: '下载目录为空或指向容器根目录，已拒绝扫描；请在 MoviePilot 目录设置中修正', strength: 'review' })
    for (const unit of units.value) {
      if (!unit.complete) { refined.push({ unit_id: unit.id, title: cleanTitle(unit.root?.name) || '未命名下载单元', kind: 'uncovered', reason: '当前下载单元未完整读取，暂不能下结论', strength: 'review' }); continue }
      if (!unit.summary.video_count) continue
      if (unit.boundary !== 'download_hash') refined.push({ unit_id: unit.id, title: cleanTitle(unit.root?.name) || '未命名下载单元', kind: 'unconfirmed', reason: unit.boundary_reason || '下载包边界没有得到下载任务编号确认，不能自动重建', strength: 'review' })
      const diagnosis = unit.diagnosis
      const targetState = targetAudit.states.get(unit.id) || { expected: targetPaths(unit.history), present: new Map(), complete: true }
      const coverageComplete = unit.complete && targetState.complete
      const missingTargets = coverageComplete ? targetState.expected.filter(path => !targetState.present.has(pathKey(path))) : []
      refined.push(...evaluateUnitAudit({ unit, history: unit.history, library: libraryNodes, diagnosis, latest: latestHistory(unit.history), targetEvidence: targetEvidence.get(unit.id), targetPresent: !missingTargets.length, coverageComplete, identityRequired: Boolean(unit.history.length) }).findings)
    }
    const linkedHistoryIds = new Set(units.value.flatMap(unit => unit.history.map(row => String(row?.id || ''))))
    const unlinkedUnits = units.value.filter(unit => unit.summary.video_count && !unit.history.length)
    if (unlinkedUnits.length) refined.push({ unit_id: 'coverage:unlinked', title: `${unlinkedUnits.length} 个下载单元`, kind: 'uncovered', reason: '当前下载单元没有可关联的整理历史，不能把它们算作已正确整理', strength: 'review' })
    for (const row of failed.filter(item => !linkedHistoryIds.has(String(item?.id || '')))) {
      refined.push({ unit_id: `history:${row?.id || shortTitle(row?.title)}`, history_id: row?.id || null, title: shortTitle(row?.title) || '未命名失败历史', kind: 'unconfirmed', reason: '原生失败历史没有关联到当前下载单元；不能判断它是否已恢复', strength: 'review' })
    }
    findings.value = dedupe(refined); phase.value = stopped.value ? '已停止（未保存不完整地图）' : '保存当前媒体地图'
    if (!stopped.value) {
      const linkedUnits = units.value.filter(unit => unit.history.length).length
      const unmatchedFailed = failed.filter(item => !linkedHistoryIds.has(String(item?.id || ''))).length
      const commit = await post('plugin/MediaGovernor/map_commit', { baseline: initial, partial: !initial, scope_verified: true, download_units: units.value.map(unit => ({ id: unit.id, root: unit.root, label: cleanTitle(unit.root?.name) || '未命名下载单元', fingerprint: unit.summary.fingerprint, header_fingerprint: rootFingerprint(unit.roots), video_count: unit.summary.video_count, subtitle_count: unit.summary.subtitle_count, nfo_count: unit.summary.nfo_count, episodes: unit.summary.episodes, names: unit.summary.names, history: unit.history.map(row => row.id), boundary: unit.boundary, coverage: unit.complete ? 'complete' : 'uncovered' })), library_nodes: libraryNodes, findings: findings.value, coverage: { configured_download_roots: scope.roots.length, rejected_download_roots: scope.rejected.length, download_units: packages.length, scanned_units: units.value.length, library_roots: libraryNodes.length, target_parent_dirs: targetAudit.parentCount, target_parent_read_failures: targetAudit.readFailures, failed_history: failed.length, successful_history: successful.length, linked_units: linkedUnits, unlinked_units: units.value.length - linkedUnits, unmatched_failed_history: unmatchedFailed, uncovered_units: uncoveredCount.value }, history_summary: histories.value.map(row => ({ id: row.id, status: row.status, mode: row.mode, media_source: row.media_source, media_id: row.media_id, target: destinationPath(row), download_hash: row.download_hash })) })
      state.value = { ...state.value, ...commit }
      const snapshot = await get('plugin/MediaGovernor/map_snapshot')
      findings.value = Array.isArray(snapshot?.findings) ? snapshot.findings : findings.value
      state.value = { ...state.value, ...(snapshot?.summary || snapshot || {}) }
      phase.value = '地图已更新'; notice.value = `已读到失败历史 ${failed.length} 条、成功历史 ${successful.length} 条；本轮复核 ${units.value.length} 个下载单元。核对了 ${targetAudit.parentCount} 个当前整理目标目录（${targetAudit.readFailures} 个暂不可读）。已证明 ${provenCount.value} 个问题，另有 ${findings.value.filter(item => item.kind === 'unconfirmed').length} 个无法确认、${uncoveredCount.value} 个尚未覆盖。`
    }
  } catch (error) { fail(error, '建立地图失败；没有改变任何媒体。'); phase.value = '建立地图未完成' }
  finally { running.value = false }
}
function dedupe(rows) { const map = new Map(); for (const row of rows) { const key = `${row.unit_id}:${row.kind}:${row.reason}`; if (!map.has(key)) map.set(key, row) } return [...map.values()] }
function titleFor(card) { const unit = units.value.find(item => item.id === card.unit_id); return card?.title || cleanTitle(unit?.root?.name) || '未命名下载单元' }
async function recognize(card) {
  const unit = units.value.find(item => item.id === card.unit_id)
  if (!unit?.root?.path) { notice.value = '这是上次保存的结论。请先重新读取当前状态，再生成预览。'; return }
  selected.value = { card, unit, candidate: unit.diagnosis || null, error: '', preview_payload: null, admission: null }
  if (!selected.value.candidate || selected.value.candidate.abstain) selected.value.error = '当前证据没有得到唯一作品身份；不能生成或执行官方预览。'
}
function previewPayload() {
  return manualPreviewRequest(selected.value?.unit, selected.value?.candidate)
}
async function makePreview() {
  try {
    const base = previewPayload()
    if (!base.fileitems.length || !base.media_source || !base.media_id) throw new Error('缺少经 MoviePilot 确认的作品身份或视频文件')
    const target = await post('transfer/manual/target-path', base)
    if (!target?.target_path || !target?.target_storage) throw new Error('MoviePilot 没有为这批文件给出唯一媒体库目标')
    const payload = { ...base, ...target, preview: true, reorganize: false }
    preview.value = await post('transfer/manual', payload)
    selected.value.preview_payload = payload
    selected.value.admission = repairAdmission(selected.value.unit, selected.value.candidate, preview.value)
  } catch (error) { fail(error, '官方预览没有生成；没有删除或重建任何硬链接。') }
}
async function repair() {
  const admission = selected.value?.admission
  if (!admission?.allowed) { notice.value = admission?.reason || '当前预览不满足安全重建条件。'; return }
  if (!window.confirm(`确认按本次官方预览重建吗？${admission.reason}。原始下载不会被删除。`)) return
  try {
    if (admission.mode === 'create') await post('transfer/manual', { ...selected.value.preview_payload, preview: false, reorganize: false })
    else for (const payload of manualRebuildRequests(admission.history_ids, selected.value.candidate)) await post('transfer/manual', payload)
    notice.value = 'MoviePilot 已接收逐项重建。现在会重新读取当前状态；只有实际结果等于预览，问题才会关闭。'
    preview.value = null; selected.value = null; await buildMap(true)
  } catch (error) { fail(error, '官方没有完成全部重建；插件没有直接删除原始下载。请重新读取当前状态。') }
}
async function probeAi() { try { const result = await post('plugin/MediaGovernor/ai_probe', {}); aiAvailable.value = Boolean(result.available); notice.value = aiAvailable.value ? '智能助手可用：只会复核规则无法确认的异常单元。' : '智能助手未返回可用状态。' } catch (error) { aiAvailable.value = false; fail(error, '智能助手不可用，仍可建立地图和检查规则问题。') } }
onMounted(status)
</script>

<template>
  <main class="governor-page">
    <section class="hero"><div><p class="eyebrow">MediaGovernor 4.0.0</p><h1>先建立证据，再找真实问题</h1><p>每次读取当前目录配置；下载任务编号优先分包，边界不确定就锁定自动重建。历史只作关联，不是问题数量。</p></div><div class="actions"><button class="secondary" :disabled="running" @click="probeAi">测试智能助手</button><button class="primary" :disabled="running" @click="buildMap(true)">{{ state.ready ? '重新读取当前状态' : '建立完整地图' }}</button></div></section>
    <section class="summary"><span><b>{{ state.download_units }}</b>下载单元</span><span><b>{{ state.library_nodes }}</b>媒体库根</span><span><b>{{ state.findings }}</b>上次结论</span><span><b>{{ state.dirty }}</b>待复核变动</span></section>
    <section v-if="running || progress.total" class="progress"><div><b>{{ phase }}</b><button v-if="running" class="link" @click="stop">停止</button></div><p>{{ progress.current }}</p><i><em :style="{ width: `${percent}%` }"></em></i><small>{{ progress.done }}/{{ progress.total }} · {{ elapsedLabel }}</small></section>
    <p v-if="notice" class="notice">{{ notice }}</p>
    <section class="panel"><header><div><h2>本轮结论</h2><p>已证明的问题、无法确认和未覆盖都会留下来；只有完整覆盖且没有任一结论时，才会显示零问题。</p></div><button class="secondary" :disabled="running" @click="buildMap(true)">完整复核</button></header>
      <p v-if="!cards.length" class="empty">{{ running ? '正在核对，还没有形成结论。' : state.ready ? '本轮地图完整且没有异常结论。' : '首次使用请先建立完整地图。' }}</p>
      <article v-for="card in cards" :key="`${card.unit_id}-${card.kind}-${card.reason}`" class="card"><div><span class="kind">{{ findingLabel(card.kind) }}</span><h3>{{ titleFor(card) }}</h3><p>{{ card.reason }}</p><small>{{ card.kind === 'unconfirmed' || card.kind === 'uncovered' ? '它没有被算作正常，也不会自动修复。' : '这是当前状态核对结果，不是历史失败数量。' }}</small></div><button class="primary" @click="recognize(card)">{{ card.kind === 'unconfirmed' || card.kind === 'uncovered' ? '复核后查看预览' : '查看并预览修复' }}</button></article>
    </section>
    <div v-if="selected" class="backdrop"><section class="modal"><button class="close" @click="selected = null; preview = null">×</button><p class="eyebrow">先确认，再预览</p><h2>{{ titleFor(selected.card) }}</h2><p>{{ selected.card.reason }}</p><div class="candidate"><b>下载包边界：{{ selected.unit.boundary_reason }}</b><span>文件证据：{{ selected.unit.complete ? '完整读取' : '未完整读取' }} · {{ selected.unit.summary?.video_count || 0 }} 个视频文件</span></div><div v-if="selected.candidate && !selected.candidate.abstain" class="candidate"><b>{{ selected.candidate.title || selected.candidate.original_title }}</b><span>{{ selected.candidate.year }} · {{ selected.candidate.media_type }} · MoviePilot 身份 {{ selected.candidate.media_source }} / {{ selected.candidate.media_id }}</span></div><p v-if="selected.error" class="warning">{{ selected.error }}</p><button class="primary" :disabled="Boolean(selected.error)" @click="makePreview">生成 MoviePilot 官方逐文件预览</button><div v-if="preview" class="preview"><h3>官方预览已生成</h3><p>请核对官方列出的源文件与目标位置。确认无误后才会交给 MoviePilot 清理旧整理结果并重建硬链接。</p><details><summary>查看官方预览数据</summary><pre>{{ JSON.stringify(previewForDisplay(preview), null, 2) }}</pre></details><p class="warning">{{ selected.admission?.reason }}</p><button class="danger" :disabled="!selected.admission?.allowed" @click="repair">确认按此预览重建</button></div></section></div>
  </main>
</template>

<style scoped>
.governor-page{max-width:1180px;margin:auto;padding:34px;color:rgb(var(--v-theme-on-surface,245,245,245))}.hero,header,.card,.actions,.summary{display:flex;gap:18px;align-items:center;justify-content:space-between}.hero{padding:30px;border-radius:20px;background:linear-gradient(125deg,rgba(var(--v-theme-primary,112,77,255),.25),rgba(20,20,35,.35))}.hero h1{font-size:32px;margin:5px 0}.hero p,header p,.card p,small{color:rgba(255,255,255,.7);line-height:1.6}.eyebrow,.kind{color:rgb(var(--v-theme-primary,160,120,255));font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.actions{flex-wrap:wrap}.primary,.secondary,.danger,.link{border:0;border-radius:10px;padding:10px 15px;font-weight:700;cursor:pointer}.primary{background:rgb(var(--v-theme-primary,139,92,246));color:#fff}.secondary{background:rgba(255,255,255,.1);color:inherit}.danger{background:#dc2626;color:#fff;margin-top:14px}.link{background:transparent;color:#fbbf24;padding:0}.summary{margin:18px 0;justify-content:flex-start;flex-wrap:wrap}.summary span{min-width:125px;padding:13px;border:1px solid rgba(255,255,255,.12);border-radius:12px;color:rgba(255,255,255,.7)}.summary b{display:block;color:#fff;font-size:22px}.progress,.panel,.notice,.modal{border:1px solid rgba(255,255,255,.14);border-radius:16px;background:rgba(var(--v-theme-surface,23,23,34),.94);padding:20px}.progress div{display:flex;justify-content:space-between}.progress i{display:block;height:8px;background:rgba(255,255,255,.12);border-radius:99px;overflow:hidden;margin:12px 0}.progress em{display:block;height:100%;background:rgb(var(--v-theme-primary,139,92,246))}.notice{margin-bottom:18px;color:#fef3c7}.panel header{align-items:flex-start}.empty{padding:30px 0;color:rgba(255,255,255,.65)}.card{padding:20px 0;border-top:1px solid rgba(255,255,255,.12)}.card h3{margin:7px 0}.card:first-of-type{border-top:0}.backdrop{position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:10;display:grid;place-items:center;padding:20px}.modal{position:relative;width:min(780px,100%);max-height:calc(100vh - 40px);overflow:auto}.close{position:absolute;right:15px;top:8px;border:0;background:transparent;color:inherit;font-size:28px}.candidate,.preview{margin-top:18px;padding:15px;border-radius:12px;background:rgba(255,255,255,.06)}.warning{color:#fbbf24}.preview pre{max-height:240px;overflow:auto;white-space:pre-wrap;font-size:12px}@media(max-width:720px){.governor-page{padding:18px}.hero,header,.card{align-items:stretch;flex-direction:column}.hero h1{font-size:25px}}
</style>
