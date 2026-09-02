import { importShared } from './__federation_fn_import-JrT3xvdd.js';
import { _ as _export_sfc } from './_plugin-vue_export-helper-pcqpp-6-.js';

const {createElementVNode:_createElementVNode,toDisplayString:_toDisplayString,openBlock:_openBlock,createElementBlock:_createElementBlock,createCommentVNode:_createCommentVNode,normalizeStyle:_normalizeStyle,createTextVNode:_createTextVNode,normalizeClass:_normalizeClass,renderList:_renderList,Fragment:_Fragment,withModifiers:_withModifiers} = await importShared('vue');


const _hoisted_1 = { class: "governor-page" };
const _hoisted_2 = { class: "hero" };
const _hoisted_3 = { class: "actions" };
const _hoisted_4 = ["disabled"];
const _hoisted_5 = {
  class: "progress",
  "aria-live": "polite"
};
const _hoisted_6 = { class: "progress-head" };
const _hoisted_7 = { class: "track" };
const _hoisted_8 = {
  key: 0,
  class: "scope"
};
const _hoisted_9 = { key: 1 };
const _hoisted_10 = { class: "stats" };
const _hoisted_11 = {
  key: 0,
  class: "notice",
  role: "status"
};
const _hoisted_12 = { class: "tabs" };
const _hoisted_13 = {
  key: 1,
  class: "panel"
};
const _hoisted_14 = { class: "section-head" };
const _hoisted_15 = { class: "chip" };
const _hoisted_16 = {
  key: 0,
  class: "empty"
};
const _hoisted_17 = { class: "state" };
const _hoisted_18 = { key: 0 };
const _hoisted_19 = { key: 1 };
const _hoisted_20 = {
  key: 2,
  class: "reason"
};
const _hoisted_21 = ["onClick"];
const _hoisted_22 = {
  key: 2,
  class: "panel"
};
const _hoisted_23 = {
  key: 0,
  class: "empty"
};
const _hoisted_24 = ["onClick"];
const _hoisted_25 = { class: "modal" };
const _hoisted_26 = { key: 0 };
const _hoisted_27 = {
  key: 1,
  class: "candidate-list"
};
const _hoisted_28 = {
  key: 0,
  class: "candidate-subtitle"
};
const _hoisted_29 = { class: "candidate-meta" };
const _hoisted_30 = {
  key: 1,
  class: "reason"
};
const _hoisted_31 = ["onClick"];
const _hoisted_32 = {
  key: 2,
  class: "empty"
};
const _hoisted_33 = {
  key: 3,
  class: "safe"
};
const _hoisted_34 = ["disabled"];
const _hoisted_35 = {
  key: 0,
  class: "audit"
};
const _hoisted_36 = { class: "audit-grid" };
const _hoisted_37 = {
  key: 0,
  class: "reason"
};
const _hoisted_38 = {
  key: 1,
  class: "safe"
};
const _hoisted_39 = ["disabled"];
const _hoisted_40 = {
  key: 4,
  class: "backdrop"
};
const _hoisted_41 = { class: "modal confirm" };
const _hoisted_42 = ["disabled"];
const _hoisted_43 = ["disabled"];

const {computed,ref} = await importShared('vue');


const pageSize = 100;
const workers = 3;
const maxDirs = 16;
const maxDepth = 2;
const maxNames = 18;
const maxCandidates = 5;

const _sfc_main = {
  __name: 'AppPage',
  props: { api: { type: Object, default: () => ({}) } },
  setup(__props) {

const props = __props;
const tab = ref('identity');
const loading = ref(false);
const notice = ref('');
const cards = ref([]);
const selected = ref(null);
const audit = ref(null);
const confirmRepair = ref(false);
const sources = ref([]);
const control = ref({ paused: false, stopped: false });
const run = ref(newRun());
const tick = ref(0);
let resumeWaiter = null;
let timer = null;
const detailCache = new Map();

const videoExt = /\.(mkv|mp4|avi|m2ts|ts|mov|webm)$/i;
const subtitleExt = /\.(ass|ssa|srt|sub|vtt)$/i;
const canUseApi = computed(() => typeof props.api?.get === 'function' && typeof props.api?.post === 'function');
const progress = computed(() => run.value.total ? Math.round(run.value.completed * 100 / run.value.total) : 0);
const elapsed = computed(() => {
  tick.value;
  if (!run.value.startedAt) return '0 秒'
  const value = Math.round(((run.value.finishedAt || Date.now()) - run.value.startedAt) / 1000);
  return value < 60 ? `${value} 秒` : `${Math.floor(value / 60)} 分 ${value % 60} 秒`
});
const confirmed = computed(() => cards.value.filter(item => item.state === 'confirmed'));
function newRun() { return { phase: '尚未开始', total: 0, historyTotal: 0, completed: 0, current: '', startedAt: 0, finishedAt: 0, stats: { confirmed: 0, selection: 0, insufficient: 0, unavailable: 0 } } }
const dataOf = value => value?.data ?? value;
const safe = value => String(value || '').replace(/[\\/]/g, '').replace(/\s+/g, ' ').trim().slice(0, 160);
const unique = values => [...new Set(values.filter(Boolean))];
const number = value => Number(value) || 0;

function sourcePackage(source) {
  if (source?.type === 'dir') return source
  const path = String(source?.path || '');
  const split = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return split < 1 ? null : { ...source, path: path.slice(0, split), name: '', basename: '', extension: '', type: 'dir', children: [] }
}
function sourceKey(row) {
  const source = row?.src_fileitem || {}; const root = sourcePackage(source);
  return root?.path ? `${source.storage || 'local'}:${root.path}` : `history:${row?.id || Math.random()}`
}
function groupRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = sourceKey(row); const group = groups.get(key) || { key, historyIds: [], source: row?.src_fileitem, historyTitles: [] };
    group.historyIds.push(row?.id); if (row?.title) group.historyTitles.push(safe(row.title)); groups.set(key, group);
  }
  return [...groups.values()]
}
function cleanTitle(value) {
  return safe(value).replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[._-]+/g, ' ')
    .replace(/\b(2160p|1080p|720p|web[ .-]?dl|web[ .-]?rip|bluray|bdrip|remux|x26[45]|h\.?26[45]|hevc|aac|dts|atmos|hdr10?\+?|dv|10bit|proper|repack|complete|中字|简繁|国语|粤语)\b/gi, ' ')
    .replace(/\[[^\]]*\]|【[^】]*】/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100)
}
const norm = value => cleanTitle(value).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const queryIsUseful = value => { const normalized = norm(value); return normalized.length >= 3 && !/^(movie|video|sample|test|unknown|第?[0-9]+集?)$/i.test(normalized) };
function episodesText(episodes) { const items = [...new Set(episodes)].sort((a, b) => a - b); return !items.length ? '' : items.length === 1 ? `第 ${items[0]} 集` : `第 ${items[0]}–${items.at(-1)} 集（${items.length} 个集号）` }
function evidenceText(evidence) { const values = [`${evidence.videos} 个视频`, `${evidence.subtitles} 个字幕`]; if (evidence.episodes.length) values.push(episodesText(evidence.episodes)); if (evidence.nfos) values.push(`${evidence.nfos} 个 NFO`); return values.join('，') }
const evidenceQueries = evidence => evidence.queries.join('；') || '没有可用名称线索';
const candidateNames = candidate => unique([candidate.title, candidate.original_title, candidate.en_title, ...(candidate.names || [])]);
function candidateSubtitle(candidate) { const values = []; if (candidate.original_title && candidate.original_title !== candidate.title) values.push(`原名：${candidate.original_title}`); if (candidate.en_title && candidate.en_title !== candidate.title && candidate.en_title !== candidate.original_title) values.push(`英文：${candidate.en_title}`); if (candidate.names?.length) values.push(`别名：${candidate.names.slice(0, 3).join('、')}`); return values.join('；') }
function candidateMeta(candidate) { const values = [candidate.type_name, candidate.year].filter(Boolean); if (candidate.season) values.push(`第 ${candidate.season} 季`); if (candidate.episodeCount) values.push(`${candidate.episodeCount} 集`); values.push(`来源：${candidate.media_source}`); return values.join(' · ') }

async function packageEvidence(root, source, historyTitles = []) {
  if (!root) return { ok: false, reason: '来源文件没有可读取的父目录。' }
  const queue = [{ item: root, depth: 0 }]; const names = [...historyTitles.map(cleanTitle), cleanTitle(source?.name)].filter(Boolean); const episodes = [];
  let directories = 0; let videos = 0; let subtitles = 0; let nfos = 0;
  while (queue.length && directories < maxDirs) {
    const current = queue.shift(); let children;
    try { children = dataOf(await props.api.post('storage/list', current.item, { feedback: 'silent' })); } catch { return { ok: false, reason: 'MoviePilot 无法读取这个来源包。' } }
    if (!Array.isArray(children)) return { ok: false, reason: '来源包返回的数据不是可读文件列表。' }
    directories += 1;
    for (const child of children) {
      const name = safe(child?.name); if (name && names.length < maxNames) names.push(cleanTitle(name));
      const match = name.match(/[. _-][Ss](\d{1,2})[. _-]?[Ee](\d{1,3})(?:[. _-]?[Ee]?(\d{1,3}))?/i) || name.match(/\b[Ee][Pp]?(\d{1,3})\b/);
      if (match) episodes.push(Number(match[2] || match[1]), ...(match[3] ? [Number(match[3])] : []));
      if (child?.type === 'dir') { if (current.depth < maxDepth && queue.length < maxDirs) queue.push({ item: child, depth: current.depth + 1 }); } else if (videoExt.test(name)) videos += 1; else if (subtitleExt.test(name)) subtitles += 1; else if (/\.nfo$/i.test(name)) nfos += 1;
    }
  }
  const queries = unique(names.filter(queryIsUseful)).sort((left, right) => right.length - left.length).slice(0, 3);
  if (!videos && !queries.length) return { ok: false, reason: '包内没有可识别的视频或名称线索。' }
  return { ok: true, videos, subtitles, nfos, directories, episodes: episodes.filter(Number.isFinite), queries, truncated: queue.length > 0 }
}
function identityOf(context, via) { const media = context?.media_info || context?.mediaInfo || context?.media || {}; const meta = context?.meta_info || context?.metaInfo || {}; return candidateOf({ ...media, title: media.title || media.name || meta.title, year: media.year || meta.year, media_source: media.media_source || media.source, media_id: media.media_id || media.id, type: media.type || media.mtype || meta.type, season: media.season || meta.season }, via) }
function candidateOf(raw, via) {
  const title = safe(raw?.title || raw?.name); const mediaSource = String(raw?.media_source || raw?.source || ''); const mediaId = String(raw?.media_id || raw?.id || ''); const type = String(raw?.type || raw?.mtype || '');
  if (!title || !mediaSource || !mediaId || !type) return null
  return { title, original_title: safe(raw?.original_title || raw?.original_name), en_title: safe(raw?.en_title || raw?.english_title), names: unique([...(Array.isArray(raw?.names) ? raw.names : []), ...(Array.isArray(raw?.aliases) ? raw.aliases : [])].map(safe)).slice(0, 6), year: String(raw?.year || raw?.release_year || raw?.release_date || '').slice(0, 4), media_source: mediaSource, media_id: mediaId, type_name: type, season: number(raw?.season || raw?.season_number) || undefined, via: [via], reasons: [], conflicts: [], score: 0 }
}
const candidateKey = candidate => `${candidate.media_source}:${candidate.media_id}:${candidate.type_name}`;
function mergeCandidate(previous, candidate) { return !previous ? candidate : { ...previous, ...candidate, via: unique([...(previous.via || []), ...(candidate.via || [])]), names: unique([...(previous.names || []), ...(candidate.names || [])]) } }
async function historyRows() {
  const rows = [];
  for (let page = 1; ; page += 1) { const payload = dataOf(await props.api.get(`history/transfer?status=false&page=${page}&count=${pageSize}`, { feedback: 'silent' })); if (payload?.success === false) throw new Error(payload.message || '无法读取失败整理历史'); const data = payload?.data ?? payload; const batch = data?.items || data?.list || data?.data || []; if (!Array.isArray(batch)) return rows; rows.push(...batch); if (batch.length < pageSize) return rows }
}
async function readSources() { try { const raw = dataOf(await props.api.get('media/source', { feedback: 'silent' })); sources.value = Array.isArray(raw) ? raw.map(item => String(item?.media_source || item?.source || '')).filter(Boolean).slice(0, 6) : []; } catch { sources.value = []; } }
async function detailFor(candidate) { const key = candidateKey(candidate); if (!detailCache.has(key)) detailCache.set(key, props.api.get(`media/${encodeURIComponent(candidate.media_id)}?${new URLSearchParams({ media_source: candidate.media_source, type_name: candidate.type_name })}`, { feedback: 'silent' }).then(dataOf).catch(() => ({}))); return detailCache.get(key) }
function scoreCandidate(candidate, evidence) {
  const names = candidateNames(candidate).map(norm).filter(Boolean); const exact = evidence.queries.some(query => names.includes(norm(query))); const related = evidence.queries.some(query => { const value = norm(query); return value.length >= 3 && names.some(name => name.includes(value) || value.includes(name)) }); let score = 0;
  if (exact) { score += 5; candidate.reasons.push('原始名称线索与候选标题完全一致'); } else if (related) { score += 3; candidate.reasons.push('原始名称线索与候选标题相关'); } else candidate.conflicts.push('候选标题与来源名称线索不一致');
  if ((candidate.via || []).some(item => item.includes('原生识别'))) { score += 2; candidate.reasons.push('MoviePilot 原生识别命中'); }
  const detail = candidate.detail || {}; candidate.original_title = candidate.original_title || safe(detail.original_title || detail.original_name); candidate.en_title = candidate.en_title || safe(detail.en_title || detail.english_title); candidate.names = unique([...(candidate.names || []), ...(Array.isArray(detail.names) ? detail.names : []), ...(Array.isArray(detail.aliases) ? detail.aliases : [])].map(safe)).slice(0, 6);
  const year = String(detail.year || detail.release_year || detail.release_date || candidate.year || '').slice(0, 4); candidate.year = candidate.year || year; const years = unique(evidence.queries.flatMap(query => query.match(/(?:19|20)\d{2}/g) || [])); if (years.length && year && !years.includes(year)) { score -= 3; candidate.conflicts.push('年份线索不一致'); } else if (years.length && year) { score += 1; candidate.reasons.push('年份线索一致'); }
  const count = number(detail.number_of_episodes || detail.episode_count || detail?.seasons?.[candidate.season]?.length); candidate.episodeCount = count || undefined; if (evidence.videos >= 3 && count) { if (count < Math.max(2, evidence.videos * .55)) { score -= 4; candidate.conflicts.push('候选集数与来源包视频数明显冲突'); } else { score += 2; candidate.reasons.push('候选集数与来源包规模不矛盾'); } } if (evidence.episodes.length >= 3 && count && Math.max(...evidence.episodes) > count) { score -= 4; candidate.conflicts.push('来源包集号超过候选总集数'); } candidate.score = score;
}
async function recognizeCandidates(source, evidence) {
  const map = new Map(); const add = candidate => { if (candidate) map.set(candidateKey(candidate), mergeCandidate(map.get(candidateKey(candidate)), candidate)); };
  if (source?.path) try { add(identityOf(dataOf(await props.api.get(`media/recognize_file?path=${encodeURIComponent(source.path)}`, { feedback: 'silent' })), '来源文件原生识别')); } catch { /* Other package evidence remains available. */ }
  const primary = evidence.queries[0]; if (primary) try { add(identityOf(dataOf(await props.api.get(`media/recognize?title=${encodeURIComponent(primary)}`, { feedback: 'silent' })), '包名原生识别')); } catch { /* Search remains available. */ }
  if (primary) { const params = new URLSearchParams({ title: primary, type: 'media', count: String(maxCandidates) }); sources.value.forEach(sourceId => params.append('media_source', sourceId)); try { const raw = dataOf(await props.api.get(`media/search?${params}`, { feedback: 'silent' })); if (Array.isArray(raw)) raw.forEach(item => add(candidateOf(item, '多来源官方搜索'))); } catch { /* A data source may be unavailable. */ } }
  const candidates = [...map.values()].slice(0, maxCandidates); await Promise.all(candidates.map(async candidate => { candidate.detail = await detailFor(candidate); scoreCandidate(candidate, evidence); })); return candidates.sort((left, right) => right.score - left.score)
}
function resolveIdentity(candidates) { const first = candidates[0]; const second = candidates[1]; if (!first) return { state: 'insufficient', reason: '已读取整包名称和结构，但官方数据源没有返回候选。', candidates: [] }; if (first.score >= 6 && !first.conflicts.length && (!second || first.score - second.score >= 2)) return { state: 'confirmed', identity: first, candidates, reason: '名称、原生识别和文件集信息相互支持。' }; return { state: 'needs_selection', candidates, reason: `候选尚不可靠：${first.conflicts[0] || (second ? '前两个候选证据接近，不能替你猜。' : '证据不足。')}` } }
async function inspectPackage(group) { const source = group?.source; if (!source?.path) return { state: 'unavailable', historyId: group?.historyIds?.[0], historyIds: group?.historyIds || [], reason: '失败历史没有可读取的来源文件。' }; const evidence = await packageEvidence(sourcePackage(source), source, group.historyTitles); if (!evidence.ok) return { state: 'unavailable', historyId: group.historyIds[0], historyIds: group.historyIds, source, reason: evidence.reason }; const resolved = resolveIdentity(await recognizeCandidates(source, evidence)); return { ...resolved, historyId: group.historyIds[0], historyIds: group.historyIds, source, evidence } }
function addStat(item) { if (item.state === 'confirmed') run.value.stats.confirmed += 1; else if (item.state === 'needs_selection') run.value.stats.selection += 1; else if (item.state === 'insufficient') run.value.stats.insufficient += 1; else run.value.stats.unavailable += 1; }
async function waitIfPaused() { while (control.value.paused && !control.value.stopped) await new Promise(resolve => { resumeWaiter = resolve; }); return !control.value.stopped }
function pause() { control.value.paused = true; run.value.phase = '已暂停：不会再派发新的来源包'; }
function resume() { control.value.paused = false; run.value.phase = '继续检查来源包'; resumeWaiter?.(); resumeWaiter = null; }
function stop() { control.value.stopped = true; control.value.paused = false; run.value.phase = '正在停止：已发出的请求会自然结束'; resumeWaiter?.(); resumeWaiter = null; }
async function inspect() {
  if (!canUseApi.value || loading.value) { notice.value = '当前 MoviePilot 没有注入认证 API，无法安全检查。'; return }
  loading.value = true; cards.value = []; selected.value = null; audit.value = null; confirmRepair.value = false; control.value = { paused: false, stopped: false }; detailCache.clear(); run.value = { ...newRun(), phase: '正在读取失败整理历史', startedAt: Date.now() }; timer = window.setInterval(() => { tick.value += 1; }, 1000);
  try { const [rows] = await Promise.all([historyRows(), readSources()]); const groups = groupRows(rows); run.value.historyTotal = rows.length; run.value.total = groups.length; if (!rows.length) { run.value.phase = '没有失败整理记录'; notice.value = '没有读取到失败整理记录；本次没有进行任何文件操作。'; return }; run.value.phase = `已读取 ${rows.length} 条失败记录，合并为 ${groups.length} 个来源包；正在检查（最多 ${workers} 包并发）`; const queue = [...groups]; const worker = async () => { while (queue.length && await waitIfPaused()) { const group = queue.shift(); if (!group) return; run.value.current = `正在核对第 ${run.value.completed + 1}/${run.value.total} 个来源包`; let item; try { item = await inspectPackage(group); } catch { item = { state: 'unavailable', historyId: group.historyIds[0], historyIds: group.historyIds, source: group.source, reason: '检查这一来源包时出现异常；可稍后重试。' }; }; cards.value = [...cards.value, item]; run.value.completed += 1; addStat(item); } }; await Promise.all(Array.from({ length: Math.min(workers, groups.length) }, worker)); run.value.finishedAt = Date.now(); if (control.value.stopped) notice.value = `检查已停止：已完成 ${run.value.completed}/${run.value.total} 个来源包；对应 ${run.value.historyTotal} 条失败记录。全程没有写入文件。`; else { run.value.phase = '检查完成'; notice.value = `检查完成：${run.value.historyTotal} 条失败记录已合并为 ${run.value.total} 个来源包；已确认 ${run.value.stats.confirmed} 包，待你选择 ${run.value.stats.selection} 包，资料不足 ${run.value.stats.insufficient} 包，来源不可用 ${run.value.stats.unavailable} 包。全程没有写入文件。`; } } catch (error) { run.value.phase = '检查未完成'; notice.value = error?.message || '无法读取整理历史；没有改动文件。'; } finally { loading.value = false; if (timer) window.clearInterval(timer); timer = null; }
}
function open(card, nextTab = 'identity') { selected.value = card; audit.value = null; confirmRepair.value = false; tab.value = nextTab; }
function choose(candidate) { selected.value = { ...selected.value, state: 'confirmed', identity: candidate, reason: '已由你确认这部作品；仍须先通过官方预览。', userConfirmed: true }; cards.value = cards.value.map(item => item.historyId === selected.value.historyId ? selected.value : item); }
function payload(item, preview, reorganize, target = {}) { return { fileitem: item.source, logid: item.historyId, transfer_type: target.transfer_type || 'link', target_storage: target.target_storage, target_path: target.target_path, scrape: target.scrape, library_type_folder: target.library_type_folder, library_category_folder: target.library_category_folder, preview, reorganize, media_source: item.identity.media_source, media_id: item.identity.media_id, type_name: item.identity.type_name, season: item.identity.season } }
function auditIssues(preview, history, target) { const issues = []; const summary = preview?.summary || {}; const items = preview?.items || []; if (!history?.reorganize) issues.push('没有查到可确认的旧成功整理历史，不能把它当作清理旧链接。'); if (!target?.target_path || !target?.transfer_type) issues.push('当前目录规则没有给出唯一且完整的目标方案。'); if (!summary.total || summary.failed || items.some(item => item?.success === false || !item?.target)) issues.push('官方预览不完整，不能执行。'); const episodes = items.map(item => Number(item?.episode)).filter(Number.isFinite); if (new Set(episodes).size !== episodes.length) issues.push('官方预览存在重复集号，不能执行。'); return issues }
async function auditOrganization() { if (!selected.value?.identity || selected.value.state !== 'confirmed') return; loading.value = true; audit.value = null; try { const base = payload(selected.value, true, true); const [historyResponse, targetResponse] = await Promise.all([props.api.post('transfer/manual/history', base, { feedback: 'silent' }), props.api.post('transfer/manual/target-path', base, { feedback: 'silent' })]); const history = dataOf(historyResponse); const target = dataOf(targetResponse); if (history?.success === false || target?.success === false) throw new Error(history?.message || target?.message || '官方审计被拒绝'); const historyData = history?.data ?? history; const targetData = target?.data ?? target; const preview = dataOf(await props.api.post('transfer/manual', payload(selected.value, true, true, targetData), { feedback: 'silent' })); if (preview?.success === false) throw new Error(preview?.message || '官方预览被拒绝'); const previewData = preview?.data ?? preview; const issues = auditIssues(previewData, historyData, targetData); audit.value = { history: historyData || {}, target: targetData || {}, preview: previewData || {}, issues, eligible: !issues.length }; notice.value = audit.value.eligible ? '官方审计与零写入预览完成。请核对摘要，再决定是否重整。' : '已完成只读审计，但存在风险，执行按钮已锁定。'; } catch (error) { notice.value = error?.message || '官方审计失败；没有改动文件。'; } finally { loading.value = false; } }
async function repair() { if (!audit.value?.eligible || !selected.value) return; loading.value = true; try { const result = dataOf(await props.api.post('transfer/manual', payload(selected.value, false, true, audit.value.target), { feedback: 'all' })); if (result?.success === false) throw new Error(result.message || 'MoviePilot 重整失败'); notice.value = `MoviePilot 已按刚才的官方预览重整“${selected.value.identity.title}”。旧硬链接的处理由 MoviePilot 官方完成；插件没有直接删除、移动、改名或覆盖来源文件。`; confirmRepair.value = false; audit.value = null; } catch (error) { notice.value = error?.message || '重整没有完成；请查看 MoviePilot 的官方结果。'; } finally { loading.value = false; } }

return (_ctx, _cache) => {
  return (_openBlock(), _createElementBlock("main", _hoisted_1, [
    _createElementVNode("header", _hoisted_2, [
      _cache[6] || (_cache[6] = _createElementVNode("div", null, [
        _createElementVNode("p", { class: "eyebrow" }, "MediaGovernor"),
        _createElementVNode("h1", null, "媒体治理工作台"),
        _createElementVNode("p", null, "先找对作品，再检查整理是否正确。检查和预览不会改文件；真实重整必须由你确认。")
      ], -1)),
      _createElementVNode("div", _hoisted_3, [
        _createElementVNode("button", {
          class: "primary",
          disabled: loading.value,
          onClick: inspect
        }, _toDisplayString(loading.value ? '检查进行中…' : cards.value.length ? '重新检查' : '开始检查'), 9, _hoisted_4),
        (loading.value && !control.value.paused)
          ? (_openBlock(), _createElementBlock("button", {
              key: 0,
              class: "secondary",
              onClick: pause
            }, "暂停"))
          : _createCommentVNode("", true),
        (loading.value && control.value.paused)
          ? (_openBlock(), _createElementBlock("button", {
              key: 1,
              class: "secondary",
              onClick: resume
            }, "继续"))
          : _createCommentVNode("", true),
        (loading.value)
          ? (_openBlock(), _createElementBlock("button", {
              key: 2,
              class: "danger",
              onClick: stop
            }, "停止"))
          : _createCommentVNode("", true)
      ])
    ]),
    _createElementVNode("section", _hoisted_5, [
      _createElementVNode("div", _hoisted_6, [
        _createElementVNode("strong", null, _toDisplayString(run.value.phase), 1),
        _createElementVNode("span", null, _toDisplayString(run.value.completed) + "/" + _toDisplayString(run.value.total) + " 个来源包 · " + _toDisplayString(elapsed.value), 1)
      ]),
      _createElementVNode("div", _hoisted_7, [
        _createElementVNode("i", {
          style: _normalizeStyle({ width: `${progress.value}%` })
        }, null, 4)
      ]),
      (run.value.historyTotal)
        ? (_openBlock(), _createElementBlock("p", _hoisted_8, "本次范围：MoviePilot 的 " + _toDisplayString(run.value.historyTotal) + " 条失败整理记录，按相同来源包合并后检查；不是扫描整个媒体库。", 1))
        : _createCommentVNode("", true),
      (run.value.current)
        ? (_openBlock(), _createElementBlock("p", _hoisted_9, _toDisplayString(run.value.current) + "。结果会逐包出现，不必等待全部结束。", 1))
        : _createCommentVNode("", true),
      _createElementVNode("div", _hoisted_10, [
        _createElementVNode("span", null, [
          _cache[7] || (_cache[7] = _createTextVNode("已确认 ", -1)),
          _createElementVNode("b", null, _toDisplayString(run.value.stats.confirmed), 1)
        ]),
        _createElementVNode("span", null, [
          _cache[8] || (_cache[8] = _createTextVNode("待选择 ", -1)),
          _createElementVNode("b", null, _toDisplayString(run.value.stats.selection), 1)
        ]),
        _createElementVNode("span", null, [
          _cache[9] || (_cache[9] = _createTextVNode("资料不足 ", -1)),
          _createElementVNode("b", null, _toDisplayString(run.value.stats.insufficient), 1)
        ]),
        _createElementVNode("span", null, [
          _cache[10] || (_cache[10] = _createTextVNode("来源不可用 ", -1)),
          _createElementVNode("b", null, _toDisplayString(run.value.stats.unavailable), 1)
        ])
      ])
    ]),
    (notice.value)
      ? (_openBlock(), _createElementBlock("p", _hoisted_11, _toDisplayString(notice.value), 1))
      : _createCommentVNode("", true),
    _createElementVNode("nav", _hoisted_12, [
      _createElementVNode("button", {
        class: _normalizeClass({ active: tab.value === 'identity' }),
        onClick: _cache[0] || (_cache[0] = $event => (tab.value = 'identity'))
      }, "1. 找对作品", 2),
      _createElementVNode("button", {
        class: _normalizeClass({ active: tab.value === 'organize' }),
        onClick: _cache[1] || (_cache[1] = $event => (tab.value = 'organize'))
      }, "2. 整理正确", 2)
    ]),
    (tab.value === 'identity')
      ? (_openBlock(), _createElementBlock("section", _hoisted_13, [
          _createElementVNode("div", _hoisted_14, [
            _cache[11] || (_cache[11] = _createElementVNode("div", null, [
              _createElementVNode("h2", null, "找对作品"),
              _createElementVNode("p", null, "先把同一个来源包合并，再用原始名称线索、季集、官方识别和候选详情交叉判断。冲突不自动进入整理。")
            ], -1)),
            _createElementVNode("span", _hoisted_15, "已发现 " + _toDisplayString(sources.value.length) + " 个数据源", 1)
          ]),
          (!cards.value.length)
            ? (_openBlock(), _createElementBlock("p", _hoisted_16, "点击“开始检查”后，会先说明范围，再逐个显示每个来源包的结论。"))
            : _createCommentVNode("", true),
          (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(cards.value, (card) => {
            return (_openBlock(), _createElementBlock("article", {
              key: card.historyId,
              class: _normalizeClass(["card", card.state])
            }, [
              _createElementVNode("div", null, [
                _createElementVNode("span", _hoisted_17, _toDisplayString(card.state === 'confirmed' ? '已确认' : card.state === 'needs_selection' ? '待你选择' : card.state === 'insufficient' ? '资料不足' : '来源不可用'), 1),
                _createElementVNode("h3", null, _toDisplayString(card.identity?.title || '还没有可靠作品身份') + _toDisplayString(card.identity?.year ? `（${card.identity.year}）` : ''), 1),
                (card.evidence)
                  ? (_openBlock(), _createElementBlock("p", _hoisted_18, _toDisplayString(evidenceText(card.evidence)) + "。" + _toDisplayString(card.historyIds?.length > 1 ? `已合并 ${card.historyIds.length} 条失败记录。` : '对应 1 条失败记录。'), 1))
                  : (_openBlock(), _createElementBlock("p", _hoisted_19, _toDisplayString(card.reason), 1)),
                (card.reason)
                  ? (_openBlock(), _createElementBlock("p", _hoisted_20, _toDisplayString(card.reason), 1))
                  : _createCommentVNode("", true)
              ]),
              _createElementVNode("button", {
                class: "secondary",
                onClick: $event => (open(card))
              }, _toDisplayString(card.state === 'confirmed' ? '查看判断' : '查看线索与候选'), 9, _hoisted_21)
            ], 2))
          }), 128))
        ]))
      : (_openBlock(), _createElementBlock("section", _hoisted_22, [
          _cache[13] || (_cache[13] = _createElementVNode("div", { class: "section-head" }, [
            _createElementVNode("div", null, [
              _createElementVNode("h2", null, "整理正确"),
              _createElementVNode("p", null, "只检查已确认作品：先查旧成功历史、当前规则和官方零写入预览，再决定能否安全重整。")
            ]),
            _createElementVNode("span", { class: "chip" }, "仅官方重整可处理旧硬链接")
          ], -1)),
          (!confirmed.value.length)
            ? (_openBlock(), _createElementBlock("p", _hoisted_23, "先在“找对作品”里得到已确认身份。冲突候选和资料不足的包不会出现执行入口。"))
            : _createCommentVNode("", true),
          (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(confirmed.value, (card) => {
            return (_openBlock(), _createElementBlock("article", {
              key: card.historyId,
              class: "card confirmed"
            }, [
              _createElementVNode("div", null, [
                _cache[12] || (_cache[12] = _createElementVNode("span", { class: "state" }, "身份已确认", -1)),
                _createElementVNode("h3", null, _toDisplayString(card.identity.title) + _toDisplayString(card.identity.year ? `（${card.identity.year}）` : ''), 1),
                _createElementVNode("p", null, _toDisplayString(evidenceText(card.evidence)) + "。尚未读取或删除任何旧硬链接。", 1)
              ]),
              _createElementVNode("button", {
                class: "primary",
                onClick: $event => {open(card, 'organize'); auditOrganization();}
              }, "检查整理方案", 8, _hoisted_24)
            ]))
          }), 128))
        ])),
    (selected.value)
      ? (_openBlock(), _createElementBlock("div", {
          key: 3,
          class: "backdrop",
          onClick: _cache[4] || (_cache[4] = _withModifiers($event => (selected.value = null), ["self"]))
        }, [
          _createElementVNode("section", _hoisted_25, [
            _createElementVNode("button", {
              class: "close",
              "aria-label": "关闭",
              onClick: _cache[2] || (_cache[2] = $event => (selected.value = null))
            }, "×"),
            (tab.value === 'identity')
              ? (_openBlock(), _createElementBlock(_Fragment, { key: 0 }, [
                  _cache[14] || (_cache[14] = _createElementVNode("p", { class: "eyebrow" }, "找对作品", -1)),
                  _createElementVNode("h2", null, _toDisplayString(selected.value.identity?.title || '候选核验'), 1),
                  (selected.value.evidence)
                    ? (_openBlock(), _createElementBlock("p", _hoisted_26, "来源包证据：" + _toDisplayString(evidenceText(selected.value.evidence)) + "。原始名称线索：" + _toDisplayString(evidenceQueries(selected.value.evidence)) + "。", 1))
                    : _createCommentVNode("", true),
                  _createElementVNode("p", null, _toDisplayString(selected.value.reason || '官方候选正在等待核验。'), 1),
                  (selected.value.candidates?.length)
                    ? (_openBlock(), _createElementBlock("div", _hoisted_27, [
                        (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(selected.value.candidates, (candidate) => {
                          return (_openBlock(), _createElementBlock("article", {
                            key: candidateKey(candidate),
                            class: _normalizeClass(["candidate", { conflicted: candidate.conflicts?.length }])
                          }, [
                            _createElementVNode("div", null, [
                              _createElementVNode("strong", null, _toDisplayString(candidate.title) + _toDisplayString(candidate.year ? `（${candidate.year}）` : ''), 1),
                              (candidateSubtitle(candidate))
                                ? (_openBlock(), _createElementBlock("p", _hoisted_28, _toDisplayString(candidateSubtitle(candidate)), 1))
                                : _createCommentVNode("", true),
                              _createElementVNode("p", _hoisted_29, _toDisplayString(candidateMeta(candidate)), 1),
                              _createElementVNode("p", null, "依据：" + _toDisplayString(candidate.reasons?.join('；') || '只有官方搜索命中，尚不足以确认'), 1),
                              (candidate.conflicts?.length)
                                ? (_openBlock(), _createElementBlock("p", _hoisted_30, "冲突：" + _toDisplayString(candidate.conflicts.join('；')), 1))
                                : _createCommentVNode("", true)
                            ]),
                            _createElementVNode("button", {
                              class: "secondary",
                              onClick: $event => (choose(candidate))
                            }, "确认是这部", 8, _hoisted_31)
                          ], 2))
                        }), 128))
                      ]))
                    : (_openBlock(), _createElementBlock("p", _hoisted_32, "没有足够的官方候选。这不代表文件为空，只表示当前公开数据源还不能确认。")),
                  (selected.value.state === 'confirmed')
                    ? (_openBlock(), _createElementBlock("p", _hoisted_33, "身份已确认。下一步可进入“整理正确”，先做官方零写入审计。"))
                    : _createCommentVNode("", true)
                ], 64))
              : (_openBlock(), _createElementBlock(_Fragment, { key: 1 }, [
                  _cache[19] || (_cache[19] = _createElementVNode("p", { class: "eyebrow" }, "整理正确", -1)),
                  _createElementVNode("h2", null, _toDisplayString(selected.value.identity?.title), 1),
                  _cache[20] || (_cache[20] = _createElementVNode("p", null, "不展示真实路径；只说明是否有旧成功硬链接、当前规则是否给出目标，以及官方预览是否完整。", -1)),
                  _createElementVNode("button", {
                    class: "primary",
                    disabled: loading.value,
                    onClick: auditOrganization
                  }, _toDisplayString(loading.value ? '官方审计中…' : '重新生成官方预览'), 9, _hoisted_34),
                  (audit.value)
                    ? (_openBlock(), _createElementBlock("section", _hoisted_35, [
                        _createElementVNode("div", _hoisted_36, [
                          _createElementVNode("span", null, [
                            _cache[15] || (_cache[15] = _createTextVNode("命中旧成功记录 ", -1)),
                            _createElementVNode("b", null, _toDisplayString(audit.value.history?.history_count || 0), 1)
                          ]),
                          _createElementVNode("span", null, [
                            _cache[16] || (_cache[16] = _createTextVNode("预览文件 ", -1)),
                            _createElementVNode("b", null, _toDisplayString(audit.value.preview?.summary?.total || audit.value.preview?.items?.length || 0), 1)
                          ]),
                          _createElementVNode("span", null, [
                            _cache[17] || (_cache[17] = _createTextVNode("可创建 ", -1)),
                            _createElementVNode("b", null, _toDisplayString(audit.value.preview?.summary?.success || 0), 1)
                          ]),
                          _createElementVNode("span", null, [
                            _cache[18] || (_cache[18] = _createTextVNode("预览失败 ", -1)),
                            _createElementVNode("b", null, _toDisplayString(audit.value.preview?.summary?.failed || 0), 1)
                          ])
                        ]),
                        _createElementVNode("p", null, _toDisplayString(audit.value.target?.target_path ? '当前目录规则给出了唯一目标，且已用于本次预览。' : '当前目录规则没有给出唯一目标。'), 1),
                        (audit.value.issues.length)
                          ? (_openBlock(), _createElementBlock("p", _hoisted_37, "已锁定执行：" + _toDisplayString(audit.value.issues.join('；')), 1))
                          : (_openBlock(), _createElementBlock("p", _hoisted_38, "预览完整：MoviePilot 负责清理命中的旧硬链接并创建新硬链接；来源文件不会被插件直接改动。")),
                        _createElementVNode("button", {
                          class: "primary",
                          disabled: loading.value || !audit.value.eligible,
                          onClick: _cache[3] || (_cache[3] = $event => (confirmRepair.value = true))
                        }, "确认重整此包", 8, _hoisted_39)
                      ]))
                    : _createCommentVNode("", true)
                ], 64))
          ])
        ]))
      : _createCommentVNode("", true),
    (confirmRepair.value)
      ? (_openBlock(), _createElementBlock("div", _hoisted_40, [
          _createElementVNode("section", _hoisted_41, [
            _cache[21] || (_cache[21] = _createElementVNode("p", { class: "eyebrow" }, "最后确认", -1)),
            _cache[22] || (_cache[22] = _createElementVNode("h2", null, "确认由 MoviePilot 重整？", -1)),
            _cache[23] || (_cache[23] = _createElementVNode("p", null, "将按照刚才的官方预览处理旧成功硬链接并创建新硬链接。插件不会自行删除、移动、改名或覆盖来源文件。", -1)),
            _createElementVNode("button", {
              class: "secondary",
              disabled: loading.value,
              onClick: _cache[5] || (_cache[5] = $event => (confirmRepair.value = false))
            }, "返回预览", 8, _hoisted_42),
            _createElementVNode("button", {
              class: "danger",
              disabled: loading.value,
              onClick: repair
            }, "确认执行官方重整", 8, _hoisted_43)
          ])
        ]))
      : _createCommentVNode("", true)
  ]))
}
}

};
const AppPage = /*#__PURE__*/_export_sfc(_sfc_main, [['__scopeId',"data-v-32446140"]]);

export { AppPage as default };
