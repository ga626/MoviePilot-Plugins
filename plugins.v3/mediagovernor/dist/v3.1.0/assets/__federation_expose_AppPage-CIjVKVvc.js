import { importShared } from './__federation_fn_import-JrT3xvdd.js';
import { _ as _export_sfc } from './_plugin-vue_export-helper-pcqpp-6-.js';

const text = value => String(value || '').trim();
const unique = values => [...new Set(values.filter(Boolean))];

const videoPattern = /\.(mkv|mp4|avi|m2ts|ts|mov|webm)$/i;
const subtitlePattern = /\.(ass|ssa|srt|sub|vtt)$/i;

function cleanTitle(value) {
  return text(value).replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[\[【(（].*?[\]】)）]/g, ' ')
    .replace(/\b(2160p|1080p|720p|web[ .-]?(dl|rip)|bluray|bdrip|remux|x26[45]|h\.?26[45]|hevc|aac|dts|atmos|hdr10?\+?|dv|10bit|proper|repack|complete|中字|简繁|国语|粤语)\b/gi, ' ')
    .replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
}

function strictEpisodeHints(value) {
  const name = text(value); const found = [];
  for (const match of name.matchAll(/\bS\d{1,2}E(\d{1,3})\b/ig)) found.push(Number(match[1]));
  for (const match of name.matchAll(/\b(?:EP|E)(\d{1,3})\b/ig)) found.push(Number(match[1]));
  for (const match of name.matchAll(/[\[【](\d{1,3})[\]】]/g)) found.push(Number(match[1]));
  return unique(found.filter(value => value > 0 && value < 1000)).sort((a, b) => a - b)
}

function fileFingerprint(item = {}) {
  return [text(item.name), text(item.type), Number(item.size) || 0, text(item.modify_time || item.mtime)].join('|')
}

function unitFingerprint(unit = {}) {
  return [text(unit.root?.path || unit.root), ...(unit.entries || []).map(fileFingerprint).sort()].join('\n')
}

function rootFingerprint(items = []) { return [...items].map(fileFingerprint).sort().join('\n') }

function pathKey(value) {
  return String(value || '').replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '').toLowerCase()
}

function isRootPath(value) {
  const path = pathKey(value);
  return !path || path === '/' || /^[a-z]:$/i.test(path)
}

function isWithinPath(value, root) {
  const path = pathKey(value); const base = pathKey(root);
  return Boolean(path && base && (path === base || path.startsWith(`${base}/`)))
}

/** 把“目录配置”显式转换为 FileItem；配置对象本身绝不能送进 storage/list。 */
function configuredDownloadRoots(configurations = []) {
  const roots = []; const rejected = []; const seen = new Set();
  for (const configuration of configurations) {
    const path = String(configuration?.download_path || '').trim();
    const storage = String(configuration?.storage || 'local').trim() || 'local';
    if (isRootPath(path)) { rejected.push({ name: text(configuration?.name) || '未命名目录配置', reason: '下载目录为空或指向容器根目录' }); continue }
    const key = `${storage}:${pathKey(path)}`;
    if (seen.has(key)) continue
    seen.add(key);
    roots.push({ type: 'dir', storage, path, name: text(configuration?.name) || path, configured: true, media_type: text(configuration?.media_type), media_category: text(configuration?.media_category) });
  }
  return { roots, rejected }
}

function configuredLibraryRoots(configurations = []) {
  const roots = []; const seen = new Set();
  for (const configuration of configurations) {
    const path = String(configuration?.library_path || '').trim();
    const storage = String(configuration?.library_storage || 'local').trim() || 'local';
    if (isRootPath(path)) continue
    const key = `${storage}:${pathKey(path)}`;
    if (seen.has(key)) continue
    seen.add(key);
    roots.push({ type: 'dir', storage, path, name: text(configuration?.name) || path, media_type: text(configuration?.media_type), media_category: text(configuration?.media_category) });
  }
  return roots
}

function libraryRootForPath(path, roots = []) {
  return [...roots].filter(root => isWithinPath(path, root?.path)).sort((left, right) => pathKey(right?.path).length - pathKey(left?.path).length)[0] || null
}

function sourcePath(row = {}) {
  const item = row.src_fileitem || row.source_fileitem || row.fileitem || {};
  return String(item.path || row.src || row.source || '')
}

function destinationPath(row = {}) {
  const item = row.dest_fileitem || {};
  return String(item.path || row.dest || '')
}

/** 仅允许“历史源文件位于下载单元内”的单向归属；父目录历史不能被猜测分配给多个包。 */
function historyRowsForUnit(unit, rows = []) {
  const root = unit?.root?.path || '';
  return rows.filter(row => isWithinPath(sourcePath(row), root)).sort(latestFirst)
}

function latestFirst(left, right) {
  const leftDate = Date.parse(left?.date || '') || 0; const rightDate = Date.parse(right?.date || '') || 0;
  if (leftDate !== rightDate) return rightDate - leftDate
  const sequence = value => Number(String(value || '').match(/(\d+)$/)?.[1] || 0);
  return sequence(right?.id) - sequence(left?.id)
}

function latestHistory(rows = []) { return [...rows].sort(latestFirst)[0] || null }

/** 同一源文件的旧整理记录只作审计依据，当前目标只认该源文件最近一次结果。 */
function latestHistoryRows(rows = []) {
  const bySource = new Map();
  for (const row of [...rows].sort(latestFirst)) {
    const source = pathKey(sourcePath(row)) || `history:${row?.id || bySource.size}`;
    if (!bySource.has(source)) bySource.set(source, row);
  }
  return [...bySource.values()].sort(latestFirst)
}

function createDownloadUnits(root, children = []) {
  // 顶层目录或顶层视频各是一个下载单元；不再用相似标题拼成虚构“包”。
  return children.filter(item => item?.type === 'dir' || videoPattern.test(item?.name || '')).map(item => ({
    id: `${root?.storage || 'local'}:${item?.path || item?.name}`, root: item, entries: [], status: 'pending',
  }))
}

/** 地图只持久化媒体库根摘要；具体存在性由整理历史指向的目标目录逐一核验。 */
function libraryRootSnapshot(roots = []) {
  return roots.filter(root => root && typeof root === 'object').map(root => ({
    id: `${root.storage || 'local'}:${root.path || root.name || ''}`,
    root,
    fingerprint: fileFingerprint(root),
    video_count: 0,
    episodes: [],
    category: cleanTitle(root.name) || '媒体库根',
  }))
}

function summarizeUnit(unit = {}) {
  const episodeFiles = new Map(); let video_count = 0; let subtitle_count = 0; let nfo_count = 0;
  for (const item of unit.entries || []) {
    const name = text(item.name);
    if (videoPattern.test(name)) { video_count += 1; for (const episode of strictEpisodeHints(name)) episodeFiles.set(episode, [...(episodeFiles.get(episode) || []), name]); }
    else if (subtitlePattern.test(name)) subtitle_count += 1;
    else if (/\.nfo$/i.test(name)) nfo_count += 1;
  }
  const episodes = [...episodeFiles.keys()].sort((a, b) => a - b);
  const duplicateEpisodes = [...episodeFiles].filter(([, files]) => new Set(files).size > 1).map(([episode]) => episode);
  return { video_count, subtitle_count, nfo_count, episodes, duplicateEpisodes, fingerprint: unitFingerprint(unit), names: unique([cleanTitle(unit.root?.name), ...(unit.entries || []).map(item => cleanTitle(item.name))].filter(Boolean)).slice(0, 50) }
}

const mediaKind = value => /tv|series|电视剧|剧集|动漫|动画|综艺|纪录片/i.test(text(value)) ? 'tv' : /movie|film|电影/i.test(text(value)) ? 'movie' : '';

function classifyFinding({ unit, summary, history = [], library = [], diagnosis = null }) {
  const finding = (kind, reason, strength = 'strong') => ({ kind, reason, strength, unit_id: unit.id, history_id: latestHistory(history)?.id || null });
  if (!summary.video_count) return []
  const successful = history.filter(row => row?.status === true);
  const failed = history.filter(row => row?.status === false);
  const targetMissing = successful.length && successful.every(row => !row?.dest_fileitem?.path && !row?.dest);
  if (failed.length && !successful.length) return [finding('native_failure', '原生整理失败后，当前下载单元仍在且没有成功整理记录')]
  if (targetMissing) return [finding('native_failure', '原生整理记录没有当前可核验的媒体库目标')]
  if (summary.duplicateEpisodes.length) return [finding('episode_error', `同一下载单元有重复集号：${summary.duplicateEpisodes.join('、')}`)]
  if (!diagnosis || diagnosis.abstain || diagnosis.confidence < .5) return []
  const record = successful[0] || {}; const recordKind = mediaKind(record.type || record.media_type || record.category);
  const expectedKind = diagnosis.media_type;
  if (recordKind && expectedKind !== 'unknown' && recordKind !== expectedKind) return [finding('category_error', '媒体类型对不上：当前整理目录与已确认作品类型不同')]
  const titles = [record.title, record.original_title, record.media_name].map(cleanTitle).filter(Boolean);
  const proposed = [diagnosis.title, diagnosis.original_title].map(cleanTitle).filter(Boolean);
  if (titles.length && proposed.length && !titles.some(left => proposed.some(right => left === right || left.includes(right) || right.includes(left)))) return [finding('identity_error', '当前整理作品名与整包证据确认的作品不一致', 'review')]
  if (diagnosis.season && record.season && Number(record.season) !== Number(diagnosis.season)) return [finding('hierarchy_error', '季目录对不上：当前整理季与整包证据不一致', 'review')]
  return []
}

function findingLabel(kind) {
  return ({ native_failure: '原生整理失败', category_error: '目录分类错误', hierarchy_error: '目录层级错误', episode_error: '剧集对应错误', identity_error: '作品识别错误', unconfirmed: '无法确认', uncovered: '尚未覆盖' })[kind] || '需要核对'
}

const uniqueFindings = rows => {
  const seen = new Map();
  for (const row of rows) {
    const key = `${row.kind}:${row.reason}`;
    if (!seen.has(key)) seen.set(key, row);
  }
  return [...seen.values()]
};

/**
 * 将“当前下载单元 + 当前目标状态”转换为可判卷的结论。
 * 生产页面和金标准测试共用这一层，避免测试另一套想象中的规则。
 */
function evaluateUnitAudit ({
  unit,
  history = [],
  library = [],
  diagnosis = null,
  targetPresent = true,
  coverageComplete = true,
  identityRequired = false,
  latest = null,
  targetEvidence = {},
} = {}) {
  const summary = unit?.summary || summarizeUnit(unit);
  const finding = (kind, reason, strength = 'strong') => ({ kind, reason, strength, unit_id: unit?.id || '', history_id: (latest || latestHistory(history))?.id || null });
  if (!summary.video_count) return { summary, findings: [], disposition: 'normal' }
  if (!coverageComplete) {
    return { summary, findings: [finding('uncovered', '当前目录或官方预览未完整读取，暂不能下结论', 'review')], disposition: 'uncovered' }
  }
  const successful = history.filter(row => row?.status === true);
  const current = latest || latestHistory(history);
  const findings = classifyFinding({ unit, summary, history, library, diagnosis });
  if (current?.status === false) {
    return { summary, findings: [finding('native_failure', '最近一次原生整理失败，且下载包仍在当前下载区')], disposition: 'problem' }
  }
  if (successful.length && targetPresent === false) {
    findings.unshift(finding('native_failure', '原生整理目标当前不存在或已被手动改动'));
  }
  for (const evidence of Object.values(targetEvidence || {})) {
    if (!evidence || evidence.complete === false) continue
    if (evidence.category_ok === false) findings.push(finding('category_error', '实际目标目录与确认的媒体类型不一致', 'review'));
    if (evidence.season_ok === false) findings.push(finding('hierarchy_error', '实际目标季目录与确认季不一致', 'review'));
    if (evidence.identity_ok === false) findings.push(finding('identity_error', '实际目标文件识别为另一部作品', 'review'));
    if (evidence.episode_ok === false) findings.push(finding('episode_error', '源文件与实际目标文件的集号不一致', 'review'));
  }
  const unique = uniqueFindings(findings);
  if (unique.length) return { summary, findings: unique, disposition: 'problem' }
  if (identityRequired && !history.length) {
    return { summary, findings: [finding('unconfirmed', '当前下载单元没有可关联的整理历史，不能判断是否已正确整理', 'review')], disposition: 'unconfirmed' }
  }
  if (identityRequired && (!diagnosis || diagnosis.abstain || diagnosis.confidence < 0.5)) {
    return { summary, findings: [finding('unconfirmed', '作品身份证据不足，不能把它算作正常')], disposition: 'unconfirmed' }
  }
  return { summary, findings: [], disposition: 'normal' }
}

/** 诊断范围先由“有当前整理关系”决定，不能由旧规则是否已报错决定。 */
function identityTargets (units = []) {
  return units.filter(unit => unit?.complete && unit?.history?.length && unit?.summary?.video_count)
}

/** AI 只接住原生识别明确弃权的项目，避免为所有正常项目重复花费 token。 */
function aiFallbackTargets (units = []) {
  return identityTargets(units).filter(unit => !unit.diagnosis || unit.diagnosis.abstain || unit.diagnosis.confidence < 0.5)
}

/**
 * MoviePilot 的联邦页面在不同宿主版本会多包一层或两层 data。
 * 业务代码只接受最终负载；失败响应始终原样抛出，不能被误当成空数据。
 */
function unwrapMoviePilotResponse (value) {
  let current = value;
  const seen = new Set();
  for (let depth = 0; depth < 6 && current && typeof current === 'object'; depth += 1) {
    if (seen.has(current)) break
    seen.add(current);
    if (current.success === false) throw new Error(current.message || 'MoviePilot 请求失败')
    if (!Object.prototype.hasOwnProperty.call(current, 'data') || current.data === undefined) break
    current = current.data;
  }
  return current
}

function historySucceeded (row = {}, fallback = null) {
  const value = row.status;
  if (typeof value === 'boolean') return value
  if (value == null || value === '') return fallback
  return ['true', 'success', 'succeeded', 'ok', '完成', '成功'].includes(String(value).trim().toLowerCase())
}

function normaliseHistoryRows (rows = [], fallback = null) {
  return (Array.isArray(rows) ? rows : []).map(row => ({ ...row, status: historySucceeded(row, fallback) }))
}

function shortTitle (value) {
  return String(value || '').replace(/[\\/]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120)
}

const {createElementVNode:_createElementVNode,toDisplayString:_toDisplayString,createTextVNode:_createTextVNode,openBlock:_openBlock,createElementBlock:_createElementBlock,createCommentVNode:_createCommentVNode,normalizeStyle:_normalizeStyle,renderList:_renderList,Fragment:_Fragment,unref:_unref} = await importShared('vue');


const _hoisted_1 = { class: "governor-page" };
const _hoisted_2 = { class: "hero" };
const _hoisted_3 = { class: "actions" };
const _hoisted_4 = ["disabled"];
const _hoisted_5 = ["disabled"];
const _hoisted_6 = { class: "summary" };
const _hoisted_7 = {
  key: 0,
  class: "progress"
};
const _hoisted_8 = {
  key: 1,
  class: "notice"
};
const _hoisted_9 = { class: "panel" };
const _hoisted_10 = ["disabled"];
const _hoisted_11 = {
  key: 0,
  class: "empty"
};
const _hoisted_12 = { class: "kind" };
const _hoisted_13 = ["onClick"];
const _hoisted_14 = {
  key: 2,
  class: "backdrop"
};
const _hoisted_15 = { class: "modal" };
const _hoisted_16 = {
  key: 0,
  class: "candidate"
};
const _hoisted_17 = {
  key: 1,
  class: "warning"
};
const _hoisted_18 = {
  key: 2,
  class: "preview"
};

const {computed,onMounted,ref} = await importShared('vue');

const pageSize = 100, entryLimit = 1200;

const _sfc_main = {
  __name: 'AppPage',
  props: { api: { type: Object, default: () => ({}) } },
  setup(__props) {

const props = __props;
const state = ref({ ready: false, updated_at: '', download_units: 0, library_nodes: 0, findings: 0, dirty: 0 });
const phase = ref('尚未建立地图'), notice = ref(''), running = ref(false), stopped = ref(false), aiAvailable = ref(null);
const progress = ref({ done: 0, total: 0, current: '' }), findings = ref([]), units = ref([]), histories = ref([]), preview = ref(null), selected = ref(null);
const canUseApi = computed(() => typeof props.api?.get === 'function' && typeof props.api?.post === 'function');
const percent = computed(() => progress.value.total ? Math.min(100, Math.round(progress.value.done * 100 / progress.value.total)) : 0);
const elapsedLabel = computed(() => running.value ? '正在读取真实文件状态' : state.value.updated_at ? '已有媒体地图' : '首次建立地图会较久，之后只复核变动项');
const cards = computed(() => findings.value);
const provenCount = computed(() => findings.value.filter(item => item.kind !== 'unconfirmed' && item.kind !== 'uncovered').length);
const uncoveredCount = computed(() => findings.value.filter(item => item.kind === 'uncovered').length);
const safe = value => String(value || '').replace(/[\\/]/g, '').replace(/\s+/g, ' ').trim().slice(0, 160);
function previewForDisplay(value) {
  if (Array.isArray(value)) return value.map(previewForDisplay)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, /(path|src|dest|root)/i.test(key) ? '已隐藏' : previewForDisplay(item)]))
}
const keyOf = item => `${item?.storage || 'local'}:${item?.path || item?.name || ''}`;
function fail(error, fallback) { notice.value = error?.message || fallback; }
function resetRun(label) { running.value = true; stopped.value = false; notice.value = ''; phase.value = label; progress.value = { done: 0, total: 0, current: '' }; findings.value = []; units.value = []; histories.value = []; }
function stop() { stopped.value = true; notice.value = '已停止；已完成部分会保留到本轮结束前。'; }
async function get(path) { return unwrapMoviePilotResponse(await props.api.get(path, { feedback: 'silent' })) }
async function post(path, body) { return unwrapMoviePilotResponse(await props.api.post(path, body, { feedback: 'silent' })) }
async function status() {
  if (!canUseApi.value) return
  try {
    const snapshot = await get('plugin/MediaGovernor/map_snapshot');
    state.value = { ...state.value, ...(snapshot?.summary || snapshot || {}) };
    findings.value = Array.isArray(snapshot?.findings) ? snapshot.findings : [];
    if (state.value.ready) notice.value = `已载入上次地图：${state.value.download_units} 个下载单元，${provenCount.value} 个已证明问题，${uncoveredCount.value} 个尚未覆盖。`;
  } catch (error) { fail(error, '无法读取已保存的媒体地图'); }
}
function listOf(raw) { return Array.isArray(raw) ? raw : raw?.items || raw?.list || raw?.data || [] }
async function directories(kind) { return listOf(await get(`storage/directories?directory_type=${kind}`)) }
async function list(item) { const value = await post('storage/list', item); if (!Array.isArray(value)) throw new Error('MoviePilot 没有返回目录列表'); return value }
async function history(status) { const rows = []; for (let page = 1; !stopped.value; page += 1) { const data = await get(`history/transfer?status=${status}&page=${page}&count=${pageSize}`); const batch = listOf(data); rows.push(...batch); if (batch.length < pageSize) break } return normaliseHistoryRows(rows, status) }
async function walk(root, recursive = true) {
  const entries = []; const queue = root?.type === 'dir' ? [{ item: root, depth: 0 }] : []; let readFailures = 0;
  if (root?.type !== 'dir') entries.push({ ...root, depth: 0 });
  while (queue.length && !stopped.value) {
    const current = queue.shift(); let children;
    try { children = await list(current.item); } catch { readFailures += 1; continue }
    for (const child of children) {
      if (entries.length >= entryLimit) return { entries, complete: false }
      const item = { ...child, depth: current.depth + 1 }; entries.push(item);
      if (recursive && child?.type === 'dir') queue.push({ item: child, depth: current.depth + 1 });
    }
  }
  return { entries, complete: !stopped.value && !readFailures }
}
function sourceRowsFor(unit, rows) { return historyRowsForUnit(unit, rows) }
function targetPaths(rows) { return latestHistoryRows(rows).filter(row => row?.status === true).map(destinationPath).filter(Boolean) }
function parentOf(path, storage = 'local') { const value = String(path || ''); const cut = Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\')); return cut > 0 ? { type: 'dir', path: value.slice(0, cut), storage } : null }
async function scanTargetParents(allUnits) {
  const parentItems = new Map(); const expectedByUnit = new Map();
  for (const unit of allUnits) {
    const expected = targetPaths(unit.history); const parentKeys = [];
    for (const row of latestHistoryRows(unit.history).filter(row => row?.status === true)) {
      const target = destinationPath(row); const parent = parentOf(target, row?.dest_fileitem?.storage || row?.dest_storage);
      if (!parent) continue
      const key = keyOf(parent); parentItems.set(key, parent); parentKeys.push(key);
    }
    expectedByUnit.set(unit.id, { expected, parentKeys: [...new Set(parentKeys)] });
  }
  const readable = new Map(); let readFailures = 0;
  const parents = [...parentItems.entries()]; progress.value.total += parents.length;
  for (let index = 0; index < parents.length && !stopped.value; index += 1) {
    const [key, parent] = parents[index];
    try {
      const items = (await list(parent)).filter(item => item?.path);
      readable.set(key, new Map(items.map(item => [pathKey(item.path), item])));
    }
    catch { readable.set(key, null); readFailures += 1; }
    progress.value.done += 1; phase.value = `核对当前整理目标：${index + 1}/${parents.length}`; progress.value.current = '只读取整理历史实际指向的目标目录，不扫描整座媒体库。';
  }
  const states = new Map();
  for (const unit of allUnits) {
    const plan = expectedByUnit.get(unit.id) || { expected: [], parentKeys: [] }; const present = new Map(); let complete = true;
    for (const key of plan.parentKeys) {
      const entries = readable.get(key);
      if (entries == null) { complete = false; continue }
      for (const [path, entry] of entries) present.set(path, entry);
    }
    states.set(unit.id, { expected: plan.expected, present, complete });
  }
  return { states, parentCount: parents.length, readFailures }
}
function modelEvidence(unit, summary) { return { title_hints: summary.names, entries: unit.entries.slice(0, 500).map(item => ({ name: safe(item.name), type: item.type, depth: item.depth })), video_count: summary.video_count, episodes: summary.episodes } }
async function askAi(candidates) {
  if (!candidates.length || aiAvailable.value === false) return new Map()
  phase.value = `让智能助手复核 ${candidates.length} 个无法靠原生识别确认的单元`;
  try {
    const diagnoses = new Map();
    for (let start = 0; start < candidates.length && !stopped.value; start += 12) {
      const rows = candidates.slice(start, start + 12).map(item => ({ id: item.id, evidence: modelEvidence(item, item.summary) }));
      const result = await post('plugin/MediaGovernor/bundle_analyze_batch', { items: rows });
      for (const [id, diagnosis] of Object.entries(result.diagnoses || {})) diagnoses.set(id, diagnosis);
    }
    return diagnoses
  } catch (error) { aiAvailable.value = false; notice.value = `${error?.message || '智能助手不可用'}；本轮只保留规则能证明的问题。`; return new Map() }
}
function diagnosisFromCandidate(raw) {
  const value = raw?.media_info || raw?.mediaInfo || raw?.media || raw || {};
  const title = shortTitle(value.title || value.name || value.media_name);
  const type = String(value.type || value.media_type || value.mtype || '').toLowerCase();
  const mediaType = /tv|series|电视剧|剧集|动漫|动画/.test(type) ? 'tv' : /movie|film|电影/.test(type) ? 'movie' : 'unknown';
  const season = Number(value.season || value.season_number || 0) || 0;
  return { title, original_title: shortTitle(value.original_title || value.originalName), year: String(value.year || ''), media_type: mediaType, season, confidence: title ? 0.8 : 0, abstain: !title }
}
async function identifyUnits() {
  const target = identityTargets(units.value);
  if (!target.length) return
  progress.value.total += target.length;
  let cursor = 0;
  const worker = async () => {
    while (!stopped.value) {
      const index = cursor; cursor += 1;
      if (index >= target.length) return
      const unit = target[index]; const sample = unit.entries.find(item => videoPattern.test(item?.name || '')) || unit.root;
      try { unit.diagnosis = diagnosisFromCandidate(await get(`media/recognize_file?path=${encodeURIComponent(sample?.path || unit.root?.path || '')}`)); }
      catch { unit.diagnosis = { abstain: true, confidence: 0, title: '', media_type: 'unknown' }; }
      progress.value.done += 1; phase.value = `核验作品身份：${index + 1}/${target.length}`; progress.value.current = '每个有整理关系的下载单元都先走 MoviePilot 原生识别；不再等规则先报错。';
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, target.length) }, worker));
}
function mediaKind(value) {
  const type = String(value || '').toLowerCase();
  return /tv|series|电视剧|剧集|动漫|动画|综艺|纪录片/.test(type) ? 'tv' : /movie|film|电影/.test(type) ? 'movie' : 'unknown'
}
function seasonInPath(value) {
  const match = String(value || '').replace(/\\/g, '/').match(/\/(?:s|season)[ ._-]?(\d{1,2})(?=\/|$)/i);
  return match ? Number(match[1]) : 0
}
function sameTitle(left, right) {
  const a = cleanTitle(left), b = cleanTitle(right);
  return !a || !b || a === b || a.includes(b) || b.includes(a)
}
async function targetEvidenceFor(unit, targetState, libraryRoots) {
  const latest = latestHistory(unit.history); const success = latestHistoryRows(unit.history).filter(row => row?.status === true);
  const presentRows = success.map(row => ({ row, target: destinationPath(row), item: targetState.present.get(pathKey(destinationPath(row))) })).filter(item => item.target);
  const evidence = { complete: targetState.complete, category_ok: true, season_ok: true, identity_ok: true, episode_ok: true };
  if (!presentRows.length || !unit.diagnosis || unit.diagnosis.abstain) return evidence
  for (const entry of presentRows) {
    if (!entry.item) continue
    const root = libraryRootForPath(entry.target, libraryRoots);
    if (root?.media_type && unit.diagnosis.media_type !== 'unknown' && mediaKind(root.media_type) !== 'unknown' && mediaKind(root.media_type) !== unit.diagnosis.media_type) evidence.category_ok = false;
    const expectedSeason = Number(unit.diagnosis.season || latest?.season || 0);
    const actualSeason = seasonInPath(entry.target);
    if (expectedSeason && actualSeason && expectedSeason !== actualSeason) evidence.season_ok = false;
    const sourceEpisodes = strictEpisodeHints(sourcePath(entry.row)); const targetEpisodes = strictEpisodeHints(entry.target);
    if (sourceEpisodes.length && targetEpisodes.length && sourceEpisodes.join(',') !== targetEpisodes.join(',')) evidence.episode_ok = false;
  }
  const representative = presentRows.find(entry => entry.item);
  if (representative) {
    try {
      const targetDiagnosis = diagnosisFromCandidate(await get(`media/recognize_file?path=${encodeURIComponent(representative.target)}`));
      if (!targetDiagnosis.abstain && targetDiagnosis.confidence >= 0.5 && !sameTitle(unit.diagnosis.title || unit.diagnosis.original_title, targetDiagnosis.title || targetDiagnosis.original_title)) evidence.identity_ok = false;
    } catch { evidence.complete = false; }
  }
  return evidence
}
async function inspectTargetEvidence(allUnits, targetAudit, libraryRoots) {
  const result = new Map(); const candidates = allUnits.filter(unit => unit.complete && unit.history.length && unit.summary.video_count);
  progress.value.total += candidates.length; let cursor = 0;
  const worker = async () => {
    while (!stopped.value) {
      const index = cursor; cursor += 1; if (index >= candidates.length) return
      const unit = candidates[index]; const targetState = targetAudit.states.get(unit.id) || { present: new Map(), complete: false };
      result.set(unit.id, await targetEvidenceFor(unit, targetState, libraryRoots));
      progress.value.done += 1; phase.value = `核验实际整理结果：${index + 1}/${candidates.length}`; progress.value.current = '把原文件身份、实际目标文件、媒体库分类和集号逐项对照。';
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, candidates.length) }, worker));
  return result
}
async function scanDownloadUnits(toScan, total) {
  const results = new Array(toScan.length); let cursor = 0;
  const worker = async () => {
    while (!stopped.value) {
      const index = cursor; cursor += 1;
      if (index >= toScan.length) return
      const unit = toScan[index];
      try {
        const tree = await walk(unit.root);
        unit.entries = tree.entries; unit.complete = tree.complete; unit.summary = summarizeUnit(unit); unit.history = sourceRowsFor(unit, histories.value); unit.id = keyOf(unit.root);
      } catch { unit.entries = []; unit.complete = false; unit.summary = summarizeUnit(unit); unit.history = []; unit.id = keyOf(unit.root); }
      results[index] = unit; progress.value.done += 1; phase.value = `读取下载单元：${progress.value.done}/${total}`; progress.value.current = '最多同时读取 4 个下载单元；读不到的目录会保留为尚未覆盖。';
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, toScan.length) }, worker));
  units.value = results.filter(Boolean);
}
async function buildMap(full = false) {
  if (!canUseApi.value) { notice.value = 'MoviePilot 页面 API 尚未注入，无法建立地图。'; return }
  resetRun(full ? '建立完整媒体地图' : '复核当前变动');
  try {
    const [downloadConfigurations, libraryConfigurations, failed, successful] = await Promise.all([directories('download'), directories('library'), history(false), history(true)]);
    histories.value = [...failed, ...successful];
    const scope = configuredDownloadRoots(downloadConfigurations);
    if (!scope.roots.length) throw new Error('没有可用下载目录：拒绝扫描空路径或容器根目录')
    phase.value = '验证下载目录并读取顶层下载包'; const discovered = [];
    for (const root of scope.roots) { if (stopped.value) break; discovered.push(...createDownloadUnits(root, await list(root))); }
    const top = [...new Map(discovered.map(unit => [keyOf(unit.root), unit])).values()];
    const libraryRoots = configuredLibraryRoots(libraryConfigurations);
    const initial = !state.value.ready || full;
    const plan = initial ? { unchanged: [] } : await post('plugin/MediaGovernor/map_plan', { units: top.map(unit => ({ id: keyOf(unit.root), fingerprint: rootFingerprint([unit.root]) })) });
    const toScan = initial ? top : top.filter(unit => !new Set(plan.unchanged || []).has(keyOf(unit.root)));
    progress.value.total = toScan.length; progress.value.current = initial ? `发现 ${top.length} 个当前下载单元；历史记录只用来关联，不当成问题数。` : `发现 ${top.length} 个下载单元，其中 ${toScan.length} 个发生变动，需要深度复核。`;
    await scanDownloadUnits(toScan, top.length);
    const libraryNodes = libraryRootSnapshot(libraryRoots);
    const targetAudit = await scanTargetParents(units.value);
    await identifyUnits();
    // AI 只补原生识别弃权的有历史单元；假成功不会因为“还没报错”而绕过原生身份核验。
    const candidates = aiFallbackTargets(units.value);
    const diagnoses = await askAi(candidates);
    for (const unit of units.value) if (diagnoses.has(unit.id)) unit.diagnosis = diagnoses.get(unit.id);
    const targetEvidence = await inspectTargetEvidence(units.value, targetAudit, libraryRoots);
    const refined = [];
    if (scope.rejected.length) refined.push({ unit_id: 'scope:invalid', title: `${scope.rejected.length} 个下载目录配置`, kind: 'uncovered', reason: '下载目录为空或指向容器根目录，已拒绝扫描；请在 MoviePilot 目录设置中修正', strength: 'review' });
    for (const unit of units.value) {
      if (!unit.complete) { refined.push({ unit_id: unit.id, title: cleanTitle(unit.root?.name) || '未命名下载单元', kind: 'uncovered', reason: '当前下载单元未完整读取，暂不能下结论', strength: 'review' }); continue }
      if (!unit.summary.video_count) continue
      const diagnosis = unit.diagnosis;
      const targetState = targetAudit.states.get(unit.id) || { expected: targetPaths(unit.history), present: new Map(), complete: true };
      const coverageComplete = unit.complete && targetState.complete;
      const missingTargets = coverageComplete ? targetState.expected.filter(path => !targetState.present.has(pathKey(path))) : [];
      refined.push(...evaluateUnitAudit({ unit, history: unit.history, library: libraryNodes, diagnosis, latest: latestHistory(unit.history), targetEvidence: targetEvidence.get(unit.id), targetPresent: !missingTargets.length, coverageComplete, identityRequired: Boolean(unit.history.length) }).findings);
    }
    const linkedHistoryIds = new Set(units.value.flatMap(unit => unit.history.map(row => String(row?.id || ''))));
    const unlinkedUnits = units.value.filter(unit => unit.summary.video_count && !unit.history.length);
    if (unlinkedUnits.length) refined.push({ unit_id: 'coverage:unlinked', title: `${unlinkedUnits.length} 个下载单元`, kind: 'uncovered', reason: '当前下载单元没有可关联的整理历史，不能把它们算作已正确整理', strength: 'review' });
    for (const row of failed.filter(item => !linkedHistoryIds.has(String(item?.id || '')))) {
      refined.push({ unit_id: `history:${row?.id || shortTitle(row?.title)}`, history_id: row?.id || null, title: shortTitle(row?.title) || '未命名失败历史', kind: 'unconfirmed', reason: '原生失败历史没有关联到当前下载单元；不能判断它是否已恢复', strength: 'review' });
    }
    findings.value = dedupe(refined); phase.value = stopped.value ? '已停止（未保存不完整地图）' : '保存当前媒体地图';
    if (!stopped.value) {
      const linkedUnits = units.value.filter(unit => unit.history.length).length;
      const unmatchedFailed = failed.filter(item => !linkedHistoryIds.has(String(item?.id || ''))).length;
      const commit = await post('plugin/MediaGovernor/map_commit', { baseline: initial, partial: !initial, scope_verified: true, download_units: units.value.map(unit => ({ id: unit.id, root: unit.root, label: cleanTitle(unit.root?.name) || '未命名下载单元', fingerprint: unit.summary.fingerprint, header_fingerprint: rootFingerprint([unit.root]), video_count: unit.summary.video_count, subtitle_count: unit.summary.subtitle_count, nfo_count: unit.summary.nfo_count, episodes: unit.summary.episodes, names: unit.summary.names, history: unit.history.map(row => row.id), status: 'checked', coverage: unit.complete ? 'complete' : 'uncovered' })), library_nodes: libraryNodes, findings: findings.value, coverage: { configured_download_roots: scope.roots.length, rejected_download_roots: scope.rejected.length, download_units: top.length, scanned_units: units.value.length, library_roots: libraryNodes.length, target_parent_dirs: targetAudit.parentCount, target_parent_read_failures: targetAudit.readFailures, failed_history: failed.length, successful_history: successful.length, linked_units: linkedUnits, unlinked_units: units.value.length - linkedUnits, unmatched_failed_history: unmatchedFailed, uncovered_units: uncoveredCount.value }, history_summary: histories.value.map(row => ({ id: row.id, status: row.status, mode: row.mode, media_source: row.media_source, media_id: row.media_id, target: destinationPath(row) })) });
      state.value = { ...state.value, ...commit };
      const snapshot = await get('plugin/MediaGovernor/map_snapshot');
      findings.value = Array.isArray(snapshot?.findings) ? snapshot.findings : findings.value;
      state.value = { ...state.value, ...(snapshot?.summary || snapshot || {}) };
      phase.value = '地图已更新'; notice.value = `已读到失败历史 ${failed.length} 条、成功历史 ${successful.length} 条；本轮复核 ${units.value.length} 个下载单元。核对了 ${targetAudit.parentCount} 个当前整理目标目录（${targetAudit.readFailures} 个暂不可读）。已证明 ${provenCount.value} 个问题，另有 ${findings.value.filter(item => item.kind === 'unconfirmed').length} 个无法确认、${uncoveredCount.value} 个尚未覆盖。`;
    }
  } catch (error) { fail(error, '建立地图失败；没有改变任何媒体。'); phase.value = '建立地图未完成'; }
  finally { running.value = false; }
}
function dedupe(rows) { const map = new Map(); for (const row of rows) { const key = `${row.unit_id}:${row.kind}:${row.reason}`; if (!map.has(key)) map.set(key, row); } return [...map.values()] }
function titleFor(card) { const unit = units.value.find(item => item.id === card.unit_id); return card?.title || cleanTitle(unit?.root?.name) || '未命名下载单元' }
async function recognize(card) {
  const unit = units.value.find(item => item.id === card.unit_id);
  if (!unit?.root?.path) { notice.value = '这条是已保存的地图结论。为确保预览使用当前文件状态，请先执行一次复核当前变动。'; return }
  selected.value = { card, unit, candidate: null, error: '' };
  try { selected.value.candidate = await get(`media/recognize_file?path=${encodeURIComponent(unit.root.path)}`); } catch { selected.value.error = 'MoviePilot 当前无法给出原生候选；可在官方整理页补充准确作品名后再预览。'; }
}
function previewPayload() {
  const row = selected.value?.unit?.history?.find(item => item?.id === selected.value?.card?.history_id) || selected.value?.unit?.history?.at(-1);
  const candidate = selected.value?.candidate?.media_info || selected.value?.candidate?.mediaInfo || selected.value?.candidate || {};
  return { logid: row?.id, media_source: candidate.media_source || candidate.source, media_id: candidate.media_id || candidate.id, type_name: candidate.type || candidate.mtype, src_fileitem: selected.value?.unit?.root, preview: true, reorganize: false }
}
async function makePreview() { try { preview.value = await post('transfer/manual', previewPayload()); } catch (error) { fail(error, '官方预览没有生成；没有删除或重建任何硬链接。'); } }
async function repair() {
  if (!window.confirm('确认按 MoviePilot 官方预览重建这个下载单元吗？这会由官方清理旧整理结果并重新建立硬链接。')) return
  try { const payload = { ...previewPayload(), preview: false, reorganize: false }; await post('transfer/manual', payload); notice.value = '官方已接收重建任务。请重新复核此下载单元，确认预览与实际一致后问题才会关闭。'; preview.value = null; selected.value = null; } catch (error) { fail(error, '官方没有执行重建；旧硬链接没有被本插件直接删除。'); }
}
async function probeAi() { try { const result = await post('plugin/MediaGovernor/ai_probe', {}); aiAvailable.value = Boolean(result.available); notice.value = aiAvailable.value ? '智能助手可用：只会复核规则无法确认的异常单元。' : '智能助手未返回可用状态。'; } catch (error) { aiAvailable.value = false; fail(error, '智能助手不可用，仍可建立地图和检查规则问题。'); } }
onMounted(status);

return (_ctx, _cache) => {
  return (_openBlock(), _createElementBlock("main", _hoisted_1, [
    _createElementVNode("section", _hoisted_2, [
      _cache[3] || (_cache[3] = _createElementVNode("div", null, [
        _createElementVNode("p", { class: "eyebrow" }, "MediaGovernor 3.1.0"),
        _createElementVNode("h1", null, "先验证范围，再找真实问题"),
        _createElementVNode("p", null, "只读取 MoviePilot 配置的下载目录；失败历史绝不直接当问题，必须核对当前文件状态。成功记录也会核对实际目标文件和目录。")
      ], -1)),
      _createElementVNode("div", _hoisted_3, [
        _createElementVNode("button", {
          class: "secondary",
          disabled: running.value,
          onClick: probeAi
        }, "测试智能助手", 8, _hoisted_4),
        _createElementVNode("button", {
          class: "primary",
          disabled: running.value,
          onClick: _cache[0] || (_cache[0] = $event => (buildMap(!state.value.ready)))
        }, _toDisplayString(state.value.ready ? '复核当前变动' : '建立完整地图'), 9, _hoisted_5)
      ])
    ]),
    _createElementVNode("section", _hoisted_6, [
      _createElementVNode("span", null, [
        _createElementVNode("b", null, _toDisplayString(state.value.download_units), 1),
        _cache[4] || (_cache[4] = _createTextVNode("下载单元", -1))
      ]),
      _createElementVNode("span", null, [
        _createElementVNode("b", null, _toDisplayString(state.value.library_nodes), 1),
        _cache[5] || (_cache[5] = _createTextVNode("媒体库根", -1))
      ]),
      _createElementVNode("span", null, [
        _createElementVNode("b", null, _toDisplayString(state.value.findings), 1),
        _cache[6] || (_cache[6] = _createTextVNode("上次结论", -1))
      ]),
      _createElementVNode("span", null, [
        _createElementVNode("b", null, _toDisplayString(state.value.dirty), 1),
        _cache[7] || (_cache[7] = _createTextVNode("待复核变动", -1))
      ])
    ]),
    (running.value || progress.value.total)
      ? (_openBlock(), _createElementBlock("section", _hoisted_7, [
          _createElementVNode("div", null, [
            _createElementVNode("b", null, _toDisplayString(phase.value), 1),
            (running.value)
              ? (_openBlock(), _createElementBlock("button", {
                  key: 0,
                  class: "link",
                  onClick: stop
                }, "停止"))
              : _createCommentVNode("", true)
          ]),
          _createElementVNode("p", null, _toDisplayString(progress.value.current), 1),
          _createElementVNode("i", null, [
            _createElementVNode("em", {
              style: _normalizeStyle({ width: `${percent.value}%` })
            }, null, 4)
          ]),
          _createElementVNode("small", null, _toDisplayString(progress.value.done) + "/" + _toDisplayString(progress.value.total) + " · " + _toDisplayString(elapsedLabel.value), 1)
        ]))
      : _createCommentVNode("", true),
    (notice.value)
      ? (_openBlock(), _createElementBlock("p", _hoisted_8, _toDisplayString(notice.value), 1))
      : _createCommentVNode("", true),
    _createElementVNode("section", _hoisted_9, [
      _createElementVNode("header", null, [
        _cache[8] || (_cache[8] = _createElementVNode("div", null, [
          _createElementVNode("h2", null, "本轮结论"),
          _createElementVNode("p", null, "已证明的问题、无法确认和未覆盖都会留下来；只有完整覆盖且没有任一结论时，才会显示零问题。")
        ], -1)),
        _createElementVNode("button", {
          class: "secondary",
          disabled: running.value,
          onClick: _cache[1] || (_cache[1] = $event => (buildMap(true)))
        }, "完整复核", 8, _hoisted_10)
      ]),
      (!cards.value.length)
        ? (_openBlock(), _createElementBlock("p", _hoisted_11, _toDisplayString(running.value ? '正在核对，还没有形成结论。' : state.value.ready ? '本轮地图完整且没有异常结论。' : '首次使用请先建立完整地图。'), 1))
        : _createCommentVNode("", true),
      (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(cards.value, (card) => {
        return (_openBlock(), _createElementBlock("article", {
          key: `${card.unit_id}-${card.kind}-${card.reason}`,
          class: "card"
        }, [
          _createElementVNode("div", null, [
            _createElementVNode("span", _hoisted_12, _toDisplayString(_unref(findingLabel)(card.kind)), 1),
            _createElementVNode("h3", null, _toDisplayString(titleFor(card)), 1),
            _createElementVNode("p", null, _toDisplayString(card.reason), 1),
            _createElementVNode("small", null, _toDisplayString(card.kind === 'unconfirmed' || card.kind === 'uncovered' ? '它没有被算作正常，也不会自动修复。' : '这是当前状态核对结果，不是历史失败数量。'), 1)
          ]),
          _createElementVNode("button", {
            class: "primary",
            onClick: $event => (recognize(card))
          }, _toDisplayString(card.kind === 'unconfirmed' || card.kind === 'uncovered' ? '复核后查看预览' : '查看并预览修复'), 9, _hoisted_13)
        ]))
      }), 128))
    ]),
    (selected.value)
      ? (_openBlock(), _createElementBlock("div", _hoisted_14, [
          _createElementVNode("section", _hoisted_15, [
            _createElementVNode("button", {
              class: "close",
              onClick: _cache[2] || (_cache[2] = $event => {selected.value = null; preview.value = null;})
            }, "×"),
            _cache[12] || (_cache[12] = _createElementVNode("p", { class: "eyebrow" }, "先确认，再预览", -1)),
            _createElementVNode("h2", null, _toDisplayString(titleFor(selected.value.card)), 1),
            _createElementVNode("p", null, _toDisplayString(selected.value.card.reason), 1),
            (selected.value.candidate)
              ? (_openBlock(), _createElementBlock("div", _hoisted_16, [
                  _createElementVNode("b", null, _toDisplayString(selected.value.candidate?.media_info?.title || selected.value.candidate?.title || '原生候选'), 1),
                  _createElementVNode("span", null, _toDisplayString(selected.value.candidate?.media_info?.year || selected.value.candidate?.year || ''), 1)
                ]))
              : _createCommentVNode("", true),
            (selected.value.error)
              ? (_openBlock(), _createElementBlock("p", _hoisted_17, _toDisplayString(selected.value.error), 1))
              : _createCommentVNode("", true),
            _createElementVNode("button", {
              class: "primary",
              onClick: makePreview
            }, "生成 MoviePilot 官方逐文件预览"),
            (preview.value)
              ? (_openBlock(), _createElementBlock("div", _hoisted_18, [
                  _cache[10] || (_cache[10] = _createElementVNode("h3", null, "官方预览已生成", -1)),
                  _cache[11] || (_cache[11] = _createElementVNode("p", null, "请核对官方列出的源文件与目标位置。确认无误后才会交给 MoviePilot 清理旧整理结果并重建硬链接。", -1)),
                  _createElementVNode("details", null, [
                    _cache[9] || (_cache[9] = _createElementVNode("summary", null, "查看官方预览数据", -1)),
                    _createElementVNode("pre", null, _toDisplayString(JSON.stringify(previewForDisplay(preview.value), null, 2)), 1)
                  ]),
                  _createElementVNode("button", {
                    class: "danger",
                    onClick: repair
                  }, "确认按此预览重建")
                ]))
              : _createCommentVNode("", true)
          ])
        ]))
      : _createCommentVNode("", true)
  ]))
}
}

};
const AppPage = /*#__PURE__*/_export_sfc(_sfc_main, [['__scopeId',"data-v-f7b196c0"]]);

export { AppPage as default };
