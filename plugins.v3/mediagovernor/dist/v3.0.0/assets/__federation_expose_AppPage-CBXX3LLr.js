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

function createDownloadUnits(root, children = []) {
  // 顶层目录或顶层视频各是一个下载单元；不再用相似标题拼成虚构“包”。
  return children.filter(item => item?.type === 'dir' || videoPattern.test(item?.name || '')).map(item => ({
    id: `${root?.storage || 'local'}:${item?.path || item?.name}`, root: item, entries: [], status: 'pending',
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

function historyIndex(rows = []) {
  const bySource = new Map();
  for (const row of rows) {
    const source = row?.src_fileitem || row?.source_fileitem || row?.fileitem || {};
    const key = text(source.path || row?.src || row?.source);
    if (!key) continue
    const group = bySource.get(key) || []; group.push(row); bySource.set(key, group);
  }
  return bySource
}

const mediaKind = value => /tv|series|电视剧|剧集|动漫|动画|综艺|纪录片/i.test(text(value)) ? 'tv' : /movie|film|电影/i.test(text(value)) ? 'movie' : '';

function classifyFinding({ unit, summary, history = [], library = [], diagnosis = null }) {
  const finding = (kind, reason, strength = 'strong') => ({ kind, reason, strength, unit_id: unit.id, history_id: history.at(-1)?.id || null });
  if (!summary.video_count) return []
  const successful = history.filter(row => row?.status !== false);
  const failed = history.filter(row => row?.status === false);
  const targetMissing = successful.length && successful.every(row => !row?.dest_fileitem?.path && !row?.dest);
  if (failed.length && !successful.length) return [finding('native_failure', '原生整理失败后，当前下载单元仍在且没有成功整理记录')]
  if (targetMissing) return [finding('native_failure', '原生整理记录没有当前可核验的媒体库目标')]
  if (summary.duplicateEpisodes.length) return [finding('episode_error', `同一下载单元有重复集号：${summary.duplicateEpisodes.join('、')}`)]
  if (!diagnosis || diagnosis.abstain || diagnosis.confidence < .5) return []
  const record = successful.at(-1) || {}; const recordKind = mediaKind(record.type || record.media_type || record.category);
  const expectedKind = diagnosis.media_type;
  if (recordKind && expectedKind !== 'unknown' && recordKind !== expectedKind) return [finding('category_error', '媒体类型对不上：当前整理目录与已确认作品类型不同')]
  const titles = [record.title, record.original_title, record.media_name].map(cleanTitle).filter(Boolean);
  const proposed = [diagnosis.title, diagnosis.original_title].map(cleanTitle).filter(Boolean);
  if (titles.length && proposed.length && !titles.some(left => proposed.some(right => left === right || left.includes(right) || right.includes(left)))) return [finding('identity_error', '当前整理作品名与整包证据确认的作品不一致', 'review')]
  if (diagnosis.season && record.season && Number(record.season) !== Number(diagnosis.season)) return [finding('hierarchy_error', '季目录对不上：当前整理季与整包证据不一致', 'review')]
  return []
}

function findingLabel(kind) {
  return ({ native_failure: '原生整理失败', category_error: '目录分类错误', hierarchy_error: '目录层级错误', episode_error: '剧集对应错误', identity_error: '作品识别错误', unconfirmed: '无法确认' })[kind] || '需要核对'
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

const pageSize = 100, maxNodes = 30000, entryLimit = 1200;

const _sfc_main = {
  __name: 'AppPage',
  props: { api: { type: Object, default: () => ({}) } },
  setup(__props) {

const props = __props;
const state = ref({ ready: false, updated_at: '', download_units: 0, library_nodes: 0, findings: 0, dirty: 0 });
const phase = ref('尚未建立地图'), notice = ref(''), running = ref(false), stopped = ref(false), aiAvailable = ref(null);
const progress = ref({ done: 0, total: 0, current: '' }), findings = ref([]), units = ref([]), histories = ref([]), preview = ref(null), selected = ref(null);
const dataOf = value => value?.data ?? value;
const canUseApi = computed(() => typeof props.api?.get === 'function' && typeof props.api?.post === 'function');
const percent = computed(() => progress.value.total ? Math.min(100, Math.round(progress.value.done * 100 / progress.value.total)) : 0);
const elapsedLabel = computed(() => running.value ? '正在读取真实文件状态' : state.value.updated_at ? '已有媒体地图' : '首次建立地图会较久，之后只复核变动项');
const cards = computed(() => findings.value.filter(item => item.kind !== 'unconfirmed'));
const safe = value => String(value || '').replace(/[\\/]/g, '').replace(/\s+/g, ' ').trim().slice(0, 160);
function previewForDisplay(value) {
  if (Array.isArray(value)) return value.map(previewForDisplay)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, /(path|src|dest|root)/i.test(key) ? '已隐藏' : previewForDisplay(item)]))
}
const pathKey = value => String(value || '').replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '').toLowerCase();
const relation = (left, right) => { const a = pathKey(left), b = pathKey(right); return a && b && (a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`)) };
const keyOf = item => `${item?.storage || 'local'}:${item?.path || item?.name || ''}`;
function fail(error, fallback) { notice.value = error?.message || fallback; }
function resetRun(label) { running.value = true; stopped.value = false; notice.value = ''; phase.value = label; progress.value = { done: 0, total: 0, current: '' }; findings.value = []; units.value = []; histories.value = []; }
function stop() { stopped.value = true; notice.value = '已停止；已完成部分会保留到本轮结束前。'; }
async function get(path) { const value = dataOf(await props.api.get(path, { feedback: 'silent' })); if (value?.success === false) throw new Error(value.message); return value?.data ?? value }
async function post(path, body) { const value = dataOf(await props.api.post(path, body, { feedback: 'silent' })); if (value?.success === false) throw new Error(value.message); return value?.data ?? value }
async function status() { if (!canUseApi.value) return; try { state.value = { ...state.value, ...await get('plugin/MediaGovernor/map_status') }; } catch (error) { fail(error, '无法读取地图状态'); } }
function listOf(raw) { return Array.isArray(raw) ? raw : raw?.items || raw?.list || raw?.data || [] }
async function directories(kind) { return listOf(await get(`storage/directories?directory_type=${kind}`)) }
async function list(item) { const value = await post('storage/list', item); if (!Array.isArray(value)) throw new Error('MoviePilot 没有返回目录列表'); return value }
async function history(status) { const rows = []; for (let page = 1; !stopped.value; page += 1) { const data = await get(`history/transfer?status=${status}&page=${page}&count=${pageSize}`); const batch = listOf(data); rows.push(...batch); if (batch.length < pageSize) break } return rows }
async function walk(root, recursive = true) {
  const entries = []; const queue = root?.type === 'dir' ? [{ item: root, depth: 0 }] : [];
  if (root?.type !== 'dir') entries.push({ ...root, depth: 0 });
  while (queue.length && !stopped.value) {
    const current = queue.shift(); const children = await list(current.item);
    for (const child of children) {
      if (entries.length >= entryLimit) return { entries, complete: false }
      const item = { ...child, depth: current.depth + 1 }; entries.push(item);
      if (recursive && child?.type === 'dir') queue.push({ item: child, depth: current.depth + 1 });
    }
  }
  return { entries, complete: !stopped.value }
}
function sourceRowsFor(unit, index) {
  const root = unit.root?.path || ''; const matched = [];
  for (const [path, rows] of index) if (relation(path, root)) matched.push(...rows);
  return matched
}
function targetPaths(rows) { return rows.map(row => row?.dest_fileitem?.path || row?.dest).filter(Boolean) }
async function scanLibrary(roots) {
  const nodes = []; const paths = new Set(); const queue = roots.map(root => ({ item: root, depth: 0 }));
  while (queue.length && nodes.length < maxNodes && !stopped.value) {
    const current = queue.shift(); let children;
    try { children = await list(current.item); } catch { continue }
    for (const child of children) {
      nodes.push({ id: keyOf(child), root: child, fingerprint: `${safe(child.name)}|${child.size || 0}|${child.modify_time || ''}`, video_count: videoPattern.test(child?.name || '') ? 1 : 0, category: safe(current.item?.name) });
      if (child?.path) paths.add(pathKey(child.path));
      if (child?.type === 'dir') queue.push({ item: child, depth: current.depth + 1 });
    }
    phase.value = `读取媒体库：${nodes.length} 项`; progress.value.current = '只读取当前文件清单，不会改动媒体';
  }
  return { nodes, paths, complete: !queue.length && !stopped.value }
}
function parentOf(path, storage = 'local') { const value = String(path || ''); const cut = Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\')); return cut > 0 ? { type: 'dir', path: value.slice(0, cut), storage } : null }
async function currentTargetPaths(rows) {
  const expected = targetPaths(rows); const parents = new Map();
  for (const row of rows) { const target = row?.dest_fileitem?.path || row?.dest; const parent = parentOf(target, row?.dest_fileitem?.storage || row?.dest_storage); if (parent) parents.set(keyOf(parent), parent); }
  const present = new Set();
  for (const parent of parents.values()) { try { for (const child of await list(parent)) if (child?.path) present.add(pathKey(child.path)); } catch { /* 不把暂不可读目录误判为已删除。 */ } }
  return { expected, present }
}
function modelEvidence(unit, summary) { return { title_hints: summary.names, entries: unit.entries.slice(0, 500).map(item => ({ name: safe(item.name), type: item.type, depth: item.depth })), video_count: summary.video_count, episodes: summary.episodes } }
async function askAi(candidates) {
  if (!candidates.length || aiAvailable.value === false) return new Map()
  phase.value = `让智能助手复核 ${candidates.length} 个无法靠规则确认的单元`;
  try {
    const rows = candidates.slice(0, 12).map(item => ({ id: item.id, evidence: modelEvidence(item, item.summary) })); const result = await post('plugin/MediaGovernor/bundle_analyze_batch', { items: rows });
    return new Map(Object.entries(result.diagnoses || {}))
  } catch (error) { aiAvailable.value = false; notice.value = `${error?.message || '智能助手不可用'}；本轮只保留规则能证明的问题。`; return new Map() }
}
async function buildMap(full = false) {
  if (!canUseApi.value) { notice.value = 'MoviePilot 页面 API 尚未注入，无法建立地图。'; return }
  resetRun(full ? '建立完整媒体地图' : '复核当前变动');
  try {
    const [downloadRoots, libraryRoots, failed, successful] = await Promise.all([directories('download'), directories('library'), history(false), history(true)]);
    histories.value = [...failed, ...successful]; const index = historyIndex(histories.value);
    phase.value = '读取下载区顶层下载单元'; const top = [];
    for (const root of downloadRoots) { if (stopped.value) break; top.push(...createDownloadUnits(root, await list(root))); }
    const initial = !state.value.ready || full;
    const plan = initial ? { unchanged: [] } : await post('plugin/MediaGovernor/map_plan', { units: top.map(unit => ({ id: keyOf(unit.root), fingerprint: rootFingerprint([unit.root]) })) });
    const toScan = initial ? top : top.filter(unit => !new Set(plan.unchanged || []).has(keyOf(unit.root)));
    progress.value.total = toScan.length + (initial ? libraryRoots.length : 0); progress.value.current = initial ? `发现 ${top.length} 个当前下载单元；历史记录只用来关联，不当成问题数。` : `发现 ${top.length} 个下载单元，其中 ${toScan.length} 个发生变动，需要深度复核。`;
    for (const unit of toScan) {
      if (stopped.value) break
      phase.value = `读取下载单元：${progress.value.done + 1}/${top.length}`; const tree = await walk(unit.root);
      unit.entries = tree.entries; unit.complete = tree.complete; unit.summary = summarizeUnit(unit); unit.history = sourceRowsFor(unit, index); unit.id = keyOf(unit.root);
      units.value.push(unit); progress.value.done += 1;
    }
    phase.value = initial ? '读取媒体库当前结果' : '核对变动单元的当前整理目标';
    const library = initial ? await scanLibrary(libraryRoots) : { nodes: [], paths: new Set(), complete: true };
    progress.value.done = Math.min(progress.value.total, toScan.length + (initial ? libraryRoots.length : 0));
    const preliminary = [];
    for (const unit of units.value) {
      if (!unit.complete || !unit.summary.video_count) continue
      const targetState = initial ? { expected: targetPaths(unit.history), present: library.paths } : await currentTargetPaths(unit.history);
      const missingTargets = targetState.expected.filter(path => !targetState.present.has(pathKey(path)));
      if (missingTargets.length) preliminary.push({ kind: 'native_failure', reason: '原生整理目标当前不存在或已被手动改动', strength: 'strong', unit_id: unit.id, history_id: unit.history.at(-1)?.id || null });
      preliminary.push(...classifyFinding({ unit, summary: unit.summary, history: unit.history, library: library.nodes }));
    }
    // 只给“已有异常信号但作品身份不确定”的单元发送一次批量 AI 复核；不把整个库盲猜一遍。
    const candidates = units.value.filter(unit => preliminary.some(item => item.unit_id === unit.id) && unit.summary.video_count);
    const diagnoses = await askAi(candidates);
    const refined = [];
    for (const item of preliminary) {
      const unit = units.value.find(value => value.id === item.unit_id); const diagnosis = diagnoses.get(unit?.id);
      refined.push(item);
      if (unit && diagnosis && !diagnosis.abstain) refined.push(...classifyFinding({ unit, summary: unit.summary, history: unit.history, library: library.nodes, diagnosis }));
    }
    findings.value = dedupe(refined); phase.value = stopped.value ? '已停止（未保存不完整地图）' : '保存当前媒体地图';
    if (!stopped.value) {
      const commit = await post('plugin/MediaGovernor/map_commit', { baseline: initial, partial: !initial, download_units: units.value.map(unit => ({ id: unit.id, root: unit.root, fingerprint: unit.summary.fingerprint, header_fingerprint: rootFingerprint([unit.root]), video_count: unit.summary.video_count, subtitle_count: unit.summary.subtitle_count, nfo_count: unit.summary.nfo_count, episodes: unit.summary.episodes, names: unit.summary.names, history: unit.history.map(row => row.id), status: 'checked' })), library_nodes: library.nodes, findings: findings.value, history_summary: histories.value.map(row => ({ id: row.id, status: row.status, mode: row.mode, media_source: row.media_source, media_id: row.media_id, target: row?.dest_fileitem?.path || row?.dest })) });
      state.value = { ...state.value, ...commit }; phase.value = '地图已更新'; notice.value = `已按当前文件状态核对：${units.value.length} 个下载单元，发现 ${findings.value.length} 个真实待处理问题。`;
    }
  } catch (error) { fail(error, '建立地图失败；没有改变任何媒体。'); phase.value = '建立地图未完成'; }
  finally { running.value = false; }
}
function dedupe(rows) { const map = new Map(); for (const row of rows) { const key = `${row.unit_id}:${row.kind}:${row.reason}`; if (!map.has(key)) map.set(key, row); } return [...map.values()] }
function titleFor(card) { const unit = units.value.find(item => item.id === card.unit_id); return cleanTitle(unit?.root?.name) || '未命名下载单元' }
async function recognize(card) {
  const unit = units.value.find(item => item.id === card.unit_id); if (!unit?.root?.path) return
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
        _createElementVNode("p", { class: "eyebrow" }, "MediaGovernor 3.0"),
        _createElementVNode("h1", null, "先建立真实地图，再处理真实问题"),
        _createElementVNode("p", null, "从当前下载区和媒体库读取状态；失败历史只作线索，绝不再当成问题数量。")
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
        _cache[5] || (_cache[5] = _createTextVNode("媒体库项目", -1))
      ]),
      _createElementVNode("span", null, [
        _createElementVNode("b", null, _toDisplayString(state.value.findings), 1),
        _cache[6] || (_cache[6] = _createTextVNode("上次问题", -1))
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
          _createElementVNode("h2", null, "需要处理的问题"),
          _createElementVNode("p", null, "只有当前文件状态能证明有异常的单元才在这里出现。无法确认的不会假装成问题。")
        ], -1)),
        _createElementVNode("button", {
          class: "secondary",
          disabled: running.value,
          onClick: _cache[1] || (_cache[1] = $event => (buildMap(true)))
        }, "完整复核", 8, _hoisted_10)
      ]),
      (!cards.value.length)
        ? (_openBlock(), _createElementBlock("p", _hoisted_11, _toDisplayString(running.value ? '正在核对，还没有形成结论。' : '当前没有已证明的问题。首次使用请先建立完整地图。'), 1))
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
            _cache[9] || (_cache[9] = _createElementVNode("small", null, "这是当前状态核对结果，不是历史失败数量。", -1))
          ]),
          _createElementVNode("button", {
            class: "primary",
            onClick: $event => (recognize(card))
          }, "查看并预览修复", 8, _hoisted_13)
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
            _cache[13] || (_cache[13] = _createElementVNode("p", { class: "eyebrow" }, "先确认，再预览", -1)),
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
                  _cache[11] || (_cache[11] = _createElementVNode("h3", null, "官方预览已生成", -1)),
                  _cache[12] || (_cache[12] = _createElementVNode("p", null, "请核对官方列出的源文件与目标位置。确认无误后才会交给 MoviePilot 清理旧整理结果并重建硬链接。", -1)),
                  _createElementVNode("details", null, [
                    _cache[10] || (_cache[10] = _createElementVNode("summary", null, "查看官方预览数据", -1)),
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
const AppPage = /*#__PURE__*/_export_sfc(_sfc_main, [['__scopeId',"data-v-a2ca707c"]]);

export { AppPage as default };
