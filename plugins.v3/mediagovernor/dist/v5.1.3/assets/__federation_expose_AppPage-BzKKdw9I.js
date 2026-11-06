import { importShared } from './__federation_fn_import-JrT3xvdd.js';
import { _ as _export_sfc } from './_plugin-vue_export-helper-pcqpp-6-.js';

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

const {createElementVNode:_createElementVNode,openBlock:_openBlock,createElementBlock:_createElementBlock,createCommentVNode:_createCommentVNode,toDisplayString:_toDisplayString,normalizeStyle:_normalizeStyle,renderList:_renderList,Fragment:_Fragment,vModelText:_vModelText,withDirectives:_withDirectives,withModifiers:_withModifiers,createTextVNode:_createTextVNode,vModelCheckbox:_vModelCheckbox} = await importShared('vue');


const _hoisted_1 = { class: "governor-shell" };
const _hoisted_2 = { class: "hero" };
const _hoisted_3 = {
  key: 0,
  class: "notice"
};
const _hoisted_4 = { class: "actions" };
const _hoisted_5 = ["disabled"];
const _hoisted_6 = ["disabled"];
const _hoisted_7 = { class: "advanced" };
const _hoisted_8 = ["disabled"];
const _hoisted_9 = {
  class: "status-card",
  "aria-live": "polite"
};
const _hoisted_10 = { class: "status-line" };
const _hoisted_11 = {
  key: 0,
  class: "bar"
};
const _hoisted_12 = {
  key: 1,
  class: "warning"
};
const _hoisted_13 = {
  key: 2,
  class: "notice"
};
const _hoisted_14 = {
  key: 3,
  class: "notice"
};
const _hoisted_15 = {
  key: 4,
  class: "notice"
};
const _hoisted_16 = {
  key: 5,
  class: "notice"
};
const _hoisted_17 = {
  key: 6,
  class: "warning"
};
const _hoisted_18 = {
  key: 7,
  class: "notice"
};
const _hoisted_19 = {
  key: 8,
  class: "notice"
};
const _hoisted_20 = { class: "summary-grid" };
const _hoisted_21 = { class: "panel" };
const _hoisted_22 = ["onClick"];
const _hoisted_23 = {
  key: 0,
  class: "empty"
};
const _hoisted_24 = {
  key: 0,
  class: "panel"
};
const _hoisted_25 = ["onClick"];
const _hoisted_26 = { class: "panel review-panel" };
const _hoisted_27 = ["onClick"];
const _hoisted_28 = {
  key: 0,
  class: "empty"
};
const _hoisted_29 = { class: "panel error-panel" };
const _hoisted_30 = ["onClick"];
const _hoisted_31 = {
  key: 0,
  class: "empty"
};
const _hoisted_32 = ["aria-label"];
const _hoisted_33 = { class: "lead small" };
const _hoisted_34 = {
  key: 0,
  class: "warning",
  role: "alert"
};
const _hoisted_35 = {
  key: 1,
  class: "notice"
};
const _hoisted_36 = { class: "facts" };
const _hoisted_37 = {
  key: 2,
  class: "warning"
};
const _hoisted_38 = {
  key: 3,
  class: "notice"
};
const _hoisted_39 = {
  key: 4,
  class: "warning"
};
const _hoisted_40 = { key: 5 };
const _hoisted_41 = {
  key: 6,
  class: "warning"
};
const _hoisted_42 = {
  key: 7,
  class: "notice"
};
const _hoisted_43 = {
  key: 8,
  class: "notice"
};
const _hoisted_44 = ["disabled"];
const _hoisted_45 = {
  key: 9,
  class: "choice-area"
};
const _hoisted_46 = {
  key: 0,
  class: "warning"
};
const _hoisted_47 = {
  key: 1,
  class: "warning"
};
const _hoisted_48 = {
  key: 2,
  class: "warning"
};
const _hoisted_49 = { key: 3 };
const _hoisted_50 = ["onClick"];
const _hoisted_51 = ["value"];
const _hoisted_52 = ["disabled"];
const _hoisted_53 = ["disabled"];
const _hoisted_54 = ["disabled", "onClick"];
const _hoisted_55 = {
  key: 10,
  class: "choice-area"
};
const _hoisted_56 = {
  key: 0,
  class: "notice"
};
const _hoisted_57 = ["disabled"];
const _hoisted_58 = ["disabled"];
const _hoisted_59 = {
  key: 11,
  class: "preview"
};
const _hoisted_60 = {
  key: 0,
  class: "notice"
};
const _hoisted_61 = { key: 1 };
const _hoisted_62 = {
  key: 2,
  class: "notice"
};
const _hoisted_63 = ["disabled"];
const _hoisted_64 = {
  key: 4,
  class: "final-confirm"
};
const _hoisted_65 = ["disabled"];

const {computed,onBeforeUnmount,onMounted,ref} = await importShared('vue');


const _sfc_main = {
  __name: 'AppPage',
  props: { api: { type: Object, default: () => ({}) } },
  setup(__props) {

const props = __props;
const snapshot = ref({ status: { job: { status: 'idle', phase: 'IDLE', total: 0, done: 0, current: '尚未检查', error: '' }, counts: {}, objects: 0 }, problems: [], confirmations: [], errors: [] });
const busy = ref(false);
const message = ref('');
const selected = ref(null);
const repairPlan = ref(null);
const confirmingRepair = ref(false);
const identityQuery = ref('');
const selectedFileRefs = ref([]);
const choosingIdentity = ref(false);
const cleanupApproved = ref(false);
const previewing = ref(false);
const mappingSeason = ref('');
const mappingGroup = ref('');
const mappingFormat = ref('');
const mappingOffset = ref('');
const filePage = ref(0);
const visibleFiles = computed(() => (selected.value?.files || []).slice(filePage.value * 100, (filePage.value + 1) * 100));
let timer = null;
let refreshRevision = 0;
let detailRevision = 0;
let refreshing = false;

const job = computed(() => snapshot.value.status?.job || {});
const running = computed(() => job.value.status === 'running');
const readOnly = computed(() => snapshot.value.status?.read_only !== false);
const needsCleanupApproval = computed(() => repairPlan.value?.entries?.some(row => row.cleanup_attributable) && !cleanupApproved.value);
const stopping = computed(() => running.value && Boolean(job.value.cancel_requested));
const progress = computed(() => job.value.total ? Math.round((job.value.done || 0) * 100 / job.value.total) : 0);
const pendingObjects = computed(() => snapshot.value.status?.pending_objects || 0);
const hasResults = computed(() => snapshot.value.problems.length + snapshot.value.confirmations.length + snapshot.value.errors.length + (snapshot.value.normal?.length || 0) > 0);
const identityReady = computed(() => ['confirmed', 'verified'].includes(selected.value?.identity_state));
const provenanceLabel = computed(() => ({
  user_confirmed: '已由你确认',
  rule_database_verified: selected.value?.identity_state === 'verified' ? '源文件规则与数据库核验通过（非人工确认）' : '旧的自动核验已失效，需要重新检查',
  native_and_history_agree: '原生识别与历史一致，等待你确认',
  needs_user_confirmation: '候选尚未确认',
  search_error: '数据库查询失败，不是没有匹配作品',
  native_error: '原生识别失败，可直接搜索数据库',
  ai_error: '智能候选请求失败，可以稍后重试',
  ai_budget_deferred: '本轮智能候选预算已用完，尚未尝试',
  source_incomplete: '源文件尚未读完整'
}[selected.value?.provenance] || '尚无确认依据'));
const statusTitle = computed(() => ({
  running: stopping.value ? '正在停止' : '正在后台检查',
  completed: '检查完成',
  failed: '检查失败',
  cancelled: '检查已停止',
  interrupted: '上次检查已中断'
}[job.value.status] || '等待检查'));

function failure (error, fallback) {
  message.value = error?.message || fallback;
}

async function get (path) {
  return unwrapMoviePilotResponse(await props.api.get(path, { feedback: 'silent' }))
}

async function post (path, body) {
  return unwrapMoviePilotResponse(await props.api.post(path, body, { feedback: 'silent' }))
}

async function refresh () {
  if (refreshing) return
  refreshing = true;
  const revision = ++refreshRevision;
  try {
    const result = await get('plugin/MediaGovernor/findings');
    if (revision === refreshRevision) snapshot.value = result;
  } catch (error) {
    failure(error, '没有读到媒体治理状态');
  } finally { refreshing = false; }
}

async function start (mode) {
  busy.value = true;
  message.value = mode === 'full' ? '正在重新建立完整基线。' : '正在检查当前变动。';
  try {
    await post('plugin/MediaGovernor/audit/start', { mode });
    await refresh();
  } catch (error) {
    failure(error, '没有启动检查');
  } finally {
    busy.value = false;
  }
}

async function cancel () {
  if (stopping.value) return
  message.value = '正在停止当前只读检查，已经完成的结果会保留。';
  try {
    await post('plugin/MediaGovernor/audit/start', { mode: 'cancel' });
    await refresh();
  } catch (error) {
    failure(error, '没有提交停止请求');
  }
}

async function openItem (item) {
  const revision = ++detailRevision;
  busy.value = true;
  message.value = '';
  repairPlan.value = null;
  confirmingRepair.value = false;
  try {
    const detail = await get(`plugin/MediaGovernor/objects/${encodeURIComponent(item.object_id)}`);
    if (revision !== detailRevision) return
    selected.value = detail;
    selected.value.finding = item;
    identityQuery.value = selected.value.digest?.container_hint || '';
    selectedFileRefs.value = [];
    choosingIdentity.value = false;
    filePage.value = 0;
    cleanupApproved.value = false;
    mappingSeason.value = detail.identity?.season ?? '';
    mappingGroup.value = detail.identity?.episode_group || '';
    mappingFormat.value = detail.identity?.epformat?.format || '';
    mappingOffset.value = detail.identity?.epformat?.offset || '';
  } catch (error) {
    failure(error, '没有读到这部作品的证据');
  } finally {
    busy.value = false;
  }
}

function candidateKey (candidate) {
  const source = ['tmdb', 'the_movie_db'].includes(String(candidate?.media_source || '').toLowerCase()) ? 'themoviedb' : String(candidate?.media_source || '').toLowerCase();
  return `${source}:${candidate?.media_id || ''}:${candidate?.media_type || 'unknown'}`
}

function editIdentity () {
  choosingIdentity.value = true;
  repairPlan.value = null;
  confirmingRepair.value = false;
  cleanupApproved.value = false;
}

async function confirmIdentity (candidate) {
  if (!selected.value) return
  busy.value = true;
  try {
    const mapping = { season: mappingSeason.value === '' ? null : Number(mappingSeason.value), episode_group: mappingGroup.value || null,
      epformat: mappingFormat.value || mappingOffset.value ? { ...(selected.value.identity?.epformat || {}), format: mappingFormat.value || null, offset: mappingOffset.value || null } : selected.value.identity?.epformat || null };
    const result = await post('plugin/MediaGovernor/identity/confirm', { object_id: selected.value.id, candidate_key: candidateKey(candidate), mapping, ...(selectedFileRefs.value.length ? { file_refs: selectedFileRefs.value } : {}) });
    message.value = result?.queued_rechecks ? '身份已保存，已排队局部重查，不会重新扫描全部目录。' : '身份已保存，只重新核对这个源容器。';
    selected.value = null;
    await refresh();
  } catch (error) {
    failure(error, '没有保存作品身份');
  } finally {
    busy.value = false;
  }
}

async function searchCandidates () {
  if (!selected.value) return
  if (previewing.value) {
    message.value = '请等待当前只读预览结束后再改选作品。';
    return
  }
  const revision = detailRevision;
  const objectId = selected.value.id;
  busy.value = true;
  repairPlan.value = null;
  try {
    const finding = selected.value.finding;
    const result = await post('plugin/MediaGovernor/identity/search', { object_id: objectId, query: identityQuery.value });
    if (revision !== detailRevision || selected.value?.id !== objectId) return
    selected.value = result;
    selected.value.finding = finding;
    choosingIdentity.value = true;
    message.value = '数据库只提供候选，请核对年份和类型后选择。';
  } catch (error) {
    failure(error, '没有读到数据库候选');
  } finally {
    busy.value = false;
  }
}

async function previewRepair () {
  if (!selected.value) return
  const revision = detailRevision;
  const objectId = selected.value.id;
  busy.value = true;
  try {
    previewing.value = true;
    repairPlan.value = null;
    const result = await post(`plugin/MediaGovernor/repair/${encodeURIComponent(objectId)}`, { action: 'preview' });
    if (revision !== detailRevision || selected.value?.id !== objectId) return
    acceptPreview(result);
    confirmingRepair.value = false;
    cleanupApproved.value = false;
  } catch (error) {
    previewing.value = false;
    failure(error, '没有生成当前修复预览');
  } finally {
    busy.value = false;
  }
}

function acceptPreview (result) {
  if (result.status === 'completed') { repairPlan.value = result.plan; previewing.value = false; }
  else if (['failed', 'interrupted'].includes(result.status)) { message.value = result.message || '预览未完成，请重试'; previewing.value = false; }
  else if (result.token) { repairPlan.value = result; previewing.value = false; }
}

let pollingPreview = false;
async function refreshPreview () {
  if (!selected.value || !previewing.value || pollingPreview) return
  const revision = detailRevision;
  const objectId = selected.value.id;
  pollingPreview = true;
  try {
    const result = await post(`plugin/MediaGovernor/repair/${encodeURIComponent(objectId)}`, { action: 'preview_status' });
    if (revision === detailRevision && selected.value?.id === objectId) acceptPreview(result);
  } catch (error) { if (revision === detailRevision) failure(error, '读取后台预览状态失败，可稍后重新预览'); }
  finally { pollingPreview = false; }
}

async function executeRepair () {
  if (!selected.value || !repairPlan.value?.token) return
  busy.value = true;
  try {
    const result = await post(`plugin/MediaGovernor/repair/${encodeURIComponent(selected.value.id)}`, { action: 'execute', token: repairPlan.value.token, cleanup_approved: cleanupApproved.value });
    message.value = result.message || 'MoviePilot 已完成重建，正在复核。';
    selected.value = null;
    repairPlan.value = null;
    await refresh();
  } catch (error) {
    failure(error, 'MoviePilot 没有完成重建');
  } finally {
    busy.value = false;
  }
}

function closeDetail () {
  detailRevision++;
  selected.value = null;
  repairPlan.value = null;
  confirmingRepair.value = false;
  previewing.value = false;
}

onMounted(async () => {
  await refresh();
  timer = window.setInterval(() => { if (running.value || snapshot.value.status?.readonly_inflight) refresh(); refreshPreview(); }, 1500);
});
onBeforeUnmount(() => { window.clearInterval(timer); refreshRevision++; detailRevision++; });

return (_ctx, _cache) => {
  return (_openBlock(), _createElementBlock("main", _hoisted_1, [
    _createElementVNode("section", _hoisted_2, [
      _createElementVNode("div", null, [
        _cache[14] || (_cache[14] = _createElementVNode("p", { class: "eyebrow" }, "MediaGovernor 5.1.3 · 只读识别候选", -1)),
        (readOnly.value)
          ? (_openBlock(), _createElementBlock("p", _hoisted_3, "只读模式：可以检查、确认身份和查看预览，不会执行媒体修复。"))
          : _createCommentVNode("", true),
        _cache[15] || (_cache[15] = _createElementVNode("h1", null, "检查现在，找到真实问题", -1)),
        _cache[16] || (_cache[16] = _createElementVNode("p", { class: "lead" }, "逐作品比较原文件、当前硬链接和 MoviePilot 应有结果。已经完成的结果会立即保存，关掉页面也不会中断。", -1))
      ]),
      _createElementVNode("div", _hoisted_4, [
        (running.value)
          ? (_openBlock(), _createElementBlock("button", {
              key: 0,
              class: "secondary",
              disabled: stopping.value,
              onClick: cancel
            }, _toDisplayString(stopping.value ? '正在停止…' : '停止检查'), 9, _hoisted_5))
          : _createCommentVNode("", true),
        _createElementVNode("button", {
          class: "primary",
          disabled: busy.value || running.value,
          onClick: _cache[0] || (_cache[0] = $event => (start('incremental')))
        }, "检查现在", 8, _hoisted_6),
        _createElementVNode("details", _hoisted_7, [
          _cache[17] || (_cache[17] = _createElementVNode("summary", null, "高级操作", -1)),
          _createElementVNode("button", {
            class: "secondary",
            disabled: busy.value || running.value,
            onClick: _cache[1] || (_cache[1] = $event => (start('full')))
          }, "重建全部基线", 8, _hoisted_8),
          _cache[18] || (_cache[18] = _createElementVNode("p", null, "只在首次使用、目录配置改变或诊断时运行。", -1))
        ])
      ])
    ]),
    _createElementVNode("section", _hoisted_9, [
      _createElementVNode("div", _hoisted_10, [
        _createElementVNode("div", null, [
          _createElementVNode("b", null, _toDisplayString(statusTitle.value), 1),
          _createElementVNode("span", null, _toDisplayString(job.value.current), 1)
        ]),
        _createElementVNode("strong", null, _toDisplayString(job.value.done || 0) + "/" + _toDisplayString(job.value.total || 0), 1)
      ]),
      (running.value)
        ? (_openBlock(), _createElementBlock("div", _hoisted_11, [
            _createElementVNode("i", {
              style: _normalizeStyle({ width: `${progress.value}%` })
            }, null, 4)
          ]))
        : _createCommentVNode("", true),
      (job.value.error)
        ? (_openBlock(), _createElementBlock("p", _hoisted_12, _toDisplayString(job.value.error), 1))
        : _createCommentVNode("", true),
      (message.value)
        ? (_openBlock(), _createElementBlock("p", _hoisted_13, _toDisplayString(message.value), 1))
        : _createCommentVNode("", true),
      (snapshot.value.coverage?.note)
        ? (_openBlock(), _createElementBlock("p", _hoisted_14, "核查范围：" + _toDisplayString(snapshot.value.coverage.note), 1))
        : _createCommentVNode("", true),
      (pendingObjects.value)
        ? (_openBlock(), _createElementBlock("p", _hoisted_15, "本轮还有 " + _toDisplayString(pendingObjects.value) + " 个作品未处理，不能把它们算成正常。", 1))
        : _createCommentVNode("", true),
      (job.value.status !== 'idle' && snapshot.value.status?.discovery_complete === false)
        ? (_openBlock(), _createElementBlock("p", _hoisted_16, "尚未完成目录发现，未处理作品总数仍未知。"))
        : _createCommentVNode("", true),
      (snapshot.value.status?.inventory_errors)
        ? (_openBlock(), _createElementBlock("p", _hoisted_17, "本轮有 " + _toDisplayString(snapshot.value.status.inventory_errors) + " 处目录读取异常，不代表已经查全。", 1))
        : _createCommentVNode("", true),
      (snapshot.value.status?.readonly_inflight)
        ? (_openBlock(), _createElementBlock("p", _hoisted_18, "仍有 " + _toDisplayString(snapshot.value.status.readonly_inflight) + " 个只读调用未退出。停止等待不代表底层请求已结束。", 1))
        : _createCommentVNode("", true),
      (snapshot.value.status?.queued_rechecks)
        ? (_openBlock(), _createElementBlock("p", _hoisted_19, _toDisplayString(snapshot.value.status.queued_rechecks) + " 个局部重查已排队；停止后保留，下一次检查继续处理。", 1))
        : _createCommentVNode("", true)
    ]),
    _createElementVNode("section", _hoisted_20, [
      _createElementVNode("article", null, [
        _createElementVNode("strong", null, _toDisplayString(snapshot.value.problems.length), 1),
        _cache[19] || (_cache[19] = _createElementVNode("span", null, "已经证明的问题", -1))
      ]),
      _createElementVNode("article", null, [
        _createElementVNode("strong", null, _toDisplayString(snapshot.value.confirmations.length), 1),
        _cache[20] || (_cache[20] = _createElementVNode("span", null, "尚未确定，需要补充证据", -1))
      ]),
      _createElementVNode("article", null, [
        _createElementVNode("strong", null, _toDisplayString(snapshot.value.errors.length), 1),
        _createElementVNode("span", null, "读取或预览错误（另有 " + _toDisplayString(pendingObjects.value) + " 个未处理）", 1)
      ]),
      _createElementVNode("article", null, [
        _createElementVNode("strong", null, _toDisplayString(snapshot.value.status.objects || 0), 1),
        _cache[21] || (_cache[21] = _createElementVNode("span", null, "当前作品", -1))
      ])
    ]),
    _createElementVNode("section", _hoisted_21, [
      _createElementVNode("header", null, [
        _cache[22] || (_cache[22] = _createElementVNode("div", null, [
          _createElementVNode("p", { class: "eyebrow" }, "发现的问题"),
          _createElementVNode("h2", null, "整理失败和假成功")
        ], -1)),
        _createElementVNode("span", null, _toDisplayString(snapshot.value.problems.length) + " 项", 1)
      ]),
      (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(snapshot.value.problems, (item) => {
        return (_openBlock(), _createElementBlock("button", {
          key: item.id,
          class: "result-row",
          onClick: $event => (openItem(item))
        }, [
          _createElementVNode("span", null, [
            _createElementVNode("b", null, _toDisplayString(item.title), 1),
            _createElementVNode("small", null, _toDisplayString(item.reason), 1),
            _createElementVNode("small", null, _toDisplayString(item.current_job ? '本轮结果' : '保留的上轮结果，尚未本轮复核') + " · " + _toDisplayString(item.checked_at || '时间未知'), 1)
          ]),
          _cache[23] || (_cache[23] = _createElementVNode("i", null, "查看证据与修复 →", -1))
        ], 8, _hoisted_22))
      }), 128)),
      (!snapshot.value.problems.length)
        ? (_openBlock(), _createElementBlock("p", _hoisted_23, _toDisplayString(running.value ? '已完成的作品还没有形成问题。' : hasResults.value ? '当前没有已经证明的问题。' : '点击“检查现在”开始。'), 1))
        : _createCommentVNode("", true)
    ]),
    (snapshot.value.normal?.length)
      ? (_openBlock(), _createElementBlock("section", _hoisted_24, [
          _createElementVNode("header", null, [
            _cache[24] || (_cache[24] = _createElementVNode("div", null, [
              _createElementVNode("p", { class: "eyebrow" }, "本轮已核对"),
              _createElementVNode("h2", null, "未发现问题的作品")
            ], -1)),
            _createElementVNode("span", null, _toDisplayString(snapshot.value.normal.length) + " 个", 1)
          ]),
          (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(snapshot.value.normal, (item) => {
            return (_openBlock(), _createElementBlock("button", {
              key: item.object_id,
              class: "result-row",
              onClick: $event => (openItem(item))
            }, [
              _createElementVNode("span", null, [
                _createElementVNode("b", null, _toDisplayString(item.title), 1),
                _createElementVNode("small", null, _toDisplayString(item.reason), 1)
              ]),
              _cache[25] || (_cache[25] = _createElementVNode("i", null, "查看核对依据 →", -1))
            ], 8, _hoisted_25))
          }), 128))
        ]))
      : _createCommentVNode("", true),
    _createElementVNode("section", _hoisted_26, [
      _createElementVNode("header", null, [
        _cache[26] || (_cache[26] = _createElementVNode("div", null, [
          _createElementVNode("p", { class: "eyebrow" }, "尚未确定"),
          _createElementVNode("h2", null, "身份歧义或待补充证据")
        ], -1)),
        _createElementVNode("span", null, _toDisplayString(snapshot.value.confirmations.length) + " 项", 1)
      ]),
      (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(snapshot.value.confirmations, (item) => {
        return (_openBlock(), _createElementBlock("button", {
          key: item.id,
          class: "result-row",
          onClick: $event => (openItem(item))
        }, [
          _createElementVNode("span", null, [
            _createElementVNode("b", null, _toDisplayString(item.title), 1),
            _createElementVNode("small", null, _toDisplayString(item.reason), 1),
            _createElementVNode("small", null, _toDisplayString(item.current_job ? '本轮结果' : '保留的上轮结果，尚未本轮复核') + " · " + _toDisplayString(item.checked_at || '时间未知'), 1)
          ]),
          _cache[27] || (_cache[27] = _createElementVNode("i", null, "选择正确答案 →", -1))
        ], 8, _hoisted_27))
      }), 128)),
      (!snapshot.value.confirmations.length)
        ? (_openBlock(), _createElementBlock("p", _hoisted_28, "没有等待你决定的项目。"))
        : _createCommentVNode("", true)
    ]),
    _createElementVNode("section", _hoisted_29, [
      _createElementVNode("header", null, [
        _cache[28] || (_cache[28] = _createElementVNode("div", null, [
          _createElementVNode("p", { class: "eyebrow" }, "本轮没读完"),
          _createElementVNode("h2", null, "明确的读取或预览错误")
        ], -1)),
        _createElementVNode("span", null, _toDisplayString(snapshot.value.errors.length) + " 项", 1)
      ]),
      (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(snapshot.value.errors, (item) => {
        return (_openBlock(), _createElementBlock("button", {
          key: item.id,
          class: "result-row",
          onClick: $event => (openItem(item))
        }, [
          _createElementVNode("span", null, [
            _createElementVNode("b", null, _toDisplayString(item.title), 1),
            _createElementVNode("small", null, _toDisplayString(item.reason), 1),
            _createElementVNode("small", null, _toDisplayString(item.current_job ? '本轮结果' : '保留的上轮结果，尚未本轮复核') + " · " + _toDisplayString(item.checked_at || '时间未知'), 1)
          ]),
          _cache[29] || (_cache[29] = _createElementVNode("i", null, "查看失败阶段 →", -1))
        ], 8, _hoisted_30))
      }), 128)),
      (!snapshot.value.errors.length)
        ? (_openBlock(), _createElementBlock("p", _hoisted_31, "没有读取错误。"))
        : _createCommentVNode("", true)
    ]),
    (selected.value)
      ? (_openBlock(), _createElementBlock("div", {
          key: 1,
          class: "backdrop",
          onClick: _withModifiers(closeDetail, ["self"])
        }, [
          _createElementVNode("section", {
            class: "modal",
            role: "dialog",
            "aria-modal": "true",
            "aria-label": selected.value.title
          }, [
            _createElementVNode("button", {
              class: "close",
              "aria-label": "关闭",
              onClick: closeDetail
            }, "×"),
            _cache[49] || (_cache[49] = _createElementVNode("p", { class: "eyebrow" }, "作品证据", -1)),
            _createElementVNode("h2", null, _toDisplayString(selected.value.title), 1),
            _createElementVNode("p", _hoisted_33, _toDisplayString(selected.value.finding?.reason), 1),
            (message.value)
              ? (_openBlock(), _createElementBlock("p", _hoisted_34, _toDisplayString(message.value), 1))
              : _createCommentVNode("", true),
            (selected.value.repair_result?.status)
              ? (_openBlock(), _createElementBlock("p", _hoisted_35, "最近修复回读：" + _toDisplayString(({ running: '执行中，尚未完成', partial_or_failed: '部分执行或失败；旧许可已失效，请重新检查和预览', verification_pending: '等待回读，不能算成功', verification_read_error: '回读失败，不能算成功', verification_failed: '回读未通过，请重新检查', verified: '新入口与清理范围已回读通过' })[selected.value.repair_result.status] || '尚未完成') + "。已处理 " + _toDisplayString(selected.value.repair_result.completed_sources?.length || 0) + " 个源文件。", 1))
              : _createCommentVNode("", true),
            _createElementVNode("div", _hoisted_36, [
              _createElementVNode("div", null, [
                _cache[30] || (_cache[30] = _createElementVNode("span", null, "文件读取", -1)),
                _createElementVNode("b", null, _toDisplayString(selected.value.source?.object?.complete ? '完整' : '未完整'), 1)
              ]),
              _createElementVNode("div", null, [
                _cache[31] || (_cache[31] = _createElementVNode("span", null, "作品身份", -1)),
                _createElementVNode("b", null, _toDisplayString(selected.value.identity_state === 'confirmed' ? '你已确认' : selected.value.identity_state === 'verified' ? '自动核验通过' : '尚未确定'), 1)
              ]),
              _createElementVNode("div", null, [
                _cache[32] || (_cache[32] = _createElementVNode("span", null, "确认依据", -1)),
                _createElementVNode("b", null, _toDisplayString(provenanceLabel.value), 1)
              ])
            ]),
            (selected.value.relations?.stale)
              ? (_openBlock(), _createElementBlock("p", _hoisted_37, "关系记录需要重新核验，本轮尚不能据此确认文件关联。"))
              : _createCommentVNode("", true),
            (selected.value.identity_state === 'verified')
              ? (_openBlock(), _createElementBlock("p", _hoisted_38, "数据库核验时间：" + _toDisplayString(selected.value.identity_audit?.checked_at || '未知') + "。缓存绑定当前源指纹与核验策略，最长复用 24 小时；文件变化或核验失效后会重新检查。", 1))
              : _createCommentVNode("", true),
            (selected.value.digest?.episode_mapping_review)
              ? (_openBlock(), _createElementBlock("p", _hoisted_39, "作品身份与季集映射分开核验：存在推断集号，官方预览映射状态为 " + _toDisplayString(selected.value.preview?.mapping?.status || '尚未核对') + "；身份通过不代表集号已通过。", 1))
              : _createCommentVNode("", true),
            (selected.value.identity_audit?.detail_comparisons?.length)
              ? (_openBlock(), _createElementBlock("details", _hoisted_40, [
                  _cache[33] || (_cache[33] = _createElementVNode("summary", null, "数据库详情字段核对（不含原始详情）", -1)),
                  (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(selected.value.identity_audit.detail_comparisons, (receipt, index) => {
                    return (_openBlock(), _createElementBlock("p", {
                      key: index,
                      class: "notice"
                    }, _toDisplayString(receipt.requested_key || '请求身份缺失') + " → " + _toDisplayString(receipt.returned_key || '详情身份缺失') + "：" + _toDisplayString(Object.entries(receipt.fields).map(([key, value]) => `${key}=${value}`).join('；')), 1))
                  }), 128))
                ]))
              : _createCommentVNode("", true),
            (selected.value.relations?.coverage?.unsupported_source_count)
              ? (_openBlock(), _createElementBlock("p", _hoisted_41, _toDisplayString(selected.value.relations.coverage.unsupported_source_count) + " 个原盘或目录未进入逐文件配对；当前合同不支持其物理关系，不会算成正常或整理失败。", 1))
              : _createCommentVNode("", true),
            (selected.value.relations?.coverage)
              ? (_openBlock(), _createElementBlock("p", _hoisted_42, "候选已记录 " + _toDisplayString(selected.value.relations.pairs?.length || 0) + " 对，本轮已查 " + _toDisplayString(selected.value.relations.coverage.checked_pairs || 0) + " 对，待查 " + _toDisplayString(selected.value.relations.coverage.pending_pairs || 0) + " 对。" + _toDisplayString(selected.value.relations.coverage.note), 1))
              : _createCommentVNode("", true),
            (selected.value.relations?.coverage)
              ? (_openBlock(), _createElementBlock("p", _hoisted_43, "源视频 " + _toDisplayString(selected.value.relations.coverage.source_video_count ?? '未知') + " 个，已证实关联 " + _toDisplayString(selected.value.relations.coverage.linked_source_count ?? '未知') + " 个，未关联或未证实 " + _toDisplayString(selected.value.relations.coverage.unlinked_or_unproven_sources ?? '未知') + " 个；候选对数不是已覆盖视频数。", 1))
              : _createCommentVNode("", true),
            _createElementVNode("form", {
              class: "choice-area",
              onSubmit: _withModifiers(searchCandidates, ["prevent"])
            }, [
              _cache[34] || (_cache[34] = _createElementVNode("label", { for: "identity-query" }, "搜索正确作品（不使用 AI）", -1)),
              _withDirectives(_createElementVNode("input", {
                id: "identity-query",
                "onUpdate:modelValue": _cache[2] || (_cache[2] = $event => ((identityQuery).value = $event)),
                type: "search",
                maxlength: "120",
                required: ""
              }, null, 512), [
                [_vModelText, identityQuery.value]
              ]),
              _createElementVNode("button", {
                class: "secondary",
                disabled: busy.value || previewing.value
              }, "查询数据库候选", 8, _hoisted_44)
            ], 32),
            (!identityReady.value || choosingIdentity.value)
              ? (_openBlock(), _createElementBlock("section", _hoisted_45, [
                  _cache[43] || (_cache[43] = _createElementVNode("h3", null, "请选择正确作品", -1)),
                  _cache[44] || (_cache[44] = _createElementVNode("p", { class: "notice" }, "证据明确的作品会自动核验，不要求逐部点击。这里保留尚未解决的歧义；你也可补充搜索词或纠正候选。原生识别、历史与 AI 都不能直接决定身份。", -1)),
                  (!selected.value.source?.object?.complete)
                    ? (_openBlock(), _createElementBlock("p", _hoisted_46, "源文件尚未读取完整，请重新检查后再确认身份。"))
                    : _createCommentVNode("", true),
                  (!selected.value.candidates.length)
                    ? (_openBlock(), _createElementBlock("p", _hoisted_47, "尚无可用候选。可以在上方搜索作品；本项不会被算成正常。"))
                    : _createCommentVNode("", true),
                  _createElementVNode("details", null, [
                    _cache[39] || (_cache[39] = _createElementVNode("summary", null, "季集映射（可选，0 表示特别篇）", -1)),
                    _createElementVNode("label", null, [
                      _cache[35] || (_cache[35] = _createTextVNode("固定季度 ", -1)),
                      _withDirectives(_createElementVNode("input", {
                        "onUpdate:modelValue": _cache[3] || (_cache[3] = $event => ((mappingSeason).value = $event)),
                        type: "number",
                        min: "0",
                        max: "999",
                        placeholder: "自动解析"
                      }, null, 512), [
                        [_vModelText, mappingSeason.value]
                      ])
                    ]),
                    _createElementVNode("label", null, [
                      _cache[36] || (_cache[36] = _createTextVNode("官方剧集组 ID ", -1)),
                      _withDirectives(_createElementVNode("input", {
                        "onUpdate:modelValue": _cache[4] || (_cache[4] = $event => ((mappingGroup).value = $event)),
                        maxlength: "200"
                      }, null, 512), [
                        [_vModelText, mappingGroup.value]
                      ])
                    ]),
                    _createElementVNode("label", null, [
                      _cache[37] || (_cache[37] = _createTextVNode("官方集数识别格式 ", -1)),
                      _withDirectives(_createElementVNode("input", {
                        "onUpdate:modelValue": _cache[5] || (_cache[5] = $event => ((mappingFormat).value = $event)),
                        maxlength: "200"
                      }, null, 512), [
                        [_vModelText, mappingFormat.value]
                      ])
                    ]),
                    _createElementVNode("label", null, [
                      _cache[38] || (_cache[38] = _createTextVNode("集数偏移 ", -1)),
                      _withDirectives(_createElementVNode("input", {
                        "onUpdate:modelValue": _cache[6] || (_cache[6] = $event => ((mappingOffset).value = $event)),
                        maxlength: "30"
                      }, null, 512), [
                        [_vModelText, mappingOffset.value]
                      ])
                    ]),
                    _cache[40] || (_cache[40] = _createElementVNode("p", { class: "notice" }, "只在默认季集不适用时填写；确认后会同作品身份一起保存，并用于官方预览和执行。", -1))
                  ]),
                  (selected.value.digest?.episode_mapping_review)
                    ? (_openBlock(), _createElementBlock("p", _hoisted_48, "部分裸集号依据同容器共同标题归纳，仅用于搜索；执行集号仍须检查官方预览，必要时设置映射。"))
                    : _createCommentVNode("", true),
                  (selected.value.digest?.membership_review_required)
                    ? (_openBlock(), _createElementBlock("fieldset", _hoisted_49, [
                        _cache[41] || (_cache[41] = _createElementVNode("legend", null, "这里有多组标题线索：请先选出属于同一作品的文件", -1)),
                        (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(selected.value.file_groups || [], (group) => {
                          return (_openBlock(), _createElementBlock("button", {
                            key: group.hint,
                            type: "button",
                            class: "secondary",
                            onClick: $event => (selectedFileRefs.value = [...new Set([...selectedFileRefs.value, ...group.refs])])
                          }, "选择 " + _toDisplayString(group.hint) + "（" + _toDisplayString(group.count) + " 个）", 9, _hoisted_50))
                        }), 128)),
                        _createElementVNode("button", {
                          type: "button",
                          class: "secondary",
                          onClick: _cache[7] || (_cache[7] = $event => (selectedFileRefs.value = []))
                        }, "清空所选"),
                        (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(visibleFiles.value, (file) => {
                          return (_openBlock(), _createElementBlock("label", {
                            key: file.ref
                          }, [
                            _withDirectives(_createElementVNode("input", {
                              "onUpdate:modelValue": _cache[8] || (_cache[8] = $event => ((selectedFileRefs).value = $event)),
                              type: "checkbox",
                              value: file.ref
                            }, null, 8, _hoisted_51), [
                              [_vModelCheckbox, selectedFileRefs.value]
                            ]),
                            _createTextVNode(" " + _toDisplayString(file.name), 1)
                          ]))
                        }), 128)),
                        _createElementVNode("div", null, [
                          _createElementVNode("button", {
                            class: "secondary",
                            disabled: filePage.value === 0,
                            onClick: _cache[9] || (_cache[9] = $event => (filePage.value--))
                          }, "上一页", 8, _hoisted_52),
                          _createTextVNode(" 第 " + _toDisplayString(filePage.value + 1) + " 页 ", 1),
                          _createElementVNode("button", {
                            class: "secondary",
                            disabled: (filePage.value + 1) * 100 >= selected.value.files.length,
                            onClick: _cache[10] || (_cache[10] = $event => (filePage.value++))
                          }, "下一页", 8, _hoisted_53)
                        ]),
                        _cache[42] || (_cache[42] = _createElementVNode("p", { class: "notice" }, "未选择的文件会继续保留在待确认区，不会遗漏或跟着这部作品整理。", -1))
                      ]))
                    : _createCommentVNode("", true),
                  (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(selected.value.candidates, (candidate) => {
                    return (_openBlock(), _createElementBlock("button", {
                      key: candidateKey(candidate),
                      class: "candidate",
                      disabled: busy.value || !selected.value.source?.object?.complete || (selected.value.digest?.membership_review_required && !selectedFileRefs.value.length),
                      onClick: $event => (confirmIdentity(candidate))
                    }, [
                      _createElementVNode("b", null, _toDisplayString(candidate.title || candidate.original_title || '未命名候选'), 1),
                      _createElementVNode("span", null, _toDisplayString(candidate.year || '年份未知') + " · " + _toDisplayString(candidate.media_type) + " · " + _toDisplayString(candidate.media_source) + "/" + _toDisplayString(candidate.media_id), 1)
                    ], 8, _hoisted_54))
                  }), 128))
                ]))
              : (_openBlock(), _createElementBlock("section", _hoisted_55, [
                  _createElementVNode("h3", null, _toDisplayString(selected.value.identity.title || selected.value.identity.original_title), 1),
                  _createElementVNode("p", null, _toDisplayString(selected.value.identity.year || '年份未知') + " · " + _toDisplayString(selected.value.identity.media_type) + " · " + _toDisplayString(selected.value.identity.media_source) + "/" + _toDisplayString(selected.value.identity.media_id), 1),
                  (selected.value.identity_state === 'verified')
                    ? (_openBlock(), _createElementBlock("p", _hoisted_56, "自动核验只表示源文件命名证据与数据库相符，不代表视频内容鉴定或整剧下载完整。可据此进行只读对账，是否完成以该项结果为准；自动核验不授予媒体修复许可。"))
                    : _createCommentVNode("", true),
                  _createElementVNode("button", {
                    class: "secondary",
                    disabled: busy.value || previewing.value,
                    onClick: editIdentity
                  }, "身份或季集不对？纠正它", 8, _hoisted_57),
                  _createElementVNode("button", {
                    class: "primary",
                    disabled: busy.value || previewing.value || !selected.value.source?.object?.complete,
                    onClick: previewRepair
                  }, _toDisplayString(previewing.value ? '正在后台生成只读预览…' : '重新读取并生成修复预览'), 9, _hoisted_58)
                ])),
            (repairPlan.value)
              ? (_openBlock(), _createElementBlock("section", _hoisted_59, [
                  _cache[46] || (_cache[46] = _createElementVNode("h3", null, "整理前后对比", -1)),
                  _cache[47] || (_cache[47] = _createElementVNode("div", { class: "compare-head" }, [
                    _createElementVNode("b", null, "原文件"),
                    _createElementVNode("b", null, "当前硬链接"),
                    _createElementVNode("b", null, "修复后")
                  ], -1)),
                  (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(repairPlan.value.entries, (row, index) => {
                    return (_openBlock(), _createElementBlock("div", {
                      key: index,
                      class: "compare-row"
                    }, [
                      _createElementVNode("span", null, _toDisplayString(row.source?.path), 1),
                      _createElementVNode("span", null, _toDisplayString(row.old_items?.map(item => item.path).join('；') || row.current || '没有旧入口'), 1),
                      _createElementVNode("span", null, _toDisplayString(row.expected) + " · " + _toDisplayString(row.action === 'keep' ? '保留，不重建' : '建立新链接'), 1)
                    ]))
                  }), 128)),
                  _cache[48] || (_cache[48] = _createElementVNode("p", { class: "warning" }, "先由 MoviePilot 建立缺少的新链接，全部回读证实后，才用官方单文件删除清理获准的旧入口。不清理父目录，不删除原始下载；执行失败会保留部分完成回执。", -1)),
                  (repairPlan.value.unplanned_files?.length)
                    ? (_openBlock(), _createElementBlock("p", _hoisted_60, "另有 " + _toDisplayString(repairPlan.value.unplanned_files.length) + " 个附件或不支持的项目未列入官方计划，本次不会擅自处理。", 1))
                    : _createCommentVNode("", true),
                  (repairPlan.value.entries.some(row => row.cleanup_attributable))
                    ? (_openBlock(), _createElementBlock("label", _hoisted_61, [
                        _withDirectives(_createElementVNode("input", {
                          "onUpdate:modelValue": _cache[11] || (_cache[11] = $event => ((cleanupApproved).value = $event)),
                          type: "checkbox"
                        }, null, 512), [
                          [_vModelCheckbox, cleanupApproved.value]
                        ]),
                        _cache[45] || (_cache[45] = _createTextVNode(" 我另外同意清理预览中列出的旧入口", -1))
                      ]))
                    : _createCommentVNode("", true),
                  (readOnly.value)
                    ? (_openBlock(), _createElementBlock("p", _hoisted_62, "这是只读预览，不会执行。完成只读验收并获单项许可后，才在设置中关闭只读模式。"))
                    : (!confirmingRepair.value)
                      ? (_openBlock(), _createElementBlock("button", {
                          key: 3,
                          class: "danger",
                          disabled: busy.value || needsCleanupApproval.value,
                          onClick: _cache[12] || (_cache[12] = $event => (confirmingRepair.value = true))
                        }, "继续到最终确认", 8, _hoisted_63))
                      : (_openBlock(), _createElementBlock("div", _hoisted_64, [
                          _createElementVNode("b", null, "确认按 " + _toDisplayString(selected.value.identity.title) + "（" + _toDisplayString(selected.value.identity.year) + " · " + _toDisplayString(selected.value.identity.media_type) + " · " + _toDisplayString(selected.value.identity.media_source) + "/" + _toDisplayString(selected.value.identity.media_id) + "）执行此计划？", 1),
                          _createElementVNode("button", {
                            class: "secondary",
                            onClick: _cache[13] || (_cache[13] = $event => (confirmingRepair.value = false))
                          }, "返回"),
                          _createElementVNode("button", {
                            class: "danger",
                            disabled: busy.value || readOnly.value || needsCleanupApproval.value,
                            onClick: executeRepair
                          }, "确认修复", 8, _hoisted_65)
                        ]))
                ]))
              : _createCommentVNode("", true)
          ], 8, _hoisted_32)
        ]))
      : _createCommentVNode("", true)
  ]))
}
}

};
const AppPage = /*#__PURE__*/_export_sfc(_sfc_main, [['__scopeId',"data-v-eeb4b986"]]);

export { AppPage as default };
