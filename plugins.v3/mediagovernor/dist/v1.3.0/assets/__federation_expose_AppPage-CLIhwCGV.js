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
const _hoisted_8 = { key: 0 };
const _hoisted_9 = { class: "stats" };
const _hoisted_10 = { class: "scope" };
const _hoisted_11 = { class: "scope-grid" };
const _hoisted_12 = {
  key: 0,
  class: "reason"
};
const _hoisted_13 = {
  key: 0,
  class: "notice",
  role: "status"
};
const _hoisted_14 = { class: "tabs" };
const _hoisted_15 = {
  key: 1,
  class: "panel"
};
const _hoisted_16 = { class: "section-head" };
const _hoisted_17 = { class: "chip" };
const _hoisted_18 = {
  key: 0,
  class: "source-status"
};
const _hoisted_19 = {
  key: 1,
  class: "empty"
};
const _hoisted_20 = { class: "state" };
const _hoisted_21 = { key: 0 };
const _hoisted_22 = ["onClick"];
const _hoisted_23 = {
  key: 2,
  class: "panel"
};
const _hoisted_24 = {
  key: 0,
  class: "empty"
};
const _hoisted_25 = ["onClick"];
const _hoisted_26 = { class: "modal" };
const _hoisted_27 = { key: 0 };
const _hoisted_28 = { key: 1 };
const _hoisted_29 = {
  key: 2,
  class: "candidate-list"
};
const _hoisted_30 = { class: "candidate-meta" };
const _hoisted_31 = {
  key: 0,
  class: "reason"
};
const _hoisted_32 = ["onClick"];
const _hoisted_33 = {
  key: 3,
  class: "empty"
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

const {computed,ref} = await importShared('vue');



const _sfc_main = {
  __name: 'AppPage',
  props: { api: { type: Object, default: () => ({}) } },
  setup(__props) {

const props = __props;
const tab = ref('identity'), loading = ref(false), notice = ref(''), cards = ref([]), selected = ref(null), preview = ref(null), sources = ref([]), scope = ref(emptyScope()), run = ref(emptyRun()), control = ref({ paused: false, stopped: false });
let resumeWaiter = null, clock = null;
const pageSize = 100, workers = 4, videoExt = /\.(mkv|mp4|avi|m2ts|ts|mov|webm)$/i, subtitleExt = /\.(ass|ssa|srt|sub|vtt)$/i;
const canUseApi = computed(() => typeof props.api?.get === 'function' && typeof props.api?.post === 'function');
const progress = computed(() => run.value.total ? Math.round(run.value.completed * 100 / run.value.total) : 0);
const elapsed = computed(() => { if (!run.value.startedAt) return '0 秒'; const s = Math.round(((run.value.finishedAt || Date.now()) - run.value.startedAt) / 1000); return s < 60 ? `${s} 秒` : `${Math.floor(s / 60)} 分 ${s % 60} 秒` });
const confirmed = computed(() => cards.value.filter(card => card.state === 'confirmed'));
const dataOf = value => value?.data ?? value;
const safe = value => String(value || '').replace(/[\\/]/g, '').replace(/\s+/g, ' ').trim().slice(0, 180);
const unique = values => [...new Set(values.filter(Boolean))];
const number = value => Number(value) || 0;
function emptyScope() { return { failure: 0, success: 0, recovered: 0, currentFailures: 0, unavailable: [], directories: 0, inventoryState: '尚未读取' } }
function emptyRun() { return { phase: '尚未开始', total: 0, completed: 0, current: '', startedAt: 0, finishedAt: 0, stats: { confirmed: 0, selection: 0, insufficient: 0, unavailable: 0 } } }
function cleanTitle(value) { return safe(value).replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[._-]+/g, ' ').replace(/\b(2160p|1080p|720p|web[ .-]?dl|web[ .-]?rip|bluray|bdrip|remux|x26[45]|h\.?26[45]|hevc|aac|dts|atmos|hdr10?\+?|dv|10bit|proper|repack|complete|中字|简繁|国语|粤语)\b/gi, ' ').replace(/\[[^\]]*\]|【[^】]*】/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) }
const norm = value => cleanTitle(value).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const useful = value => { const name = norm(value); return name.length >= 3 && !/^(movie|video|sample|test|unknown|第?[0-9]+集?)$/i.test(name) };
const itemKey = item => `${item?.storage || 'local'}:${item?.path || item?.name || ''}`;
const candidateKey = candidate => `${candidate.media_source}:${candidate.media_id}:${candidate.type_name}`;
function evidenceText(e) { const result = [`${e.videos} 个视频`, `${e.subtitles} 个字幕`]; if (e.nfos) result.push(`${e.nfos} 个 NFO`); if (e.episodes.length) result.push(`集号 ${e.episodes.join('、')}`); return result.join('，') }
function candidateNames(c) { return unique([c.title, c.original_title, c.en_title, ...(c.names || [])]) }
function candidateMeta(c) { return [c.type_name, c.year, c.season ? `第 ${c.season} 季` : '', c.episodeCount ? `${c.episodeCount} 集` : '', `来源：${c.media_source}`].filter(Boolean).join(' · ') }

async function historyRows(status, label) { const rows = []; for (let page = 1; ; page += 1) { const raw = dataOf(await props.api.get(`history/transfer?status=${status}&page=${page}&count=${pageSize}`, { feedback: 'silent' })); if (raw?.success === false) throw new Error(raw.message || `无法读取${label}`); const data = raw?.data ?? raw, batch = data?.items || data?.list || data?.data || []; if (!Array.isArray(batch)) return rows; rows.push(...batch); if (batch.length < pageSize) return rows } }
async function readSources() { try { const raw = dataOf(await props.api.get('media/source', { feedback: 'silent' })); sources.value = (Array.isArray(raw) ? raw : []).map(item => ({ id: String(item?.media_source || item?.source || ''), label: safe(item?.name || item?.title || item?.media_source || item?.source), state: '待查询', hits: 0 })).filter(item => item.id); } catch { sources.value = [{ id: '', label: '媒体数据源清单不可读取', state: '不可用', hits: 0 }]; } }
async function readDirectories() { try { const raw = dataOf(await props.api.get('storage/directories', { feedback: 'silent' })); const list = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : []; scope.value.directories = list.length; scope.value.inventoryState = list.length ? '已读到配置目录；目录清单不被伪装成已核验媒体库存。' : '没有可读的配置目录'; } catch { scope.value.unavailable.push('实际库存：当前账号无权读取 storage/directories，已降级为历史账本。'); scope.value.inventoryState = '无读取权限，已降级'; } }
function packageRoot(row) { const source = row?.src_fileitem || row?.source_fileitem || row?.fileitem; if (!source?.path) return null; if (source.type === 'dir') return source; const path = String(source.path), cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')); return cut > 0 ? { ...source, path: path.slice(0, cut), type: 'dir', children: [] } : null }
function packageKey(row) { const source = row?.src_fileitem || row?.source_fileitem || row?.fileitem; return source?.path ? itemKey(source) : `history:${row?.id || crypto.randomUUID()}` }
function groupsFor(rows) { const map = new Map(); for (const row of rows) { const key = packageKey(row), source = row?.src_fileitem || row?.source_fileitem || row?.fileitem, group = map.get(key) || { key, source, root: packageRoot(row), historyIds: [], titles: [] }; group.historyIds.push(row?.id); if (row?.title) group.titles.push(cleanTitle(row.title)); map.set(key, group); } return map }
async function treeEvidence(group) { if (!group.root) return { ok: false, reason: '这条历史没有可读的来源包。' }; const queue = [{ item: group.root, depth: 0 }], seen = new Set(), entries = [], names = [...group.titles, cleanTitle(group.source?.name)].filter(Boolean), episodes = []; let videos = 0, subtitles = 0, nfos = 0, directories = 0; while (queue.length) { const current = queue.shift(), key = itemKey(current.item); if (seen.has(key)) continue; seen.add(key); let children; try { children = dataOf(await props.api.post('storage/list', current.item, { feedback: 'silent' })); } catch { return { ok: false, reason: 'MoviePilot 拒绝读取这个来源包。' } } if (!Array.isArray(children)) return { ok: false, reason: '来源包返回的不是目录清单。' }; directories += 1; for (const child of children) { const name = safe(child?.name); entries.push({ name, type: child?.type || 'file', depth: current.depth + 1 }); if (name) names.push(cleanTitle(name)); const match = name.match(/[. _-][Ss](\d{1,2})[. _-]?[Ee](\d{1,3})(?:[. _-]?[Ee]?(\d{1,3}))?/i) || name.match(/\b[Ee][Pp]?(\d{1,3})\b/); if (match) episodes.push(Number(match[2] || match[1]), ...(match[3] ? [Number(match[3])] : [])); if (child?.type === 'dir') queue.push({ item: child, depth: current.depth + 1 }); else if (videoExt.test(name)) videos += 1; else if (subtitleExt.test(name)) subtitles += 1; else if (/\.nfo$/i.test(name)) nfos += 1; } } const queries = unique(names.filter(useful)).sort((a, b) => b.length - a.length); if (!videos && !queries.length) return { ok: false, reason: '完整目录树中没有可用的视频或名称线索。' }; return { ok: true, videos, subtitles, nfos, directories, entries, episodes: unique(episodes.filter(Number.isFinite)).sort((a, b) => a - b), queries, fingerprint: `${directories}:${entries.length}:${videos}:${subtitles}:${nfos}:${unique(episodes).join(',')}` } }
function candidateOf(raw, via, query) { const media = raw?.media_info || raw?.mediaInfo || raw?.media || raw || {}, meta = raw?.meta_info || raw?.metaInfo || {}, title = safe(media.title || media.name || meta.title), mediaSource = String(media.media_source || media.source || ''), mediaId = String(media.media_id || media.id || ''), type = String(media.type || media.mtype || meta.type || ''); if (!title || !mediaSource || !mediaId || !type) return null; return { title, original_title: safe(media.original_title || media.original_name), en_title: safe(media.en_title || media.english_title), names: unique([...(Array.isArray(media.names) ? media.names : []), ...(Array.isArray(media.aliases) ? media.aliases : [])].map(safe)), year: String(media.year || media.release_year || media.release_date || '').slice(0, 4), media_source: mediaSource, media_id: mediaId, type_name: type, season: number(media.season || media.season_number) || undefined, via: [via], queries: query ? [query] : [], reasons: [], conflicts: [], score: 0 } }
function mergeCandidate(a, b) { return !a ? b : { ...a, ...b, via: unique([...(a.via || []), ...(b.via || [])]), queries: unique([...(a.queries || []), ...(b.queries || [])]), names: unique([...(a.names || []), ...(b.names || [])]) } }
async function detailFor(c) { try { return dataOf(await props.api.get(`media/${encodeURIComponent(c.media_id)}?${new URLSearchParams({ media_source: c.media_source, type_name: c.type_name })}`, { feedback: 'silent' })) || {} } catch { return {} } }
function score(c, e) { const names = candidateNames(c).map(norm).filter(Boolean), hits = e.queries.filter(query => { const value = norm(query); return names.some(name => name === value || name.includes(value) || value.includes(name)) }); if (hits.length) { c.score += Math.min(8, hits.length * 2); c.reasons.push(`标题线索命中 ${hits.length} 条`); } else c.conflicts.push('候选标题与完整包名称线索没有交集'); if (c.via.some(item => item.includes('原生识别'))) { c.score += 3; c.reasons.push('MoviePilot 原生识别命中'); } const years = unique(e.queries.flatMap(query => query.match(/(?:19|20)\d{2}/g) || [])); if (years.length && c.year) { if (years.includes(c.year)) { c.score += 2; c.reasons.push('年份线索一致'); } else c.conflicts.push('年份线索冲突'); } if (e.episodes.length >= 2 && c.episodeCount && Math.max(...e.episodes) > c.episodeCount) c.conflicts.push('来源集号超过候选总集数'); if (e.videos >= 3 && c.episodeCount && c.episodeCount < Math.ceil(e.videos * .5)) c.conflicts.push('候选集数与视频数明显不符'); }
function searchPlan(e) { const preferred = e.queries.filter(value => /(?:19|20)\d{2}|S\d|第\s*\d+\s*季/i.test(value)); const plan = unique([...preferred, ...e.queries]).slice(0, 12); return plan.length ? plan : e.queries }
async function candidatesFor(group, e) { const map = new Map(), add = c => { if (c) map.set(candidateKey(c), mergeCandidate(map.get(candidateKey(c)), c)); }; if (group.source?.path) try { add(candidateOf(dataOf(await props.api.get(`media/recognize_file?path=${encodeURIComponent(group.source.path)}`, { feedback: 'silent' })), '来源文件原生识别', cleanTitle(group.source.name))); } catch { /* Evidence remains visible. */ } e.searchQueries = searchPlan(e); for (const query of e.searchQueries) { try { add(candidateOf(dataOf(await props.api.get(`media/recognize?title=${encodeURIComponent(query)}`, { feedback: 'silent' })), '包名原生识别', query)); } catch { /* Search can still answer. */ } for (const source of sources.value.filter(source => source.id)) { const params = new URLSearchParams({ title: query, type: 'media', count: '20', media_source: source.id }); try { const raw = dataOf(await props.api.get(`media/search?${params}`, { feedback: 'silent' })); const rows = Array.isArray(raw) ? raw : []; rows.forEach(item => add(candidateOf(item, `官方搜索：${source.label}`, query))); source.hits += rows.length; source.state = rows.length ? '有结果' : source.state === '待查询' ? '无结果' : source.state; } catch { source.state = '不可用'; } } } const candidates = [...map.values()]; await Promise.all(candidates.map(async c => { const d = await detailFor(c); c.original_title ||= safe(d.original_title || d.original_name); c.en_title ||= safe(d.en_title || d.english_title); c.names = unique([...(c.names || []), ...(Array.isArray(d.names) ? d.names : []), ...(Array.isArray(d.aliases) ? d.aliases : [])].map(safe)); c.year ||= String(d.year || d.release_year || d.release_date || '').slice(0, 4); c.episodeCount = number(d.number_of_episodes || d.episode_count) || undefined; score(c, e); })); return candidates.sort((a, b) => b.score - a.score) }
function resolve(candidates) { const first = candidates[0], second = candidates[1]; if (!first) return { state: 'insufficient', candidates, reason: '整包证据已读取，但当前 MoviePilot 数据源没有返回候选。' }; if (first.score >= 7 && !first.conflicts.length && (!second || first.score - second.score >= 3)) return { state: 'confirmed', identity: first, candidates, reason: '完整名称线索、官方识别和集数核对均支持该身份。' }; return { state: 'needs_selection', candidates, reason: first.conflicts[0] || '存在多个接近候选，必须由你查看详情后确认。' } }
async function inspectGroup(group) { const evidence = await treeEvidence(group); if (!evidence.ok) return { ...group, state: 'unavailable', reason: evidence.reason }; return { ...group, ...resolve(await candidatesFor(group, evidence)), evidence } }
function addStat(card) { if (card.state === 'confirmed') run.value.stats.confirmed += 1; else if (card.state === 'needs_selection') run.value.stats.selection += 1; else if (card.state === 'insufficient') run.value.stats.insufficient += 1; else run.value.stats.unavailable += 1; }
async function waitIfPaused() { while (control.value.paused && !control.value.stopped) await new Promise(resolve => { resumeWaiter = resolve; }); return !control.value.stopped }
function pause() { control.value.paused = true; run.value.phase = '已暂停：不再派发新包'; }
function resume() { control.value.paused = false; run.value.phase = '继续检查'; resumeWaiter?.(); resumeWaiter = null; }
function stop() { control.value.stopped = true; control.value.paused = false; run.value.phase = '正在停止：已发出的读取请求会结束'; resumeWaiter?.(); resumeWaiter = null; }
async function inspect() { if (!canUseApi.value || loading.value) { notice.value = '当前 MoviePilot 没有注入认证 API，无法安全检查。'; return } loading.value = true; cards.value = []; selected.value = null; preview.value = null; scope.value = emptyScope(); control.value = { paused: false, stopped: false }; run.value = { ...emptyRun(), phase: '正在建立范围账本', startedAt: Date.now() }; clock = window.setInterval(() => { run.value = { ...run.value }; }, 1000); try { const [failed, successful] = await Promise.all([historyRows(false, '失败整理历史'), historyRows(true, '成功整理历史'), readSources(), readDirectories()]); scope.value.failure = failed.length; scope.value.success = successful.length; const failures = groupsFor(failed), successes = new Set(successful.map(packageKey)), groups = [...failures.values()]; scope.value.recovered = groups.filter(group => successes.has(group.key)).length; scope.value.currentFailures = groups.length - scope.value.recovered; run.value.total = groups.length; run.value.phase = `范围已建立：失败历史 ${failed.length} 条，成功历史 ${successful.length} 条；开始逐包读取完整证据`; const queue = [...groups], worker = async () => { while (queue.length && await waitIfPaused()) { const group = queue.shift(); if (!group) return; run.value.current = `正在读取第 ${run.value.completed + 1}/${run.value.total} 个来源包的完整树`; let card; try { card = await inspectGroup(group); } catch { card = { ...group, state: 'unavailable', reason: '读取这个来源包时出现异常；没有进行任何文件操作。' }; } cards.value = [...cards.value, card]; run.value.completed += 1; addStat(card); } }; await Promise.all(Array.from({ length: Math.min(workers, groups.length) }, worker)); run.value.finishedAt = Date.now(); if (control.value.stopped) notice.value = `已停止：完成 ${run.value.completed}/${run.value.total} 包。范围账本和已完成证据会保留；全程零写入。`; else { run.value.phase = '检查完成'; notice.value = `已完成 ${run.value.completed} 个来源包。失败历史只是线索：其中 ${scope.value.recovered} 包也出现在成功历史，已单独标记；当前可核验失败包 ${scope.value.currentFailures} 个。全程零写入。`; } } catch (error) { run.value.phase = '检查未完成'; notice.value = error?.message || '无法建立整理历史账本；没有改动文件。'; } finally { loading.value = false; if (clock) window.clearInterval(clock); clock = null; } }
function open(card, next = 'identity') { selected.value = card; preview.value = null; tab.value = next; }
function choose(candidate) { selected.value = { ...selected.value, state: 'confirmed', identity: candidate, userConfirmed: true, reason: '已由你确认作品；下一步只能生成官方零写入预览。' }; cards.value = cards.value.map(card => card.key === selected.value.key ? selected.value : card); }
function previewPayload(item, target = {}) { return { fileitem: item.source, logid: item.historyIds?.[0], transfer_type: target.transfer_type || 'link', target_storage: target.target_storage, target_path: target.target_path, scrape: target.scrape, library_type_folder: target.library_type_folder, library_category_folder: target.library_category_folder, preview: true, reorganize: false, media_source: item.identity.media_source, media_id: item.identity.media_id, type_name: item.identity.type_name, season: item.identity.season } }
function previewIssues(result, target) { const items = result?.items || [], summary = result?.summary || {}, issues = []; if (!target?.target_path || !target?.transfer_type) issues.push('当前目录规则没有给出唯一完整目标'); if (!items.length && !summary.total) issues.push('官方没有返回逐文件预览'); if (summary.failed || items.some(item => item?.success === false || !item?.target)) issues.push('官方预览存在失败或缺失目标'); const episodes = items.map(item => Number(item?.episode)).filter(Number.isFinite); if (new Set(episodes).size !== episodes.length) issues.push('官方预览包含重复集号'); return issues }
async function auditOrganization() { if (!selected.value?.identity || selected.value.state !== 'confirmed') return; loading.value = true; preview.value = null; try { const base = previewPayload(selected.value), [historyRaw, targetRaw] = await Promise.all([props.api.post('transfer/manual/history', base, { feedback: 'silent' }), props.api.post('transfer/manual/target-path', base, { feedback: 'silent' })]), history = dataOf(historyRaw), target = dataOf(targetRaw); if (history?.success === false || target?.success === false) throw new Error(history?.message || target?.message || '官方整理审计被拒绝'); const historyData = history?.data ?? history, targetData = target?.data ?? target, raw = dataOf(await props.api.post('transfer/manual', previewPayload(selected.value, targetData), { feedback: 'silent' })); if (raw?.success === false) throw new Error(raw.message || '官方预览被拒绝'); const data = raw?.data ?? raw; preview.value = { history: historyData || {}, target: targetData || {}, data: data || {}, issues: previewIssues(data, targetData), fingerprint: selected.value.evidence?.fingerprint }; notice.value = preview.value.issues.length ? '已生成官方逐文件预览，但发现冲突，不能进入写入。' : '官方逐文件预览完成。旧硬链接清理仍锁定：官方预览没有逐项删除清单。'; } catch (error) { notice.value = error?.message || '官方预览失败；没有改动文件。'; } finally { loading.value = false; } }

return (_ctx, _cache) => {
  return (_openBlock(), _createElementBlock("main", _hoisted_1, [
    _createElementVNode("header", _hoisted_2, [
      _cache[4] || (_cache[4] = _createElementVNode("div", null, [
        _createElementVNode("p", { class: "eyebrow" }, "MediaGovernor 1.3"),
        _createElementVNode("h1", null, "媒体治理工作台"),
        _createElementVNode("p", null, "先建立真实范围，再用完整包证据找对作品；整理只生成官方逐文件预览，绝不静默删除旧硬链接。")
      ], -1)),
      _createElementVNode("div", _hoisted_3, [
        _createElementVNode("button", {
          class: "primary",
          disabled: loading.value,
          onClick: inspect
        }, _toDisplayString(loading.value ? '检查进行中…' : cards.value.length ? '重新检查' : '开始全量审计'), 9, _hoisted_4),
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
      (run.value.current)
        ? (_openBlock(), _createElementBlock("p", _hoisted_8, _toDisplayString(run.value.current) + "。结果会逐包出现。", 1))
        : _createCommentVNode("", true),
      _createElementVNode("div", _hoisted_9, [
        _createElementVNode("span", null, [
          _cache[5] || (_cache[5] = _createTextVNode("已确认 ", -1)),
          _createElementVNode("b", null, _toDisplayString(run.value.stats.confirmed), 1)
        ]),
        _createElementVNode("span", null, [
          _cache[6] || (_cache[6] = _createTextVNode("待确认 ", -1)),
          _createElementVNode("b", null, _toDisplayString(run.value.stats.selection), 1)
        ]),
        _createElementVNode("span", null, [
          _cache[7] || (_cache[7] = _createTextVNode("资料不足 ", -1)),
          _createElementVNode("b", null, _toDisplayString(run.value.stats.insufficient), 1)
        ]),
        _createElementVNode("span", null, [
          _cache[8] || (_cache[8] = _createTextVNode("不可读取 ", -1)),
          _createElementVNode("b", null, _toDisplayString(run.value.stats.unavailable), 1)
        ])
      ])
    ]),
    _createElementVNode("section", _hoisted_10, [
      _cache[13] || (_cache[13] = _createElementVNode("h2", null, "这次到底查了什么", -1)),
      _createElementVNode("div", _hoisted_11, [
        _createElementVNode("span", null, [
          _cache[9] || (_cache[9] = _createTextVNode("失败历史 ", -1)),
          _createElementVNode("b", null, _toDisplayString(scope.value.failure), 1)
        ]),
        _createElementVNode("span", null, [
          _cache[10] || (_cache[10] = _createTextVNode("成功历史 ", -1)),
          _createElementVNode("b", null, _toDisplayString(scope.value.success), 1)
        ]),
        _createElementVNode("span", null, [
          _cache[11] || (_cache[11] = _createTextVNode("失败后已成功 ", -1)),
          _createElementVNode("b", null, _toDisplayString(scope.value.recovered), 1)
        ]),
        _createElementVNode("span", null, [
          _cache[12] || (_cache[12] = _createTextVNode("当前失败候选 ", -1)),
          _createElementVNode("b", null, _toDisplayString(scope.value.currentFailures), 1)
        ])
      ]),
      _createElementVNode("p", null, "先读两类整理历史，再逐包读取完整目录树。失败历史不是问题总数；“失败后已成功”不会再被当成待修。" + _toDisplayString(scope.value.inventoryState), 1),
      (scope.value.unavailable.length)
        ? (_openBlock(), _createElementBlock("p", _hoisted_12, _toDisplayString(scope.value.unavailable.join('；')), 1))
        : _createCommentVNode("", true)
    ]),
    (notice.value)
      ? (_openBlock(), _createElementBlock("p", _hoisted_13, _toDisplayString(notice.value), 1))
      : _createCommentVNode("", true),
    _createElementVNode("nav", _hoisted_14, [
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
      ? (_openBlock(), _createElementBlock("section", _hoisted_15, [
          _createElementVNode("div", _hoisted_16, [
            _cache[14] || (_cache[14] = _createElementVNode("div", null, [
              _createElementVNode("h2", null, "找对作品"),
              _createElementVNode("p", null, "每张卡对应一条来源记录，不按“直接父目录”强行合并。候选来自 MoviePilot 当前已配置数据源；若源里有豆瓣，会明确显示“来源：豆瓣”。")
            ], -1)),
            _createElementVNode("span", _hoisted_17, "数据源 " + _toDisplayString(sources.value.length), 1)
          ]),
          (sources.value.length)
            ? (_openBlock(), _createElementBlock("details", _hoisted_18, [
                _cache[15] || (_cache[15] = _createElementVNode("summary", null, "查看数据源查询状态", -1)),
                (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(sources.value, (source) => {
                  return (_openBlock(), _createElementBlock("p", {
                    key: source.id || source.label
                  }, _toDisplayString(source.label) + "：" + _toDisplayString(source.state) + _toDisplayString(source.hits ? `（返回 ${source.hits} 条）` : ''), 1))
                }), 128))
              ]))
            : _createCommentVNode("", true),
          (!cards.value.length)
            ? (_openBlock(), _createElementBlock("p", _hoisted_19, "尚未读取。开始后会先建立账本，再显示每一条来源记录的完整证据和候选。"))
            : _createCommentVNode("", true),
          (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(cards.value, (card) => {
            return (_openBlock(), _createElementBlock("article", {
              key: card.key,
              class: _normalizeClass(["card", card.state])
            }, [
              _createElementVNode("div", null, [
                _createElementVNode("span", _hoisted_20, _toDisplayString(card.state === 'confirmed' ? '身份已确认' : card.state === 'needs_selection' ? '需要你确认' : card.state === 'insufficient' ? '资料不足' : '来源不可读取'), 1),
                _createElementVNode("h3", null, _toDisplayString(card.identity?.title || '还没有可靠作品身份') + _toDisplayString(card.identity?.year ? `（${card.identity.year}）` : ''), 1),
                (card.evidence)
                  ? (_openBlock(), _createElementBlock("p", _hoisted_21, _toDisplayString(evidenceText(card.evidence)) + "；目录 " + _toDisplayString(card.evidence.directories) + " 层节点、" + _toDisplayString(card.evidence.entries.length) + " 项证据。", 1))
                  : _createCommentVNode("", true),
                _createElementVNode("p", null, _toDisplayString(card.reason), 1)
              ]),
              _createElementVNode("button", {
                class: "secondary",
                onClick: $event => (open(card))
              }, "查看完整依据与候选", 8, _hoisted_22)
            ], 2))
          }), 128))
        ]))
      : (_openBlock(), _createElementBlock("section", _hoisted_23, [
          _cache[17] || (_cache[17] = _createElementVNode("div", { class: "section-head" }, [
            _createElementVNode("div", null, [
              _createElementVNode("h2", null, "整理正确"),
              _createElementVNode("p", null, "只为已确认作品请求 MoviePilot 官方逐文件预览。预览中的新硬链接计划可查看；旧硬链接删除因没有逐项删除清单而保持锁定。")
            ]),
            _createElementVNode("span", { class: "chip" }, "无静默删除")
          ], -1)),
          (!confirmed.value.length)
            ? (_openBlock(), _createElementBlock("p", _hoisted_24, "先在“找对作品”确认身份。候选冲突或资料不足的包不能生成整理计划。"))
            : _createCommentVNode("", true),
          (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(confirmed.value, (card) => {
            return (_openBlock(), _createElementBlock("article", {
              key: card.key,
              class: "card confirmed"
            }, [
              _createElementVNode("div", null, [
                _cache[16] || (_cache[16] = _createElementVNode("span", { class: "state" }, "身份已确认", -1)),
                _createElementVNode("h3", null, _toDisplayString(card.identity.title) + _toDisplayString(card.identity.year ? `（${card.identity.year}）` : ''), 1),
                _createElementVNode("p", null, _toDisplayString(evidenceText(card.evidence)) + "。尚未读写旧硬链接。", 1)
              ]),
              _createElementVNode("button", {
                class: "primary",
                onClick: $event => {open(card, 'organize'); auditOrganization();}
              }, "生成官方逐文件预览", 8, _hoisted_25)
            ]))
          }), 128))
        ])),
    (selected.value)
      ? (_openBlock(), _createElementBlock("div", {
          key: 3,
          class: "backdrop",
          onClick: _cache[3] || (_cache[3] = _withModifiers($event => (selected.value = null), ["self"]))
        }, [
          _createElementVNode("section", _hoisted_26, [
            _createElementVNode("button", {
              class: "close",
              "aria-label": "关闭",
              onClick: _cache[2] || (_cache[2] = $event => (selected.value = null))
            }, "×"),
            (tab.value === 'identity')
              ? (_openBlock(), _createElementBlock(_Fragment, { key: 0 }, [
                  _cache[18] || (_cache[18] = _createElementVNode("p", { class: "eyebrow" }, "完整证据账本", -1)),
                  _createElementVNode("h2", null, _toDisplayString(selected.value.identity?.title || '候选核验'), 1),
                  (selected.value.evidence)
                    ? (_openBlock(), _createElementBlock("p", _hoisted_27, _toDisplayString(evidenceText(selected.value.evidence)) + "。已读取 " + _toDisplayString(selected.value.evidence.entries.length) + " 个目录项，证据指纹 " + _toDisplayString(selected.value.evidence.fingerprint) + "。", 1))
                    : _createCommentVNode("", true),
                  _createElementVNode("p", null, _toDisplayString(selected.value.reason), 1),
                  (selected.value.evidence)
                    ? (_openBlock(), _createElementBlock("details", _hoisted_28, [
                        _createElementVNode("summary", null, "查看名称线索（" + _toDisplayString(selected.value.evidence.queries.length) + " 条）", 1),
                        _createElementVNode("p", null, _toDisplayString(selected.value.evidence.queries.join('；') || '没有可用线索'), 1)
                      ]))
                    : _createCommentVNode("", true),
                  (selected.value.candidates?.length)
                    ? (_openBlock(), _createElementBlock("div", _hoisted_29, [
                        (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(selected.value.candidates, (candidate) => {
                          return (_openBlock(), _createElementBlock("article", {
                            key: candidateKey(candidate),
                            class: _normalizeClass(["candidate", { conflicted: candidate.conflicts?.length }])
                          }, [
                            _createElementVNode("div", null, [
                              _createElementVNode("strong", null, _toDisplayString(candidate.title) + _toDisplayString(candidate.year ? `（${candidate.year}）` : ''), 1),
                              _createElementVNode("p", null, _toDisplayString(candidate.original_title ? `原名：${candidate.original_title}` : '原名：未返回') + _toDisplayString(candidate.en_title ? `；英文：${candidate.en_title}` : ''), 1),
                              _createElementVNode("p", _hoisted_30, _toDisplayString(candidateMeta(candidate)), 1),
                              _createElementVNode("p", null, "检索线索：" + _toDisplayString(candidate.queries?.join('；') || '原生文件识别') + "。支持：" + _toDisplayString(candidate.reasons?.join('；') || '只有官方搜索命中'), 1),
                              (candidate.conflicts?.length)
                                ? (_openBlock(), _createElementBlock("p", _hoisted_31, "冲突：" + _toDisplayString(candidate.conflicts.join('；')), 1))
                                : _createCommentVNode("", true)
                            ]),
                            _createElementVNode("button", {
                              class: "secondary",
                              onClick: $event => (choose(candidate))
                            }, "确认是这部", 8, _hoisted_32)
                          ], 2))
                        }), 128))
                      ]))
                    : (_openBlock(), _createElementBlock("p", _hoisted_33, "MoviePilot 没有返回候选；这不代表文件为空。"))
                ], 64))
              : (_openBlock(), _createElementBlock(_Fragment, { key: 1 }, [
                  _cache[23] || (_cache[23] = _createElementVNode("p", { class: "eyebrow" }, "官方逐文件预览", -1)),
                  _createElementVNode("h2", null, _toDisplayString(selected.value.identity?.title), 1),
                  _createElementVNode("button", {
                    class: "primary",
                    disabled: loading.value,
                    onClick: auditOrganization
                  }, _toDisplayString(loading.value ? '正在生成…' : '重新生成预览'), 9, _hoisted_34),
                  (preview.value)
                    ? (_openBlock(), _createElementBlock("section", _hoisted_35, [
                        _createElementVNode("div", _hoisted_36, [
                          _createElementVNode("span", null, [
                            _cache[19] || (_cache[19] = _createTextVNode("命中旧成功记录 ", -1)),
                            _createElementVNode("b", null, _toDisplayString(preview.value.history?.history_count || 0), 1)
                          ]),
                          _createElementVNode("span", null, [
                            _cache[20] || (_cache[20] = _createTextVNode("预览文件 ", -1)),
                            _createElementVNode("b", null, _toDisplayString(preview.value.data?.summary?.total || preview.value.data?.items?.length || 0), 1)
                          ]),
                          _createElementVNode("span", null, [
                            _cache[21] || (_cache[21] = _createTextVNode("可创建 ", -1)),
                            _createElementVNode("b", null, _toDisplayString(preview.value.data?.summary?.success || 0), 1)
                          ]),
                          _createElementVNode("span", null, [
                            _cache[22] || (_cache[22] = _createTextVNode("预览失败 ", -1)),
                            _createElementVNode("b", null, _toDisplayString(preview.value.data?.summary?.failed || 0), 1)
                          ])
                        ]),
                        (preview.value.issues.length)
                          ? (_openBlock(), _createElementBlock("p", _hoisted_37, "已锁定：" + _toDisplayString(preview.value.issues.join('；')), 1))
                          : (_openBlock(), _createElementBlock("p", _hoisted_38, "新硬链接预览完整，但仍不执行。当前 MoviePilot 不会在预览中给出旧硬链接的逐项删除清单，插件不能替它猜测或静默删除。")),
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
const AppPage = /*#__PURE__*/_export_sfc(_sfc_main, [['__scopeId',"data-v-e72753d1"]]);

export { AppPage as default };
