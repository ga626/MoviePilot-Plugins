import { importShared } from './__federation_fn_import-JrT3xvdd.js';
import { _ as _export_sfc } from './_plugin-vue_export-helper-pcqpp-6-.js';

const clean = value => String(value || '').trim();
const unique = values => [...new Set(values.filter(Boolean))];
const pathKey = value => {
  const normalized = clean(value).replace(/\\/g, '/').replace(/\/+/g, '/');
  return (normalized === '/' ? normalized : normalized.replace(/\/$/, '')).toLowerCase()
};

function pathRelationship(left, right) {
  const parent = pathKey(left), child = pathKey(right);
  if (!parent || !child) return 'unrelated'
  if (parent === child) return 'same'
  if (child.startsWith(`${parent}/`)) return 'ancestor'
  if (parent.startsWith(`${child}/`)) return 'descendant'
  return 'unrelated'
}

function bundleFamily(value) {
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

function dedupeRoots(roots) {
  const accepted = [], skipped = [];
  for (const root of [...roots].sort((a, b) => pathKey(a?.path).length - pathKey(b?.path).length)) {
    const candidate = pathKey(root?.path);
    if (!candidate) continue
    const duplicate = accepted.find(item => {
      const parent = pathKey(item?.path);
      return String(item?.storage || 'local') === String(root?.storage || 'local') && (candidate === parent || candidate.startsWith(`${parent}/`))
    });
    if (duplicate) skipped.push(root);
    else accepted.push(root);
  }
  return { roots: accepted, skipped }
}

function episodeAudit(episodes = []) {
  const values = episodes.map(Number).filter(value => Number.isInteger(value) && value > 0).sort((a, b) => a - b);
  const duplicates = unique(values.filter((value, index) => values.indexOf(value) !== index));
  const known = unique(values);
  const missing = known.length > 1 ? Array.from({ length: known.at(-1) - known[0] + 1 }, (_, index) => known[0] + index).filter(value => !known.includes(value)) : [];
  return { episodes: known, duplicates, missing }
}

// A partial season is normal: the library may intentionally contain only the
// episodes that have been downloaded.  The scanner may only raise a structural
// alarm for a duplicate episode that was parsed from different video files, or
// for a still-active official transfer failure.  Names, history and gaps remain
// evidence for the later review, never an alarm on their own.
function initialIssueSignals({ activeFailure = false, duplicateEpisodes = [] } = {}) {
  const issues = [];
  if (activeFailure) issues.push('此当前包仍只有失败整理记录，没有对应成功记录，需要官方预览核验');
  if (duplicateEpisodes.length) issues.push(`不同视频文件重复标为同一集：${duplicateEpisodes.join('、')}`);
  return issues
}

function strictEpisodeHints(name) {
  const value = clean(name);
  const season = value.match(/(?:^|[. _-])s\d{1,2}[. _-]*e(\d{1,3})(?:[. _-]*e(\d{1,3}))?(?=$|[. _-])/i);
  if (season) return [Number(season[1]), ...(season[2] ? [Number(season[2])] : [])]
  const episode = value.match(/(?:^|[. _-])(?:ep|e)(\d{1,3})(?=$|[. _-]|\.[a-z0-9]{2,5}$)/i);
  if (episode) return [Number(episode[1])]
  const anime = value.match(/\[(\d{1,3})\](?=\.[a-z0-9]{2,5}$)/i);
  return anime ? [Number(anime[1])] : []
}

function candidateFamily(candidate = {}) {
  return [clean(candidate.title || candidate.original_title).toLowerCase(), clean(candidate.year), clean(candidate.type_name).toLowerCase(), Number(candidate.episodeCount) || ''].join(':')
}

function resolveIdentity(candidates = [], diagnosis = {}) {
  if (diagnosis?.classification === 'sample' || diagnosis?.classification === 'test') return { state: 'non_media', candidates: [], reason: '包被识别为样片或测试残留。' }
  const first = candidates[0];
  const families = new Map();
  for (const candidate of candidates) {
    const key = candidateFamily(candidate);
    const current = families.get(key);
    if (!current || Number(candidate.score) > Number(current.score)) families.set(key, candidate);
  }
  const competitors = [...families.values()].sort((a, b) => Number(b.score) - Number(a.score));
  const second = competitors.find(candidate => candidate !== first);
  if (!first) return { state: 'insufficient', candidates, reason: diagnosis?.abstain ? '模型放弃判断，且官方数据源没有可核验候选。' : '完整包证据已读取，但没有可核验候选。' }
  if (Number(first.score) >= 9 && !(first.conflicts || []).length && (!second || Number(first.score) - Number(second.score) >= 3)) return { state: 'confirmed', identity: first, candidates, reason: '候选经过标题、类型、年份和集数的交叉核验。' }
  return { state: 'needs_selection', candidates, reason: first.conflicts?.[0] || '仍有接近候选，必须查看详细资料后确认。' }
}

function organizationAudit({ evidence = {}, identity = {}, diagnosis = {} } = {}) {
  const issues = [];
  if (!identity?.title) return ['作品身份未确认，不能判断现有目录是否正确']
  const type = clean(identity.type_name).toLowerCase();
  const audit = episodeAudit(evidence.episodes);
  const expected = Math.max(0, ...(diagnosis.expected_episodes || []), ...audit.episodes);
  if (/(tv|电视剧|剧集|series)/i.test(type) && expected > 1 && identity.episodeCount && identity.episodeCount < expected) issues.push(`目录含第 ${expected} 集，但所选作品只有 ${identity.episodeCount} 集`);
  if (/(tv|电视剧|剧集|series)/i.test(type) && identity.episodeCount && Number(evidence.videos) > identity.episodeCount) issues.push(`${evidence.videos} 个视频多于作品总集数 ${identity.episodeCount}`);
  const duplicates = unique([...audit.duplicates, ...(evidence.duplicateEpisodes || [])]);
  if (duplicates.length) issues.push(`发现重复集号：${duplicates.join('、')}`);
  return issues
}

function fixture(id, label, input, expected) {
  const actual = id === 'sample' ? resolveIdentity([], { classification: 'sample' }).state
    : id === 'empty' ? resolveIdentity([], { abstain: true }).state
      : id === 'conflict' ? resolveIdentity(input.candidates, {}).state
        : id === 'confirmed' ? resolveIdentity(input.candidates, {}).state
          : organizationAudit(input).length ? 'locked' : 'clear';
  return { id, label, input, expected, actual, pass: actual === expected }
}

function acceptanceFixtures() {
  return [
    fixture('confirmed', '正常单季', { candidates: [{ title: '示例剧', year: '2024', type_name: 'tv', episodeCount: 12, score: 12, conflicts: [] }] }, 'confirmed'),
    fixture('conflict', '动画与真人版冲突', { candidates: [{ title: 'Cowboy Bebop', year: '1998', type_name: 'tv', episodeCount: 26, score: 10, conflicts: [] }, { title: 'Cowboy Bebop', year: '2021', type_name: 'tv', episodeCount: 10, score: 8, conflicts: [] }] }, 'needs_selection'),
    fixture('sample', '样片或测试残留', {}, 'non_media'),
    fixture('empty', '无可靠候选', {}, 'insufficient'),
    fixture('partial', '部分下载不是整理错误', { evidence: { episodes: [1, 2, 4], videos: 3 }, identity: { title: '示例剧', type_name: 'tv', episodeCount: 12 }, diagnosis: {} }, 'clear'),
    fixture('duplicate', '重复集审计', { evidence: { episodes: [1, 2, 2], videos: 3 }, identity: { title: '示例剧', type_name: 'tv', episodeCount: 2 }, diagnosis: {} }, 'locked'),
  ]
}

const {createElementVNode:_createElementVNode,vModelSelect:_vModelSelect,withDirectives:_withDirectives,createTextVNode:_createTextVNode,toDisplayString:_toDisplayString,openBlock:_openBlock,createElementBlock:_createElementBlock,createCommentVNode:_createCommentVNode,normalizeStyle:_normalizeStyle,normalizeClass:_normalizeClass,renderList:_renderList,Fragment:_Fragment,withModifiers:_withModifiers} = await importShared('vue');


const _hoisted_1 = { class: "governor-page" };
const _hoisted_2 = { class: "hero" };
const _hoisted_3 = { class: "actions" };
const _hoisted_4 = { class: "limit" };
const _hoisted_5 = ["disabled"];
const _hoisted_6 = ["disabled"];
const _hoisted_7 = {
  class: "progress",
  "aria-live": "polite"
};
const _hoisted_8 = { class: "progress-head" };
const _hoisted_9 = { class: "track" };
const _hoisted_10 = { key: 0 };
const _hoisted_11 = { class: "stats" };
const _hoisted_12 = { class: "scope" };
const _hoisted_13 = { class: "scope-grid" };
const _hoisted_14 = {
  key: 0,
  class: "reason"
};
const _hoisted_15 = {
  key: 0,
  class: "notice",
  role: "status"
};
const _hoisted_16 = { class: "tabs" };
const _hoisted_17 = {
  key: 1,
  class: "panel"
};
const _hoisted_18 = { class: "section-head" };
const _hoisted_19 = { class: "chip" };
const _hoisted_20 = {
  key: 0,
  class: "source-status"
};
const _hoisted_21 = {
  key: 1,
  class: "empty"
};
const _hoisted_22 = { class: "state" };
const _hoisted_23 = { key: 0 };
const _hoisted_24 = ["onClick"];
const _hoisted_25 = {
  key: 2,
  class: "panel"
};
const _hoisted_26 = {
  key: 0,
  class: "empty"
};
const _hoisted_27 = { class: "state" };
const _hoisted_28 = { key: 0 };
const _hoisted_29 = { key: 1 };
const _hoisted_30 = ["onClick"];
const _hoisted_31 = ["onClick"];
const _hoisted_32 = {
  key: 3,
  class: "panel"
};
const _hoisted_33 = { class: "section-head" };
const _hoisted_34 = { class: "chip" };
const _hoisted_35 = { class: "state" };
const _hoisted_36 = { class: "modal" };
const _hoisted_37 = { key: 0 };
const _hoisted_38 = {
  key: 1,
  class: "diagnosis"
};
const _hoisted_39 = { key: 0 };
const _hoisted_40 = { key: 1 };
const _hoisted_41 = { key: 2 };
const _hoisted_42 = { key: 2 };
const _hoisted_43 = { key: 3 };
const _hoisted_44 = {
  key: 4,
  class: "candidate-list"
};
const _hoisted_45 = { class: "candidate-meta" };
const _hoisted_46 = {
  key: 0,
  class: "reason"
};
const _hoisted_47 = ["onClick"];
const _hoisted_48 = {
  key: 5,
  class: "empty"
};
const _hoisted_49 = ["disabled"];
const _hoisted_50 = {
  key: 0,
  class: "audit"
};
const _hoisted_51 = { class: "audit-grid" };
const _hoisted_52 = {
  key: 0,
  class: "reason"
};
const _hoisted_53 = {
  key: 1,
  class: "safe"
};

const {computed,ref} = await importShared('vue');


const _sfc_main = {
  __name: 'AppPage',
  props: { api: { type: Object, default: () => ({}) } },
  setup(__props) {

const props = __props;
const tab = ref('identity'), loading = ref(false), notice = ref(''), cards = ref([]), selected = ref(null), preview = ref(null), sources = ref([]), scope = ref(emptyScope()), run = ref(emptyRun()), control = ref({ paused: false, stopped: false }), scopeLimit = ref(180);
let resumeWaiter = null, clock = null;
const pageSize = 100, workers = 6, inventoryWorkers = 12, inventoryNodeLimit = 4000, videoExt = /\.(mkv|mp4|avi|m2ts|ts|mov|webm)$/i, subtitleExt = /\.(ass|ssa|srt|sub|vtt)$/i;
const canUseApi = computed(() => typeof props.api?.get === 'function' && typeof props.api?.post === 'function');
const progress = computed(() => run.value.total ? Math.round(run.value.completed * 100 / run.value.total) : 0);
const elapsed = computed(() => { if (!run.value.startedAt) return '0 秒'; const s = Math.round(((run.value.finishedAt || Date.now()) - run.value.startedAt) / 1000); return s < 60 ? `${s} 秒` : `${Math.floor(s / 60)} 分 ${s % 60} 秒` });
const hasRun = computed(() => Boolean(run.value.startedAt));
computed(() => cards.value.filter(card => card.state === 'confirmed'));
const organizationCards = computed(() => cards.value.filter(card => card.evidence || card.state === 'unavailable'));
const fixtures = computed(() => acceptanceFixtures());
const dataOf = value => value?.data ?? value;
const safe = value => String(value || '').replace(/[\\/]/g, '').replace(/\s+/g, ' ').trim().slice(0, 180);
const unique = values => [...new Set(values.filter(Boolean))];
const number = value => Number(value) || 0;
function emptyScope() { return { failure: 0, success: 0, recovered: 0, currentFailures: 0, unavailable: [], directories: 0, inventoryPackages: 0, fastClear: 0, verificationQueue: 0, inventoryState: '尚未读取' } }
function emptyRun() { return { phase: '尚未开始', total: 0, completed: 0, current: '', startedAt: 0, finishedAt: 0, stats: { confirmed: 0, selection: 0, insufficient: 0, nonMedia: 0, unavailable: 0, clear: 0 } } }
function cleanTitle(value) { return safe(value).replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[\[\]【】()]/g, ' ').replace(/[._-]+/g, ' ').replace(/\b(2160p|1080p|720p|web[ .-]?dl|web[ .-]?rip|bluray|bdrip|remux|x26[45]|h\.?26[45]|hevc|aac|dts|atmos|hdr10?\+?|dv|10bit|proper|repack|complete|中字|简繁|国语|粤语|flac|truehd|ddp?|bdrip)\b/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) }
const norm = value => cleanTitle(value).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const useful = value => { const name = norm(value); return name.length >= 3 && !/^(movie|video|sample|test|unknown|第?[0-9]+集?)$/i.test(name) };
const itemKey = item => `${item?.storage || 'local'}:${item?.path || item?.name || ''}`;
const candidateKey = candidate => `${candidate.media_source}:${candidate.media_id}:${candidate.type_name}`;
function evidenceText(e) { const result = [`${e.videos} 个视频`, `${e.subtitles} 个字幕`]; if (e.nfos) result.push(`${e.nfos} 个 NFO`); if (e.episodes.length) result.push(`集号 ${e.episodes.join('、')}`); return result.join('，') }
function candidateNames(c) { return unique([c.title, c.original_title, c.en_title, ...(c.names || [])]) }
function candidateMeta(c) { return [c.type_name, c.year, c.season ? `第 ${c.season} 季` : '', c.episodeCount ? `${c.episodeCount} 集` : '', `来源：${c.media_source}`].filter(Boolean).join(' · ') }

async function historyRows(status, label) { const rows = []; for (let page = 1; ; page += 1) { const raw = dataOf(await props.api.get(`history/transfer?status=${status}&page=${page}&count=${pageSize}`, { feedback: 'silent' })); if (raw?.success === false) throw new Error(raw.message || `无法读取${label}`); const data = raw?.data ?? raw, batch = data?.items || data?.list || data?.data || []; if (!Array.isArray(batch)) return rows; rows.push(...batch); if (batch.length < pageSize) return rows } }
async function readSources() { try { const raw = dataOf(await props.api.get('media/source', { feedback: 'silent' })); sources.value = (Array.isArray(raw) ? raw : []).map(item => ({ id: String(item?.media_source || item?.source || ''), label: safe(item?.name || item?.title || item?.media_source || item?.source), state: '待查询', hits: 0 })).filter(item => item.id); } catch { sources.value = [{ id: '', label: '媒体数据源清单不可读取', state: '不可用', hits: 0 }]; } }
async function readDirectories() { try { const raw = dataOf(await props.api.get('storage/directories?directory_type=all', { feedback: 'silent' })); const list = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : []; scope.value.directories = list.length; const roots = []; for (const item of list) { if (item?.library_path) roots.push({ type: 'dir', path: item.library_path, storage: item.library_storage || 'local', name: item.name || '媒体库', role: '媒体库' }); if (item?.download_path) roots.push({ type: 'dir', path: item.download_path, storage: item.storage || 'local', name: item.name || '下载目录', role: '下载目录' }); } const result = dedupeRoots(roots); if (result.skipped.length) scope.value.unavailable.push(`已合并 ${result.skipped.length} 个重叠扫描根目录，避免同一作品重复检查。`); return result.roots } catch { scope.value.unavailable.push('实际库存：当前账号无权读取已配置媒体库和下载目录，无法把历史当作库存。'); scope.value.inventoryState = '无读取权限，未扫描库存'; return [] } }
function packageRoot(row) { const source = row?.src_fileitem || row?.source_fileitem || row?.fileitem; if (!source?.path) return null; if (source.type === 'dir') return source; const path = String(source.path), cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')); return cut > 0 ? { ...source, path: path.slice(0, cut), type: 'dir', children: [] } : null }
function packageKey(row) { const root = packageRoot(row), source = row?.src_fileitem || row?.source_fileitem || row?.fileitem, family = source?.type === 'dir' ? '' : bundleFamily(source?.name); return root?.path ? `${itemKey(root)}${family ? `#${family}` : ''}` : `history:${row?.id || crypto.randomUUID()}` }
function groupsFor(rows) { const map = new Map(); for (const row of rows) { const key = packageKey(row), source = row?.src_fileitem || row?.source_fileitem || row?.fileitem, group = map.get(key) || { key, source, root: packageRoot(row), family: bundleFamily(source?.name), historyIds: [], titles: [], origin: '历史线索' }; group.historyIds.push(row?.id); if (row?.title) group.titles.push(cleanTitle(row.title)); map.set(key, group); } return map }
function mergeExactHistory(inventory, failureGroups) { const byKey = new Map(inventory.map(group => [group.key, group])); let broad = 0; for (const legacy of failureGroups.values()) { const exact = byKey.get(legacy.key), sameFamily = !exact && inventory.find(group => String(group.root?.storage || 'local') === String(legacy.root?.storage || 'local') && pathRelationship(legacy.root?.path, group.root?.path) === 'same' && group.family === legacy.family); const current = exact || sameFamily; if (current) { current.historyIds.push(...legacy.historyIds); current.titles = unique([...current.titles, ...legacy.titles]); current.origin = '当前库存 + 历史线索'; continue } const related = inventory.some(group => String(group.root?.storage || 'local') === String(legacy.root?.storage || 'local') && pathRelationship(legacy.root?.path, group.root?.path) !== 'unrelated'); if (related) broad += 1; } return { groups: inventory, broad } }
function inventoryKey(item) { return item?.path ? itemKey(item) : '' }
function fileFamily(item) { return bundleFamily(safe(item?.name)) || '__folder__' }
function groupsFromFiles(current, children) { const videos = children.filter(child => child?.type !== 'dir' && videoExt.test(safe(child?.name))); const byFamily = new Map(); for (const video of videos) { const family = fileFamily(video); const bucket = byFamily.get(family) || []; bucket.push(video); byFamily.set(family, bucket); } const split = byFamily.size > 1, base = inventoryKey(current.item), result = []; for (const [family, media] of byFamily) { const items = split ? children.filter(item => item?.type !== 'dir' && fileFamily(item) === family) : children.filter(item => item?.type !== 'dir'); const key = split ? `${base}#${family}` : base; if (key) result.push({ key, source: media[0], root: current.item, items, historyIds: [], titles: unique([cleanTitle(current.item?.name), family === '__folder__' ? '' : cleanTitle(family)]), origin: split ? '当前平铺目录（已按作品拆分）' : '当前媒体库', split, family }); } return result }
async function inventoryGroups(roots) { const found = new Map(), queue = roots.map(root => ({ item: root, depth: 0 })); let visited = 0, limited = false; const packageLimit = Math.max(20, Number(scopeLimit.value) || 180); while (queue.length) { if (visited >= inventoryNodeLimit || found.size >= packageLimit) { limited = true; break } const batch = queue.splice(0, inventoryWorkers), listings = await Promise.all(batch.map(async current => { try { return { current, children: dataOf(await props.api.post('storage/list', current.item, { feedback: 'silent' })) } } catch { return { current, children: null } } })); for (const { current, children } of listings) { if (!Array.isArray(children)) { scope.value.unavailable.push('有一个配置媒体库目录不可读取，未用历史记录替代它。'); continue } visited += children.length + 1; if (children.some(child => child?.type !== 'dir' && videoExt.test(safe(child?.name)))) { for (const group of groupsFromFiles(current, children)) { if (found.size >= packageLimit) { limited = true; break } if (!found.has(group.key)) found.set(group.key, group); } continue } for (const child of children) if (child?.type === 'dir') queue.push({ item: child, depth: current.depth + 1 }); } run.value.current = `正在建立库存：已读取 ${visited} 个目录项，发现 ${found.size} 个视频包`; if (limited) break } if (limited) scope.value.unavailable.push(`媒体库扫描达到 ${inventoryNodeLimit} 个目录项或 ${packageLimit} 个视频包上限；本轮结果明确是部分库存，不会假装全量。`); return [...found.values()] }
async function treeEvidence(group) { const children = group.items; if (!group.root || !Array.isArray(children)) return { ok: false, reason: '这条历史没有可验证的当前来源包，不能据此猜作品。' }; const entries = [], folderHints = [], names = [...group.titles, cleanTitle(group.source?.name)].filter(Boolean), episodeFiles = new Map(); let videos = 0, subtitles = 0, nfos = 0; const pathParts = String(group.root?.path || '').split(/[\\/]+/).filter(Boolean).slice(-3); pathParts.forEach(part => { const hint = cleanTitle(part); if (useful(hint)) folderHints.push(hint); }); for (const child of children) { const name = safe(child?.name); entries.push({ name, type: child?.type || 'file', depth: 1 }); if (name) names.push(cleanTitle(name)); if (videoExt.test(name)) { videos += 1; for (const episode of strictEpisodeHints(name)) { const files = episodeFiles.get(episode) || new Set(); files.add(name); episodeFiles.set(episode, files); } } else if (subtitleExt.test(name)) subtitles += 1; else if (/\.nfo$/i.test(name)) nfos += 1; } const episodes = [...episodeFiles.keys()], audit = episodeAudit(episodes), duplicateEpisodes = [...episodeFiles].filter(([, files]) => files.size > 1).map(([episode]) => episode).sort((left, right) => left - right), queries = unique([...folderHints, ...names.filter(useful)]).slice(0, 30); if (!videos) return { ok: false, reason: '当前来源包没有视频文件，不能作为影视作品核验。' }; return { ok: true, videos, subtitles, nfos, directories: 1, entries: entries.slice(0, 500), episodes: audit.episodes, duplicateEpisodes, queries, folderHints: unique(folderHints), fingerprint: `${group.key}:${entries.length}:${videos}:${subtitles}:${nfos}:${audit.episodes.join(',')}` } }
function candidateOf(raw, via, query) { const media = raw?.media_info || raw?.mediaInfo || raw?.media || raw || {}, meta = raw?.meta_info || raw?.metaInfo || {}, title = safe(media.title || media.name || meta.title), mediaSource = String(media.media_source || media.source || ''), mediaId = String(media.media_id || media.id || ''), type = String(media.type || media.mtype || meta.type || ''); if (!title || !mediaSource || !mediaId || !type) return null; return { title, original_title: safe(media.original_title || media.original_name), en_title: safe(media.en_title || media.english_title), names: unique([...(Array.isArray(media.names) ? media.names : []), ...(Array.isArray(media.aliases) ? media.aliases : [])].map(safe)), year: String(media.year || media.release_year || media.release_date || '').slice(0, 4), media_source: mediaSource, media_id: mediaId, type_name: type, season: number(media.season || media.season_number) || undefined, via: [via], queries: query ? [query] : [], reasons: [], conflicts: [], score: 0 } }
function mergeCandidate(a, b) { return !a ? b : { ...a, ...b, via: unique([...(a.via || []), ...(b.via || [])]), queries: unique([...(a.queries || []), ...(b.queries || [])]), names: unique([...(a.names || []), ...(b.names || [])]) } }
async function detailFor(c) { try { return dataOf(await props.api.get(`media/${encodeURIComponent(c.media_id)}?${new URLSearchParams({ media_source: c.media_source, type_name: c.type_name })}`, { feedback: 'silent' })) || {} } catch { return {} } }
function score(c, e) { const names = candidateNames(c).map(norm).filter(Boolean), hits = e.queries.filter(query => { const value = norm(query); return names.some(name => name === value || name.includes(value) || value.includes(name)) }); if (hits.length) { c.score += Math.min(8, hits.length * 2); c.reasons.push(`标题线索命中 ${hits.length} 条`); } else c.conflicts.push('候选标题与完整包名称线索没有交集'); if (c.via.some(item => item.includes('原生识别'))) { c.score += 3; c.reasons.push('MoviePilot 原生识别命中'); } const years = unique(e.queries.flatMap(query => query.match(/(?:19|20)\d{2}/g) || [])); if (years.length && c.year) { if (years.includes(c.year)) { c.score += 2; c.reasons.push('年份线索一致'); } else c.conflicts.push('年份线索冲突'); } }
function bundlePayload(group, evidence) { return { evidence: { title_hints: unique([...(group.titles || []), ...(evidence.queries || [])]).slice(0, 30), entries: evidence.entries.slice(0, 500), episodes: evidence.episodes, video_count: evidence.videos, subtitle_count: evidence.subtitles, nfo_count: evidence.nfos } } }
function diagnosisText(diagnosis) { if (!diagnosis) return '当前 MoviePilot 模型没有返回整包判断。'; if (diagnosis.classification === 'sample') return '模型判断这是样片，不参与作品匹配。'; if (diagnosis.classification === 'test') return '模型判断这是测试残留，不参与作品匹配。'; if (diagnosis.abstain) return '模型主动放弃判断；不会把它伪装成作品。'; return `模型判断：${diagnosis.title}${diagnosis.year ? `（${diagnosis.year}）` : ''}${diagnosis.season ? `，第 ${diagnosis.season} 季` : ''}，置信度 ${Math.round((diagnosis.confidence || 0) * 100)}%。` }
async function diagnoseBundle(group, evidence) { try { const raw = dataOf(await props.api.post('plugin/MediaGovernor/bundle_analyze', bundlePayload(group, evidence), { feedback: 'silent' })); if (raw?.success === false) return { error: raw.message || '模型没有完成整包分析。' }; return raw?.data?.diagnosis || raw?.diagnosis || { error: '模型没有返回结构化判断。' } } catch { return { error: '无法调用当前 MoviePilot 模型；仍会继续原生候选核验。' } } }
function searchPlan(e, diagnosis) { const aiTitles = diagnosis && !diagnosis.abstain ? [[diagnosis.title, diagnosis.year].filter(Boolean).join(' '), diagnosis.title, diagnosis.original_title] : []; return unique([...aiTitles, ...e.folderHints, ...e.queries].filter(useful)).slice(0, 1) }
function videoSource(source) { return source?.id && !/(music|audio)/i.test(source.id) && !/(音乐|音频)/.test(source.label || '') }
function candidateType(c) { return String(c.type_name || '').toLowerCase() }
function hardReject(c, e, diagnosis) { const type = candidateType(c); if (/(music|audio|音乐|音频)/i.test(type) || /(music|audio)/i.test(c.media_source)) return '候选来自音乐数据源，不参与影视包匹配'; if (diagnosis?.media_type === 'tv' && !/(tv|电视剧|剧集|series)/i.test(type)) return '整包判断为剧集，候选类型不符'; if (diagnosis?.media_type === 'movie' && !/(movie|电影|film)/i.test(type)) return '整包判断为电影，候选类型不符'; const expected = Math.max(0, ...(diagnosis?.expected_episodes || []), ...(e.episodes || [])); if (expected > 1 && c.episodeCount && c.episodeCount < expected) return `候选总集数 ${c.episodeCount} 小于来源已见第 ${expected} 集`; if (e.videos >= 3 && c.episodeCount && c.episodeCount < Math.ceil(e.videos * .8)) return `候选总集数 ${c.episodeCount} 与 ${e.videos} 个视频不符`; if (diagnosis?.year && c.year && diagnosis.year !== c.year) return '整包模型年份与官方候选冲突'; return '' }
async function nativeCandidateFor(group) { if (!group.source?.path) return null; try { return candidateOf(dataOf(await props.api.get(`media/recognize_file?path=${encodeURIComponent(group.source.path)}`, { feedback: 'silent' })), '来源文件原生识别', cleanTitle(group.source.name)) } catch { return null } }
function triageIssues(group, evidence) { return initialIssueSignals({ activeFailure: Boolean(group.historyIds?.length), duplicateEpisodes: evidence.duplicateEpisodes || [] }) }
async function candidatesFor(group, e, diagnosis, native) { const map = new Map(), add = c => { if (c) map.set(candidateKey(c), mergeCandidate(map.get(candidateKey(c)), c)); }; add(native); e.searchQueries = searchPlan(e, diagnosis); for (const query of e.searchQueries) { try { add(candidateOf(dataOf(await props.api.get(`media/recognize?title=${encodeURIComponent(query)}`, { feedback: 'silent' })), '包名原生识别', query)); } catch { /* Native lookup is optional. */ } } if (!map.size) { const fallbackSources = sources.value.filter(videoSource).filter(source => /(douban|themoviedb|bangumi|anilist|tvdb)/i.test(source.id)).sort((a, b) => Number(/douban|themoviedb/i.test(b.id)) - Number(/douban|themoviedb/i.test(a.id))).slice(0, 2); for (const query of e.searchQueries) for (const source of fallbackSources) { const params = new URLSearchParams({ title: query, type: 'media', count: '6', media_source: source.id }); try { const raw = dataOf(await props.api.get(`media/search?${params}`, { feedback: 'silent' })); const rows = Array.isArray(raw) ? raw.slice(0, 6) : []; rows.forEach(item => add(candidateOf(item, `官方搜索：${source.label}`, query))); source.hits += rows.length; source.state = rows.length ? '有结果' : source.state === '待查询' ? '无结果' : source.state; } catch { source.state = '不可用'; } } } const shortlist = [...map.values()].slice(0, 6); await Promise.all(shortlist.map(async c => { const d = await detailFor(c); c.original_title ||= safe(d.original_title || d.original_name); c.en_title ||= safe(d.en_title || d.english_title); c.names = unique([...(c.names || []), ...(Array.isArray(d.names) ? d.names : []), ...(Array.isArray(d.aliases) ? d.aliases : [])].map(safe)); c.year ||= String(d.year || d.release_year || d.release_date || '').slice(0, 4); c.episodeCount = number(d.number_of_episodes || d.episode_count) || undefined; score(c, e); if (diagnosis?.title && candidateNames(c).map(norm).some(name => name === norm(diagnosis.title))) { c.score += 4; c.reasons.push('整包模型判断与官方候选同名'); } const rejected = hardReject(c, e, diagnosis); if (rejected) c.rejection = rejected; })); e.rejectedCandidates = shortlist.filter(c => c.rejection).length; return shortlist.filter(c => !c.rejection).sort((a, b) => b.score - a.score) }
async function inspectGroup(group) { const evidence = await treeEvidence(group); if (!evidence.ok) return { ...group, state: 'unavailable', reason: evidence.reason }; const issues = triageIssues(group, evidence); if (!issues.length) return { ...group, state: 'clear', reason: '文件结构、目录名和集号没有发现异常；未调用模型或外部候选。', evidence, diagnosis: null }; const native = await nativeCandidateFor(group); let diagnosis = null, candidates = await candidatesFor(group, evidence, diagnosis, native), resolved = resolveIdentity(candidates, diagnosis); if (group.historyIds?.length || !native || resolved.state !== 'confirmed') { diagnosis = await diagnoseBundle(group, evidence); candidates = await candidatesFor(group, evidence, diagnosis, native); resolved = resolveIdentity(candidates, diagnosis); } return { ...group, ...resolved, state: resolved.state === 'confirmed' ? 'confirmed' : resolved.state, reason: `${issues.join('；')}。${diagnosisText(diagnosis)} ${resolved.reason}`, evidence, diagnosis } }
function organizationIssues(card) { if (!card?.evidence) return ['当前文件不可读，只能标记为历史残留或读取失败']; return organizationAudit({ evidence: card.evidence, identity: card.identity, diagnosis: card.diagnosis }) }
function addStat(card) { if (card.state === 'clear') { run.value.stats.clear += 1; scope.value.fastClear += 1; } else if (card.state === 'confirmed') run.value.stats.confirmed += 1; else if (card.state === 'needs_selection') run.value.stats.selection += 1; else if (card.state === 'insufficient') run.value.stats.insufficient += 1; else if (card.state === 'non_media') run.value.stats.nonMedia += 1; else run.value.stats.unavailable += 1; }
async function waitIfPaused() { while (control.value.paused && !control.value.stopped) await new Promise(resolve => { resumeWaiter = resolve; }); return !control.value.stopped }
function pause() { control.value.paused = true; run.value.phase = '已暂停：不再派发新包'; }
function resume() { control.value.paused = false; run.value.phase = '继续检查'; resumeWaiter?.(); resumeWaiter = null; }
function stop() { control.value.stopped = true; control.value.paused = false; run.value.phase = '正在停止：已发出的读取请求会结束'; resumeWaiter?.(); resumeWaiter = null; }
async function inspect() { if (!canUseApi.value || loading.value) { notice.value = '当前 MoviePilot 没有注入认证 API，无法安全检查。'; return } loading.value = true; cards.value = []; selected.value = null; preview.value = null; scope.value = emptyScope(); control.value = { paused: false, stopped: false }; run.value = { ...emptyRun(), phase: '正在读取当前媒体库存', startedAt: Date.now() }; clock = window.setInterval(() => { run.value = { ...run.value }; }, 1000); try { const [failed, successful, _sources, roots] = await Promise.all([historyRows(false, '失败整理历史'), historyRows(true, '成功整理历史'), readSources(), readDirectories()]); scope.value.failure = failed.length; scope.value.success = successful.length; const [inventory, failureGroups] = await Promise.all([inventoryGroups(roots), Promise.resolve(groupsFor(failed))]); const successKeys = new Set(successful.map(packageKey)), currentFailureGroups = new Map([...failureGroups].filter(([key]) => !successKeys.has(key))), merged = mergeExactHistory(inventory, currentFailureGroups), groups = merged.groups; if (merged.broad) scope.value.unavailable.push(`${merged.broad} 个当前失败历史指向宽泛父目录，只保留为线索，不再错误当作一个作品包扫描。`); scope.value.inventoryPackages = inventory.length; scope.value.recovered = failureGroups.size - currentFailureGroups.size; scope.value.currentFailures = currentFailureGroups.size; scope.value.inventoryState = roots.length ? `已从 ${roots.length} 个已配置媒体库/下载根目录建立当前库存；只把当前失败记录和不同文件的重复集号当作问题入口。` : '没有可读的配置媒体库或下载目录；未把历史伪装成库存。'; run.value.total = groups.length; run.value.phase = `范围已建立：当前库存 ${inventory.length} 包；开始核验，只对可证明的问题调用识别`; const queue = [...groups], worker = async () => { while (queue.length && await waitIfPaused()) { const group = queue.shift(); if (!group) return; run.value.current = `正在核验第 ${run.value.completed + 1}/${run.value.total} 个当前包`; let card; try { card = await inspectGroup(group); } catch { card = { ...group, state: 'unavailable', reason: '读取这个包时出现异常；没有进行任何文件操作。' }; } if (card.state !== 'clear') cards.value = [...cards.value, card]; run.value.completed += 1; addStat(card); } }; await Promise.all(Array.from({ length: Math.min(workers, groups.length) }, worker)); scope.value.verificationQueue = cards.value.length; run.value.finishedAt = Date.now(); if (control.value.stopped) notice.value = `已停止：完成 ${run.value.completed}/${run.value.total} 个包。已完成部分保留；全程零写入。`; else { run.value.phase = '检查完成'; notice.value = `已完成 ${run.value.completed} 个包：${scope.value.fastClear} 包自动通过，${cards.value.length} 包有可证明的问题待核验；全程零写入。`; } } catch (error) { run.value.phase = '检查未完成'; notice.value = error?.message || '无法建立当前媒体库存；没有改动文件。'; } finally { loading.value = false; if (clock) window.clearInterval(clock); clock = null; } }
function open(card, next = 'identity') { selected.value = card; preview.value = null; tab.value = next; }
function choose(candidate) { selected.value = { ...selected.value, state: 'confirmed', identity: candidate, userConfirmed: true, reason: '已由你确认作品；下一步只能生成官方零写入预览。' }; cards.value = cards.value.map(card => card.key === selected.value.key ? selected.value : card); }
function previewPayload(item, target = {}) { return { fileitem: item.source, logid: item.historyIds?.[0], transfer_type: target.transfer_type || 'link', target_storage: target.target_storage, target_path: target.target_path, scrape: target.scrape, library_type_folder: target.library_type_folder, library_category_folder: target.library_category_folder, preview: true, reorganize: false, media_source: item.identity.media_source, media_id: item.identity.media_id, type_name: item.identity.type_name, season: item.identity.season } }
function previewIssues(result, target) { const items = result?.items || [], summary = result?.summary || {}, issues = []; if (!target?.target_path || !target?.transfer_type) issues.push('当前目录规则没有给出唯一完整目标'); if (!items.length && !summary.total) issues.push('官方没有返回逐文件预览'); if (summary.failed || items.some(item => item?.success === false || !item?.target)) issues.push('官方预览存在失败或缺失目标'); const episodes = items.map(item => Number(item?.episode)).filter(Number.isFinite); if (new Set(episodes).size !== episodes.length) issues.push('官方预览包含重复集号'); return issues }
async function auditOrganization() { if (!selected.value?.identity || selected.value.state !== 'confirmed') return; loading.value = true; preview.value = null; try { const base = previewPayload(selected.value), [historyRaw, targetRaw] = await Promise.all([props.api.post('transfer/manual/history', base, { feedback: 'silent' }), props.api.post('transfer/manual/target-path', base, { feedback: 'silent' })]), history = dataOf(historyRaw), target = dataOf(targetRaw); if (history?.success === false || target?.success === false) throw new Error(history?.message || target?.message || '官方整理审计被拒绝'); const historyData = history?.data ?? history, targetData = target?.data ?? target, raw = dataOf(await props.api.post('transfer/manual', previewPayload(selected.value, targetData), { feedback: 'silent' })); if (raw?.success === false) throw new Error(raw.message || '官方预览被拒绝'); const data = raw?.data ?? raw; preview.value = { history: historyData || {}, target: targetData || {}, data: data || {}, issues: previewIssues(data, targetData), fingerprint: selected.value.evidence?.fingerprint }; notice.value = preview.value.issues.length ? '已生成官方逐文件预览，但发现冲突，不能进入写入。' : '官方逐文件预览完成。旧硬链接清理仍锁定：官方预览没有逐项删除清单。'; } catch (error) { notice.value = error?.message || '官方预览失败；没有改动文件。'; } finally { loading.value = false; } }

return (_ctx, _cache) => {
  return (_openBlock(), _createElementBlock("main", _hoisted_1, [
    _createElementVNode("header", _hoisted_2, [
      _cache[8] || (_cache[8] = _createElementVNode("div", null, [
        _createElementVNode("p", { class: "eyebrow" }, "MediaGovernor 1.8"),
        _createElementVNode("h1", null, "媒体治理工作台"),
        _createElementVNode("p", null, "只报告能证明的当前问题：未恢复的失败整理或不同视频文件的重复集号。目录名差异、部分下载和旧失败历史不会单独报警。")
      ], -1)),
      _createElementVNode("div", _hoisted_3, [
        _createElementVNode("label", _hoisted_4, [
          _cache[7] || (_cache[7] = _createTextVNode("本次最多检查", -1)),
          _withDirectives(_createElementVNode("select", {
            "onUpdate:modelValue": _cache[0] || (_cache[0] = $event => ((scopeLimit).value = $event)),
            disabled: loading.value
          }, [...(_cache[6] || (_cache[6] = [
            _createElementVNode("option", { value: 60 }, "60 个包", -1),
            _createElementVNode("option", { value: 180 }, "180 个包", -1),
            _createElementVNode("option", { value: 360 }, "360 个包", -1)
          ]))], 8, _hoisted_5), [
            [
              _vModelSelect,
              scopeLimit.value,
              void 0,
              { number: true }
            ]
          ])
        ]),
        _createElementVNode("button", {
          class: "primary",
          disabled: loading.value,
          onClick: inspect
        }, _toDisplayString(loading.value ? '检查进行中…' : hasRun.value ? '重新检查' : '开始检查'), 9, _hoisted_6),
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
    _createElementVNode("section", _hoisted_7, [
      _createElementVNode("div", _hoisted_8, [
        _createElementVNode("strong", null, _toDisplayString(run.value.phase), 1),
        _createElementVNode("span", null, _toDisplayString(run.value.completed) + "/" + _toDisplayString(run.value.total) + " 个当前包 · " + _toDisplayString(elapsed.value), 1)
      ]),
      _createElementVNode("div", _hoisted_9, [
        _createElementVNode("i", {
          style: _normalizeStyle({ width: `${progress.value}%` })
        }, null, 4)
      ]),
      (run.value.current)
        ? (_openBlock(), _createElementBlock("p", _hoisted_10, _toDisplayString(run.value.current) + "。先做本地结构筛查；只有可疑包才进入识别与候选核验。", 1))
        : _createCommentVNode("", true),
      _createElementVNode("div", _hoisted_11, [
        _createElementVNode("span", null, [
          _cache[9] || (_cache[9] = _createTextVNode("快速通过 ", -1)),
          _createElementVNode("b", null, _toDisplayString(run.value.stats.clear), 1)
        ]),
        _createElementVNode("span", null, [
          _cache[10] || (_cache[10] = _createTextVNode("已确认 ", -1)),
          _createElementVNode("b", null, _toDisplayString(run.value.stats.confirmed), 1)
        ]),
        _createElementVNode("span", null, [
          _cache[11] || (_cache[11] = _createTextVNode("待确认 ", -1)),
          _createElementVNode("b", null, _toDisplayString(run.value.stats.selection), 1)
        ]),
        _createElementVNode("span", null, [
          _cache[12] || (_cache[12] = _createTextVNode("资料不足 ", -1)),
          _createElementVNode("b", null, _toDisplayString(run.value.stats.insufficient), 1)
        ]),
        _createElementVNode("span", null, [
          _cache[13] || (_cache[13] = _createTextVNode("不可读取 ", -1)),
          _createElementVNode("b", null, _toDisplayString(run.value.stats.unavailable), 1)
        ])
      ])
    ]),
    _createElementVNode("section", _hoisted_12, [
      _cache[19] || (_cache[19] = _createElementVNode("h2", null, "这次到底查了什么", -1)),
      _createElementVNode("div", _hoisted_13, [
        _createElementVNode("span", null, [
          _cache[14] || (_cache[14] = _createTextVNode("当前库存包 ", -1)),
          _createElementVNode("b", null, _toDisplayString(scope.value.inventoryPackages), 1)
        ]),
        _createElementVNode("span", null, [
          _cache[15] || (_cache[15] = _createTextVNode("快速通过 ", -1)),
          _createElementVNode("b", null, _toDisplayString(scope.value.fastClear), 1)
        ]),
        _createElementVNode("span", null, [
          _cache[16] || (_cache[16] = _createTextVNode("需要查看 ", -1)),
          _createElementVNode("b", null, _toDisplayString(scope.value.verificationQueue), 1)
        ]),
        _createElementVNode("span", null, [
          _cache[17] || (_cache[17] = _createTextVNode("失败历史 ", -1)),
          _createElementVNode("b", null, _toDisplayString(scope.value.failure), 1)
        ]),
        _createElementVNode("span", null, [
          _cache[18] || (_cache[18] = _createTextVNode("成功历史 ", -1)),
          _createElementVNode("b", null, _toDisplayString(scope.value.success), 1)
        ])
      ]),
      _createElementVNode("p", null, "先扫描当前媒体库和下载目录，再把整理历史仅作为交叉线索。失败历史不是问题总数，也不会替代实际文件。" + _toDisplayString(scope.value.inventoryState), 1),
      (scope.value.unavailable.length)
        ? (_openBlock(), _createElementBlock("p", _hoisted_14, _toDisplayString(scope.value.unavailable.join('；')), 1))
        : _createCommentVNode("", true)
    ]),
    (notice.value)
      ? (_openBlock(), _createElementBlock("p", _hoisted_15, _toDisplayString(notice.value), 1))
      : _createCommentVNode("", true),
    _createElementVNode("nav", _hoisted_16, [
      _createElementVNode("button", {
        class: _normalizeClass({ active: tab.value === 'identity' }),
        onClick: _cache[1] || (_cache[1] = $event => (tab.value = 'identity'))
      }, "1. 找对作品", 2),
      _createElementVNode("button", {
        class: _normalizeClass({ active: tab.value === 'organize' }),
        onClick: _cache[2] || (_cache[2] = $event => (tab.value = 'organize'))
      }, "2. 整理正确", 2),
      _createElementVNode("button", {
        class: _normalizeClass({ active: tab.value === 'fixtures' }),
        onClick: _cache[3] || (_cache[3] = $event => (tab.value = 'fixtures'))
      }, "3. 验收样例", 2)
    ]),
    (tab.value === 'identity')
      ? (_openBlock(), _createElementBlock("section", _hoisted_17, [
          _createElementVNode("div", _hoisted_18, [
            _cache[20] || (_cache[20] = _createElementVNode("div", null, [
              _createElementVNode("h2", null, "找对作品"),
              _createElementVNode("p", null, "这里只显示有证据的问题包：未恢复的当前失败整理，或不同视频文件的重复集号。模型只负责补充找对作品，找对不等于问题。")
            ], -1)),
            _createElementVNode("span", _hoisted_19, "可用影视源 " + _toDisplayString(sources.value.filter(videoSource).length), 1)
          ]),
          (sources.value.length)
            ? (_openBlock(), _createElementBlock("details", _hoisted_20, [
                _cache[21] || (_cache[21] = _createElementVNode("summary", null, "查看数据源查询状态", -1)),
                (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(sources.value, (source) => {
                  return (_openBlock(), _createElementBlock("p", {
                    key: source.id || source.label
                  }, _toDisplayString(source.label) + "：" + _toDisplayString(source.state) + _toDisplayString(source.hits ? `（返回 ${source.hits} 条）` : ''), 1))
                }), 128))
              ]))
            : _createCommentVNode("", true),
          (!cards.value.length)
            ? (_openBlock(), _createElementBlock("p", _hoisted_21, _toDisplayString(hasRun.value ? '没有发现可证明的问题包。' : '尚未读取。开始后只显示真正需要处理的包。'), 1))
            : _createCommentVNode("", true),
          (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(cards.value, (card) => {
            return (_openBlock(), _createElementBlock("article", {
              key: card.key,
              class: _normalizeClass(["card", card.state])
            }, [
              _createElementVNode("div", null, [
                _createElementVNode("span", _hoisted_22, _toDisplayString(card.state === 'confirmed' ? '作品已确认，待官方预览核验' : card.state === 'needs_selection' ? '问题已确认，待选择作品' : card.state === 'insufficient' ? '问题已确认，资料不足' : card.state === 'non_media' ? '样片或测试残留' : '来源不可读取或当前失败残留'), 1),
                _createElementVNode("h3", null, _toDisplayString(card.identity?.title || (card.state === 'non_media' ? '不是待整理正片' : '还没有可靠作品身份')) + _toDisplayString(card.identity?.year ? `（${card.identity.year}）` : ''), 1),
                (card.evidence)
                  ? (_openBlock(), _createElementBlock("p", _hoisted_23, _toDisplayString(evidenceText(card.evidence)) + "；已读 " + _toDisplayString(card.evidence.directories) + " 个目录节点、" + _toDisplayString(card.evidence.entries.length) + " 项名称证据。", 1))
                  : _createCommentVNode("", true),
                _createElementVNode("p", null, _toDisplayString(card.reason), 1)
              ]),
              _createElementVNode("button", {
                class: "secondary",
                onClick: $event => (open(card))
              }, "查看完整依据与候选", 8, _hoisted_24)
            ], 2))
          }), 128))
        ]))
      : (tab.value === 'organize')
        ? (_openBlock(), _createElementBlock("section", _hoisted_25, [
            _cache[22] || (_cache[22] = _createElementVNode("div", { class: "section-head" }, [
              _createElementVNode("div", null, [
                _createElementVNode("h2", null, "整理正确"),
                _createElementVNode("p", null, "这里只核对已被证据筛出的当前问题包。确认作品后再请求官方逐文件预览；目录名不同或部分下载不会被当成错误，旧硬链接删除仍锁定。")
              ]),
              _createElementVNode("span", { class: "chip" }, "只读对账")
            ], -1)),
            (!organizationCards.value.length)
              ? (_openBlock(), _createElementBlock("p", _hoisted_26, "本轮没有可证明的问题包需要整理核验。"))
              : _createCommentVNode("", true),
            (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(organizationCards.value, (card) => {
              return (_openBlock(), _createElementBlock("article", {
                key: card.key,
                class: _normalizeClass(["card", { confirmed: card.identity, needs_selection: !card.identity }])
              }, [
                _createElementVNode("div", null, [
                  _createElementVNode("span", _hoisted_27, _toDisplayString(card.identity ? '正在核对当前整理结构' : '身份未确认，整理核验锁定'), 1),
                  _createElementVNode("h3", null, _toDisplayString(card.identity?.title || '尚无可靠作品身份') + _toDisplayString(card.identity?.year ? `（${card.identity.year}）` : ''), 1),
                  (card.evidence)
                    ? (_openBlock(), _createElementBlock("p", _hoisted_28, _toDisplayString(evidenceText(card.evidence)) + "。" + _toDisplayString(organizationIssues(card).length ? organizationIssues(card).join('；') : '尚未发现可由当前只读证据证明的额外冲突；仍可生成官方预览。'), 1))
                    : (_openBlock(), _createElementBlock("p", _hoisted_29, _toDisplayString(card.reason), 1))
                ]),
                (card.state === 'confirmed')
                  ? (_openBlock(), _createElementBlock("button", {
                      key: 0,
                      class: "primary",
                      onClick: $event => {open(card, 'organize'); auditOrganization();}
                    }, "生成官方逐文件预览", 8, _hoisted_30))
                  : (_openBlock(), _createElementBlock("button", {
                      key: 1,
                      class: "secondary",
                      onClick: $event => (open(card, 'identity'))
                    }, "先核对作品身份", 8, _hoisted_31))
              ], 2))
            }), 128))
          ]))
        : (_openBlock(), _createElementBlock("section", _hoisted_32, [
            _createElementVNode("div", _hoisted_33, [
              _cache[23] || (_cache[23] = _createElementVNode("div", null, [
                _createElementVNode("h2", null, "验收样例"),
                _createElementVNode("p", null, "这些是脱敏固定样例。它们调用与实际检查相同的分包、候选确认和整理审计规则，不读取 NAS，也不调用模型。")
              ], -1)),
              _createElementVNode("span", _hoisted_34, _toDisplayString(fixtures.value.filter(item => item.pass).length) + "/" + _toDisplayString(fixtures.value.length) + " 通过", 1)
            ]),
            (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(fixtures.value, (fixture) => {
              return (_openBlock(), _createElementBlock("article", {
                key: fixture.id,
                class: _normalizeClass(["card", fixture.pass ? 'confirmed' : 'insufficient'])
              }, [
                _createElementVNode("div", null, [
                  _createElementVNode("span", _hoisted_35, _toDisplayString(fixture.pass ? '通过' : '失败'), 1),
                  _createElementVNode("h3", null, _toDisplayString(fixture.label), 1),
                  _createElementVNode("p", null, "正确答案：" + _toDisplayString(fixture.expected) + "；实际结果：" + _toDisplayString(fixture.actual), 1)
                ]),
                _createElementVNode("p", null, _toDisplayString(fixture.pass ? '规则结果与预期一致。' : '规则结果与预期不一致；本版本不能进入候选安装。'), 1)
              ], 2))
            }), 128))
          ])),
    (selected.value)
      ? (_openBlock(), _createElementBlock("div", {
          key: 4,
          class: "backdrop",
          onClick: _cache[5] || (_cache[5] = _withModifiers($event => (selected.value = null), ["self"]))
        }, [
          _createElementVNode("section", _hoisted_36, [
            _createElementVNode("button", {
              class: "close",
              "aria-label": "关闭",
              onClick: _cache[4] || (_cache[4] = $event => (selected.value = null))
            }, "×"),
            (tab.value === 'identity')
              ? (_openBlock(), _createElementBlock(_Fragment, { key: 0 }, [
                  _cache[25] || (_cache[25] = _createElementVNode("p", { class: "eyebrow" }, "完整证据账本", -1)),
                  _createElementVNode("h2", null, _toDisplayString(selected.value.identity?.title || '候选核验'), 1),
                  (selected.value.evidence)
                    ? (_openBlock(), _createElementBlock("p", _hoisted_37, _toDisplayString(evidenceText(selected.value.evidence)) + "。已读取 " + _toDisplayString(selected.value.evidence.entries.length) + " 个目录项，证据指纹 " + _toDisplayString(selected.value.evidence.fingerprint) + "。", 1))
                    : _createCommentVNode("", true),
                  _createElementVNode("p", null, _toDisplayString(selected.value.reason), 1),
                  (selected.value.diagnosis)
                    ? (_openBlock(), _createElementBlock("section", _hoisted_38, [
                        _cache[24] || (_cache[24] = _createElementVNode("strong", null, "整包模型判断", -1)),
                        _createElementVNode("p", null, _toDisplayString(diagnosisText(selected.value.diagnosis)), 1),
                        (selected.value.diagnosis.reasons?.length)
                          ? (_openBlock(), _createElementBlock("p", _hoisted_39, "理由：" + _toDisplayString(selected.value.diagnosis.reasons.join('；')), 1))
                          : _createCommentVNode("", true),
                        (selected.value.diagnosis.expected_episodes?.length)
                          ? (_openBlock(), _createElementBlock("p", _hoisted_40, "模型预期集号：" + _toDisplayString(selected.value.diagnosis.expected_episodes.join('、')), 1))
                          : _createCommentVNode("", true),
                        (selected.value.diagnosis.evidence_indexes?.length)
                          ? (_openBlock(), _createElementBlock("p", _hoisted_41, "支持它的目录项编号：" + _toDisplayString(selected.value.diagnosis.evidence_indexes.map(index => index + 1).join('、')), 1))
                          : _createCommentVNode("", true)
                      ]))
                    : _createCommentVNode("", true),
                  (selected.value.evidence)
                    ? (_openBlock(), _createElementBlock("details", _hoisted_42, [
                        _createElementVNode("summary", null, "查看名称线索（" + _toDisplayString(selected.value.evidence.queries.length) + " 条）", 1),
                        _createElementVNode("p", null, _toDisplayString(selected.value.evidence.queries.join('；') || '没有可用线索'), 1)
                      ]))
                    : _createCommentVNode("", true),
                  (selected.value.evidence)
                    ? (_openBlock(), _createElementBlock("details", _hoisted_43, [
                        _createElementVNode("summary", null, "查看发送给模型的目录结构（" + _toDisplayString(selected.value.evidence.entries.length) + " 项）", 1),
                        _createElementVNode("ul", null, [
                          (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(selected.value.evidence.entries, (entry, index) => {
                            return (_openBlock(), _createElementBlock("li", {
                              key: `${entry.name}-${index}`
                            }, _toDisplayString('　'.repeat(entry.depth || 0)) + _toDisplayString(entry.type === 'dir' ? '📁' : '📄') + " " + _toDisplayString(entry.name), 1))
                          }), 128))
                        ])
                      ]))
                    : _createCommentVNode("", true),
                  (selected.value.candidates?.length)
                    ? (_openBlock(), _createElementBlock("div", _hoisted_44, [
                        (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(selected.value.candidates, (candidate) => {
                          return (_openBlock(), _createElementBlock("article", {
                            key: candidateKey(candidate),
                            class: _normalizeClass(["candidate", { conflicted: candidate.conflicts?.length }])
                          }, [
                            _createElementVNode("div", null, [
                              _createElementVNode("strong", null, _toDisplayString(candidate.title) + _toDisplayString(candidate.year ? `（${candidate.year}）` : ''), 1),
                              _createElementVNode("p", null, _toDisplayString(candidate.original_title ? `原名：${candidate.original_title}` : '原名：未返回') + _toDisplayString(candidate.en_title ? `；英文：${candidate.en_title}` : ''), 1),
                              _createElementVNode("p", _hoisted_45, _toDisplayString(candidateMeta(candidate)), 1),
                              _createElementVNode("p", null, "检索线索：" + _toDisplayString(candidate.queries?.join('；') || '原生文件识别') + "。支持：" + _toDisplayString(candidate.reasons?.join('；') || '只有官方搜索命中'), 1),
                              (candidate.conflicts?.length)
                                ? (_openBlock(), _createElementBlock("p", _hoisted_46, "冲突：" + _toDisplayString(candidate.conflicts.join('；')), 1))
                                : _createCommentVNode("", true)
                            ]),
                            _createElementVNode("button", {
                              class: "secondary",
                              onClick: $event => (choose(candidate))
                            }, "确认是这部", 8, _hoisted_47)
                          ], 2))
                        }), 128))
                      ]))
                    : (_openBlock(), _createElementBlock("p", _hoisted_48, "MoviePilot 没有返回候选；这不代表文件为空。"))
                ], 64))
              : (_openBlock(), _createElementBlock(_Fragment, { key: 1 }, [
                  _cache[30] || (_cache[30] = _createElementVNode("p", { class: "eyebrow" }, "官方逐文件预览", -1)),
                  _createElementVNode("h2", null, _toDisplayString(selected.value.identity?.title), 1),
                  _createElementVNode("button", {
                    class: "primary",
                    disabled: loading.value,
                    onClick: auditOrganization
                  }, _toDisplayString(loading.value ? '正在生成…' : '重新生成预览'), 9, _hoisted_49),
                  (preview.value)
                    ? (_openBlock(), _createElementBlock("section", _hoisted_50, [
                        _createElementVNode("div", _hoisted_51, [
                          _createElementVNode("span", null, [
                            _cache[26] || (_cache[26] = _createTextVNode("命中旧成功记录 ", -1)),
                            _createElementVNode("b", null, _toDisplayString(preview.value.history?.history_count || 0), 1)
                          ]),
                          _createElementVNode("span", null, [
                            _cache[27] || (_cache[27] = _createTextVNode("预览文件 ", -1)),
                            _createElementVNode("b", null, _toDisplayString(preview.value.data?.summary?.total || preview.value.data?.items?.length || 0), 1)
                          ]),
                          _createElementVNode("span", null, [
                            _cache[28] || (_cache[28] = _createTextVNode("可创建 ", -1)),
                            _createElementVNode("b", null, _toDisplayString(preview.value.data?.summary?.success || 0), 1)
                          ]),
                          _createElementVNode("span", null, [
                            _cache[29] || (_cache[29] = _createTextVNode("预览失败 ", -1)),
                            _createElementVNode("b", null, _toDisplayString(preview.value.data?.summary?.failed || 0), 1)
                          ])
                        ]),
                        (preview.value.issues.length)
                          ? (_openBlock(), _createElementBlock("p", _hoisted_52, "已锁定：" + _toDisplayString(preview.value.issues.join('；')), 1))
                          : (_openBlock(), _createElementBlock("p", _hoisted_53, "新硬链接预览完整，但仍不执行。当前 MoviePilot 不会在预览中给出旧硬链接的逐项删除清单，插件不能替它猜测或静默删除。")),
                        _createElementVNode("details", null, [
                          _createElementVNode("summary", null, "查看官方逐文件计划（" + _toDisplayString(preview.value.data?.items?.length || 0) + " 项）", 1),
                          _createElementVNode("ul", null, [
                            (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(preview.value.data?.items || [], (item, index) => {
                              return (_openBlock(), _createElementBlock("li", { key: index }, _toDisplayString(item?.title || selected.value.identity?.title) + " · " + _toDisplayString(item?.episode ? `第 ${item.episode} 集` : '影片/未标集') + " · " + _toDisplayString(item?.target ? '目标已生成' : '没有目标'), 1))
                            }), 128))
                          ])
                        ])
                      ]))
                    : _createCommentVNode("", true)
                ], 64))
          ])
        ]))
      : _createCommentVNode("", true)
  ]))
}
}

};
const AppPage = /*#__PURE__*/_export_sfc(_sfc_main, [['__scopeId',"data-v-702dd223"]]);

export { AppPage as default };
