import { importShared } from './__federation_fn_import-JrT3xvdd.js';
import { _ as _export_sfc } from './_plugin-vue_export-helper-pcqpp-6-.js';

const {createElementVNode:_createElementVNode,toDisplayString:_toDisplayString,openBlock:_openBlock,createElementBlock:_createElementBlock,createCommentVNode:_createCommentVNode,renderList:_renderList,Fragment:_Fragment,createTextVNode:_createTextVNode,withModifiers:_withModifiers} = await importShared('vue');


const _hoisted_1 = { class: "governor-page" };
const _hoisted_2 = ["disabled"];
const _hoisted_3 = {
  key: 0,
  class: "notice",
  role: "status"
};
const _hoisted_4 = { class: "panel" };
const _hoisted_5 = {
  key: 0,
  class: "muted"
};
const _hoisted_6 = { key: 0 };
const _hoisted_7 = { key: 1 };
const _hoisted_8 = ["onClick"];
const _hoisted_9 = { class: "modal" };
const _hoisted_10 = { key: 0 };
const _hoisted_11 = ["disabled"];
const _hoisted_12 = ["onClick"];
const _hoisted_13 = ["disabled"];
const _hoisted_14 = {
  key: 3,
  class: "preview"
};
const _hoisted_15 = ["disabled"];
const _hoisted_16 = {
  key: 2,
  class: "backdrop"
};
const _hoisted_17 = { class: "modal confirm" };
const _hoisted_18 = ["disabled"];
const _hoisted_19 = ["disabled"];

const {computed,ref} = await importShared('vue');


const pageSize = 100;

const maxPackageDirectories = 120;
const maxPackageDepth = 6;


const _sfc_main = {
  __name: 'AppPage',
  props: { api: { type: Object, default: () => ({}) } },
  setup(__props) {

const props = __props;
const loading = ref(false);
const notice = ref('');
const cards = ref([]);
const selected = ref(null);
const preview = ref(null);
const confirmRepair = ref(false);
const canUseApi = computed(() => typeof props.api?.get === 'function' && typeof props.api?.post === 'function');
const safeName = value => String(value || '').replace(/[\\/]/g, '').slice(0, 140);
const dataOf = response => response?.data ?? response;
const videoExt = /\.(mkv|mp4|avi|m2ts|ts|mov|webm)$/i;
const subtitleExt = /\.(ass|ssa|srt|sub|vtt)$/i;
function sourcePackage(source) {
  if (source?.type === 'dir') return source
  const path = String(source?.path || '');
  const separator = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  if (separator < 1) return null
  return { ...source, path: path.slice(0, separator), name: '', basename: '', extension: '', type: 'dir', children: [] }
}

async function packageEvidence(root) {
  if (!root) return { ok: false, reason: '无法确定来源包目录，未生成预览。' }
  const pending = [{ item: root, depth: 0 }];
  let directories = 0;
  let videos = 0;
  let subtitles = 0;
  while (pending.length) {
    if (directories >= maxPackageDirectories) return { ok: false, reason: '来源包目录过多，未完整核对，未生成预览。' }
    const current = pending.shift();
    let children;
    try { children = dataOf(await props.api.post('storage/list', current.item, { feedback: 'silent' })); } catch { return { ok: false, reason: '来源包目录无法读取，未生成预览。' } }
    if (!Array.isArray(children)) return { ok: false, reason: '来源包目录返回异常，未生成预览。' }
    directories += 1;
    for (const child of children) {
      if (child?.type === 'dir') {
        if (current.depth >= maxPackageDepth) return { ok: false, reason: '来源包层级过深，未完整核对，未生成预览。' }
        pending.push({ item: child, depth: current.depth + 1 });
      } else if (videoExt.test(child?.name || '')) videos += 1;
      else if (subtitleExt.test(child?.name || '')) subtitles += 1;
    }
  }
  return { ok: true, videos, subtitles, directories }
}

function identityOf(context, fallback) {
  const media = context?.media_info || context?.mediaInfo || context?.media || {};
  const meta = context?.meta_info || context?.metaInfo || {};
  return {
    title: safeName(media.title || media.name || meta.title || fallback),
    year: String(media.year || meta.year || '').slice(0, 8),
    media_source: String(media.media_source || media.source || ''),
    media_id: String(media.media_id || media.id || ''),
    type_name: String(media.type || media.mtype || meta.type || ''),
    season: Number(media.season || meta.season || 0) || undefined,
  }
}

async function historyRows() {
  const rows = [];
  for (let page = 1; ; page += 1) {
    const envelope = await props.api.get(`history/transfer?status=false&page=${page}&count=${pageSize}`, { feedback: 'silent' });
    const payload = dataOf(envelope);
    if (payload?.success === false) throw new Error(payload.message || '无法读取整理历史')
    const data = payload?.data ?? payload;
    const batch = data?.items || data?.list || data?.data || [];
    if (!Array.isArray(batch)) break
    rows.push(...batch);
    if (batch.length < pageSize) break
  }
  return rows
}

async function packageFor(row) {
  const source = row?.src_fileitem;
  const sourcePath = source?.path;
  if (!source || !sourcePath) return { state: 'blocked', reason: '历史记录没有可读的来源文件', historyId: row?.id }
  let context = {};
  try { context = dataOf(await props.api.get(`media/recognize_file?path=${encodeURIComponent(sourcePath)}`, { feedback: 'silent' })) || {}; } catch { context = {}; }
  const identity = identityOf(context, source.name);
  if (!identity.title || !identity.media_source || !identity.media_id || !identity.type_name) {
    return { state: 'needs_selection', reason: '官方识别没有给出唯一作品身份', historyId: row.id, source }
  }
  const evidence = await packageEvidence(sourcePackage(source));
  if (!evidence.ok) return { state: 'blocked', reason: evidence.reason, historyId: row.id, source, identity }
  return {
    state: 'ready', historyId: row.id, source, identity,
    evidence,
  }
}

async function inspect() {
  if (!canUseApi.value) { notice.value = '当前 MoviePilot 未注入认证 API，无法安全检查。'; return }
  loading.value = true; cards.value = []; selected.value = null; preview.value = null; notice.value = '正在读取失败整理记录，并按来源包核对…';
  try {
    const rows = await historyRows();
    const inspected = [];
    for (const row of rows) inspected.push(await packageFor(row));
    const grouped = new Map();
    for (const item of inspected) {
      const key = item.state === 'ready' ? `${item.identity.media_source}:${item.identity.media_id}:${item.identity.season || ''}` : `unknown:${item.historyId}`;
      const current = grouped.get(key) || { ...item, historyIds: [], count: 0 };
      current.historyIds.push(item.historyId); current.count += 1;
      if (item.evidence) current.evidence = item.evidence;
      grouped.set(key, current);
    }
    cards.value = [...grouped.values()];
    const ready = cards.value.filter(item => item.state === 'ready').length;
    const blocked = cards.value.length - ready;
    notice.value = `检查结束：${ready} 个作品可生成官方预览，${blocked} 个仍需你选择作品或补充信息。没有改动文件。`;
  } catch (error) { notice.value = error?.message || '检查未完成；没有改动文件。'; } finally { loading.value = false; }
}

async function searchCandidates() {
  if (!selected.value?.source?.name) return
  loading.value = true;
  try {
    const candidates = dataOf(await props.api.get(`media/search?title=${encodeURIComponent(selected.value.source.name)}&type=media&count=3`, { feedback: 'silent' }));
    selected.value.candidates = Array.isArray(candidates) ? candidates.map(item => ({ title: safeName(item.title || item.name), year: String(item.year || ''), media_source: item.media_source || item.source, media_id: String(item.media_id || item.id || ''), type_name: item.type || item.mtype || '' })).filter(item => item.title && item.media_source && item.media_id && item.type_name) : [];
    if (!selected.value.candidates.length) notice.value = '官方搜索也没有可靠候选；这条记录暂时不能自动整理。';
  } catch { notice.value = '官方候选搜索暂不可用；没有改动文件。'; } finally { loading.value = false; }
}

function chooseCandidate(candidate) { selected.value.identity = candidate; selected.value.state = 'ready'; selected.value.reason = ''; }
function manualPayload(item, previewMode) {
  return { fileitem: item.source, transfer_type: 'link', preview: previewMode, reorganize: false, media_source: item.identity.media_source, media_id: item.identity.media_id, type_name: item.identity.type_name, season: item.identity.season }
}
async function makePreview() {
  if (!selected.value || selected.value.state !== 'ready') return
  loading.value = true;
  try {
    const result = dataOf(await props.api.post('transfer/manual', manualPayload(selected.value, true), { feedback: 'silent' }));
    if (result?.success === false) throw new Error(result.message || '官方预览被拒绝')
    const data = result?.data ?? result;
    preview.value = { ...data, item: selected.value };
    notice.value = '官方预览完成，仍未写入任何文件。请确认结果后再执行。';
  } catch (error) { notice.value = error?.message || '官方预览失败；没有改动文件。'; } finally { loading.value = false; }
}
async function repair() {
  if (!preview.value?.item) return
  loading.value = true;
  try {
    const result = dataOf(await props.api.post('transfer/manual', manualPayload(preview.value.item, false), { feedback: 'all' }));
    if (result?.success === false) throw new Error(result.message || '官方整理失败')
    notice.value = `MoviePilot 已提交“${preview.value.item.identity.title}”的硬链接整理。来源文件未被插件移动、改名或删除。`;
    confirmRepair.value = false; preview.value = null;
  } catch (error) { notice.value = error?.message || '整理没有完成；请查看 MoviePilot 的官方结果。'; } finally { loading.value = false; }
}

return (_ctx, _cache) => {
  return (_openBlock(), _createElementBlock("main", _hoisted_1, [
    _createElementVNode("header", null, [
      _cache[4] || (_cache[4] = _createElementVNode("div", null, [
        _createElementVNode("h1", null, "媒体治理"),
        _createElementVNode("p", null, "最后一关：把整理失败的来源包交给 MoviePilot 再识别、再预览。插件不猜作品，不直接操作文件。")
      ], -1)),
      _createElementVNode("button", {
        class: "primary",
        disabled: loading.value,
        onClick: inspect
      }, _toDisplayString(loading.value ? '检查中…' : '开始检查全部'), 9, _hoisted_2)
    ]),
    (notice.value)
      ? (_openBlock(), _createElementBlock("p", _hoisted_3, _toDisplayString(notice.value), 1))
      : _createCommentVNode("", true),
    _createElementVNode("section", _hoisted_4, [
      _cache[5] || (_cache[5] = _createElementVNode("h2", null, "检查结果", -1)),
      (!cards.value.length)
        ? (_openBlock(), _createElementBlock("p", _hoisted_5, "点击“开始检查全部”后，这里才会显示可解释的作品包。"))
        : _createCommentVNode("", true),
      (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(cards.value, (card) => {
        return (_openBlock(), _createElementBlock("article", {
          key: card.historyIds.join('-'),
          class: "card"
        }, [
          _createElementVNode("div", null, [
            _createElementVNode("span", null, _toDisplayString(card.count) + " 条失败整理记录", 1),
            _createElementVNode("h3", null, _toDisplayString(card.identity?.title || '没有可靠作品身份') + _toDisplayString(card.identity?.year ? `（${card.identity.year}）` : ''), 1),
            (card.state === 'ready')
              ? (_openBlock(), _createElementBlock("p", _hoisted_6, "来源包检测到 " + _toDisplayString(card.evidence?.videos || 0) + " 个视频、" + _toDisplayString(card.evidence?.subtitles || 0) + " 个字幕；可先看官方预览。", 1))
              : (_openBlock(), _createElementBlock("p", _hoisted_7, _toDisplayString(card.reason), 1))
          ]),
          _createElementVNode("button", {
            class: "secondary",
            onClick: $event => {selected.value = card; preview.value = null;}
          }, _toDisplayString(card.state === 'ready' ? '查看并预览' : '找作品'), 9, _hoisted_8)
        ]))
      }), 128))
    ]),
    (selected.value)
      ? (_openBlock(), _createElementBlock("div", {
          key: 1,
          class: "backdrop",
          onClick: _cache[2] || (_cache[2] = _withModifiers($event => (selected.value = null), ["self"]))
        }, [
          _createElementVNode("section", _hoisted_9, [
            _createElementVNode("button", {
              class: "close",
              "aria-label": "关闭",
              onClick: _cache[0] || (_cache[0] = $event => (selected.value = null))
            }, "×"),
            _createElementVNode("h2", null, _toDisplayString(selected.value.identity?.title || '找回作品身份'), 1),
            (selected.value.state !== 'ready')
              ? (_openBlock(), _createElementBlock("p", _hoisted_10, "这条记录还不能安全整理。你可以让 MoviePilot 搜索候选；遇到重名、翻拍或混包必须由你选择。"))
              : _createCommentVNode("", true),
            (selected.value.state !== 'ready')
              ? (_openBlock(), _createElementBlock("button", {
                  key: 1,
                  class: "secondary",
                  disabled: loading.value,
                  onClick: searchCandidates
                }, "搜索官方候选", 8, _hoisted_11))
              : _createCommentVNode("", true),
            (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(selected.value.candidates || [], (candidate) => {
              return (_openBlock(), _createElementBlock("div", {
                key: `${candidate.media_source}:${candidate.media_id}`,
                class: "candidate"
              }, [
                _createElementVNode("span", null, _toDisplayString(candidate.title) + _toDisplayString(candidate.year ? `（${candidate.year}）` : ''), 1),
                _createElementVNode("button", {
                  class: "secondary",
                  onClick: $event => (chooseCandidate(candidate))
                }, "就是这部", 8, _hoisted_12)
              ]))
            }), 128)),
            (selected.value.state === 'ready')
              ? (_openBlock(), _createElementBlock(_Fragment, { key: 2 }, [
                  _cache[6] || (_cache[6] = _createElementVNode("p", null, [
                    _createTextVNode("下一步只调用 MoviePilot 的 "),
                    _createElementVNode("code", null, "preview=true"),
                    _createTextVNode("，不会创建、删除、移动或改名文件。")
                  ], -1)),
                  _createElementVNode("button", {
                    class: "primary",
                    disabled: loading.value,
                    onClick: makePreview
                  }, "生成官方预览", 8, _hoisted_13)
                ], 64))
              : _createCommentVNode("", true),
            (preview.value)
              ? (_openBlock(), _createElementBlock("section", _hoisted_14, [
                  _cache[7] || (_cache[7] = _createElementVNode("h3", null, "官方预览", -1)),
                  _createElementVNode("p", null, "将处理 " + _toDisplayString(preview.value.summary?.total || preview.value.items?.length || 0) + " 项：成功 " + _toDisplayString(preview.value.summary?.success || 0) + "，失败 " + _toDisplayString(preview.value.summary?.failed || 0) + "。", 1),
                  _cache[8] || (_cache[8] = _createElementVNode("p", null, "普通修复只传来源文件，不传历史 ID，因此不会触发旧目标清理。", -1)),
                  _createElementVNode("button", {
                    class: "primary",
                    disabled: loading.value,
                    onClick: _cache[1] || (_cache[1] = $event => (confirmRepair.value = true))
                  }, "确认创建正确硬链接", 8, _hoisted_15)
                ]))
              : _createCommentVNode("", true)
          ])
        ]))
      : _createCommentVNode("", true),
    (confirmRepair.value)
      ? (_openBlock(), _createElementBlock("div", _hoisted_16, [
          _createElementVNode("section", _hoisted_17, [
            _cache[9] || (_cache[9] = _createElementVNode("h2", null, "确认创建硬链接？", -1)),
            _cache[10] || (_cache[10] = _createElementVNode("p", null, "MoviePilot 将按刚才的官方预览执行。插件不会删除、移动、改名或覆盖来源文件。", -1)),
            _createElementVNode("button", {
              class: "secondary",
              disabled: loading.value,
              onClick: _cache[3] || (_cache[3] = $event => (confirmRepair.value = false))
            }, "返回", 8, _hoisted_18),
            _createElementVNode("button", {
              class: "primary",
              disabled: loading.value,
              onClick: repair
            }, "确认执行", 8, _hoisted_19)
          ])
        ]))
      : _createCommentVNode("", true)
  ]))
}
}

};
const AppPage = /*#__PURE__*/_export_sfc(_sfc_main, [['__scopeId',"data-v-898b1a9e"]]);

export { AppPage as default };
