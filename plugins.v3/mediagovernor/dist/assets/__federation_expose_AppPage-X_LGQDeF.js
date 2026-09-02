import { importShared } from './__federation_fn_import-JrT3xvdd.js';
import { _ as _export_sfc } from './_plugin-vue_export-helper-pcqpp-6-.js';

const {createElementVNode:_createElementVNode,toDisplayString:_toDisplayString,openBlock:_openBlock,createElementBlock:_createElementBlock,createCommentVNode:_createCommentVNode,normalizeStyle:_normalizeStyle,renderList:_renderList,Fragment:_Fragment,withModifiers:_withModifiers} = await importShared('vue');


const _hoisted_1 = { class: "governor-page" };
const _hoisted_2 = { class: "page-header" };
const _hoisted_3 = ["disabled"];
const _hoisted_4 = {
  key: 0,
  class: "notice",
  role: "status"
};
const _hoisted_5 = {
  key: 1,
  class: "start-panel",
  "aria-label": "开始整理检查"
};
const _hoisted_6 = { class: "start-copy" };
const _hoisted_7 = ["disabled"];
const _hoisted_8 = {
  key: 2,
  class: "result-panel",
  "aria-label": "检查结果"
};
const _hoisted_9 = { class: "result-heading" };
const _hoisted_10 = { class: "header-actions" };
const _hoisted_11 = ["disabled"];
const _hoisted_12 = ["disabled"];
const _hoisted_13 = {
  class: "progress-wrap",
  "aria-label": "检查进度"
};
const _hoisted_14 = { class: "progress-copy" };
const _hoisted_15 = { key: 0 };
const _hoisted_16 = { key: 1 };
const _hoisted_17 = { class: "progress-track" };
const _hoisted_18 = {
  class: "overview",
  "aria-label": "检查结果概览"
};
const _hoisted_19 = {
  key: 0,
  class: "unresolved"
};
const _hoisted_20 = {
  key: 1,
  class: "empty"
};
const _hoisted_21 = {
  key: 2,
  class: "issues"
};
const _hoisted_22 = { class: "issue-copy" };
const _hoisted_23 = { class: "issue-type" };
const _hoisted_24 = ["onClick"];
const _hoisted_25 = {
  class: "modal",
  role: "dialog",
  "aria-modal": "true",
  "aria-label": "整理检查结论"
};
const _hoisted_26 = { class: "modal-header" };
const _hoisted_27 = { class: "modal-section" };
const _hoisted_28 = {
  key: 0,
  class: "modal-section"
};
const _hoisted_29 = ["disabled"];
const _hoisted_30 = ["disabled"];
const _hoisted_31 = {
  key: 1,
  class: "manual-guide"
};
const _hoisted_32 = {
  class: "modal confirm",
  role: "dialog",
  "aria-modal": "true",
  "aria-label": "确认创建硬链接"
};
const _hoisted_33 = { class: "actions" };
const _hoisted_34 = ["disabled"];
const _hoisted_35 = ["disabled"];

const {computed,inject,nextTick,onMounted,ref} = await importShared('vue');



const _sfc_main = {
  __name: 'AppPage',
  props: { api: { type: Object, default: () => ({}) }, pluginId: { type: String, default: 'MediaGovernor' } },
  setup(__props) {

const props = __props;
const toast = inject('moviepilot:toast', null);
const loading = ref(false);
const notice = ref('');
const result = ref({ items: [], summary: { state: 'idle', total: 0, checked: 0, pending: 0 } });
const plans = ref([]);
const selected = ref(null);
const previewResult = ref(null);
const pendingRepair = ref(null);
const stopRequested = ref(false);
const cards = computed(() => result.value.items || []);
const summary = computed(() => result.value.summary || {});
const hasRun = computed(() => summary.value.state !== 'idle');
const completed = computed(() => summary.value.state === 'complete');
const running = computed(() => summary.value.state === 'running');
const progress = computed(() => summary.value.total ? Math.round((summary.value.checked || 0) * 100 / summary.value.total) : 0);

const auditGuide = {
  needs_preview: { label: '已识别，待生成方案', detail: '作品已经确认；打开后可只对这一条模拟硬链接。' },
  ready_to_plan: { label: '可以处理', detail: '已经识别作品，并确认目前可以安全创建硬链接。' },
  preview_rejected: { label: '暂不能处理', detail: '已经识别作品，但这次检查不能安全创建硬链接。' },
  quality_issue: { label: '成功记录存在问题', detail: '这条记录表面显示成功，但历史信息表明它没有按预期使用硬链接。' },
  identity_unresolved: { label: '无法自动识别', detail: '历史记录的信息不足，暂时不能可靠确定这是什么作品。' },
  source_unavailable: { label: '记录已不可用', detail: 'MoviePilot 已无法读取这条历史记录，因此不会尝试处理它。' },
};
const fallbackGuide = { label: '需要进一步核对', detail: '这条记录需要进一步核对；系统不会猜测作品或改动文件。' };

function titleFor(card) {
  if (!card?.title) return '这条历史记录已无法读取'
  return `${card.title}${card.year ? `（${card.year}）` : ''}`
}
function guideFor(card) { return auditGuide[card?.status] || fallbackGuide }
function planFor(card) { return plans.value.find(plan => plan.history_id === card?.history_id && plan.status === 'ready') || null }
function latestCheck(card) {
  if (previewResult.value) return previewResult.value
  if (card?.status === 'ready_to_plan') return { tone: 'ready', title: '可以创建硬链接', detail: '批量检查已通过。生成处理方案后，仍需你确认才会真正创建硬链接。' }
  if (card?.status === 'needs_preview') return { tone: 'ready', title: '可以生成处理方案', detail: '作品身份已经确认。下一步只会模拟这一条记录能否安全创建硬链接，不会改动文件。' }
  if (card?.status === 'preview_rejected') return { tone: 'blocked', title: '现在不能安全处理', detail: '这次检查没有通过；没有创建、删除、移动或改名任何文件。' }
  if (card?.status === 'quality_issue') return { tone: 'blocked', title: '成功记录需要重新核对', detail: '系统发现整理方式不符合当前硬链接要求；尚未改动任何文件。' }
  return { tone: 'blocked', title: '无法自动识别', detail: '没有可靠作品身份时，系统不会把原始任务名当成影片名，也不会自动处理。' }
}

async function refresh(showSpinner = true) {
  if (typeof props.api?.get !== 'function') { notice.value = '当前 MoviePilot 未提供插件数据接口'; return }
  if (showSpinner) loading.value = true;
  try {
    const [packages, nextPlans] = await Promise.all([props.api.get(`plugin/${props.pluginId}/packages`), props.api.get(`plugin/${props.pluginId}/plans`)]);
    result.value = packages?.data ?? packages ?? { items: [], summary: {} };
    plans.value = (nextPlans?.data ?? nextPlans ?? {}).items || [];
    notice.value = '';
  } catch (cause) { notice.value = cause?.message || '暂时无法读取检查结果'; }
  finally { if (showSpinner) loading.value = false; }
}

async function auditAll() {
  if (typeof props.api?.post !== 'function') { notice.value = '当前 MoviePilot 未提供检查接口'; return }
  loading.value = true;
  notice.value = '';
  try {
    stopRequested.value = false;
    const response = await props.api.post(`plugin/${props.pluginId}/audit`);
    const data = response?.data ?? response;
    await refresh(false);
    if (!data?.ok) { notice.value = '检查没有开始，未改动任何文件。'; return }
    await runNextItems();
  } catch (cause) { notice.value = cause?.message || '检查没有完成，未改动任何文件。'; }
  finally { loading.value = false; }
}

async function runNextItems() {
  while (!stopRequested.value && summary.value.state === 'running') {
    await props.api.post(`plugin/${props.pluginId}/audit/next`);
    await refresh(false);
    await nextTick();
  }
  if (summary.value.state === 'complete') notice.value = '检查完成：已逐条核对，期间没有改动影片文件、下载器或既有整理规则。';
  else if (summary.value.state === 'paused') notice.value = '检查已暂停。进度已保存，稍后点击“继续检查”会从下一条开始。';
}

async function pauseAudit() {
  if (typeof props.api?.post !== 'function') return
  stopRequested.value = true;
  await props.api.post(`plugin/${props.pluginId}/audit/pause`);
  await refresh(false);
  notice.value = '检查已暂停。已完成的结论已保存，未开始的记录不会丢失。';
}

function openIssue(card) { selected.value = card; previewResult.value = null; }
function closeIssue() { selected.value = null; previewResult.value = null; }
async function preparePlan(card) {
  if (!card?.history_id || typeof props.api?.post !== 'function') return
  loading.value = true;
  try {
    const response = await props.api.post(`plugin/${props.pluginId}/packages/${card.history_id}/preview`);
    const data = response?.data ?? response;
    await refresh();
    previewResult.value = data?.ok
      ? { tone: 'ready', title: '处理方案已准备好', detail: '系统只准备了创建硬链接的方案；请确认作品和结论后再执行。' }
      : { tone: 'blocked', title: '现在不能安全处理', detail: '没有生成处理方案，也没有改动任何文件。' };
  } catch (cause) { previewResult.value = { tone: 'blocked', title: '检查没有完成', detail: cause?.message || '没有生成处理方案，也没有改动任何文件。' }; }
  finally { loading.value = false; }
}
function requestRepair(plan) { pendingRepair.value = plan; }
async function repair() {
  const plan = pendingRepair.value;
  if (!plan || typeof props.api?.post !== 'function') return
  loading.value = true;
  try {
    const response = await props.api.post(`plugin/${props.pluginId}/plans/${plan.plan_id}/repair`);
    const data = response?.data ?? response;
    await refresh();
    notice.value = data?.ok ? '已创建硬链接；原文件、下载器和既有整理规则没有改动。' : '没有完成硬链接创建；原文件没有被删除或移动。';
    if (data?.ok) toast?.success?.('已完成硬链接创建');
  } catch (cause) { notice.value = cause?.message || '没有完成硬链接创建；原文件没有被删除或移动。'; }
  finally { loading.value = false; pendingRepair.value = null; }
}
onMounted(refresh);

return (_ctx, _cache) => {
  return (_openBlock(), _createElementBlock("main", _hoisted_1, [
    _createElementVNode("header", _hoisted_2, [
      _cache[4] || (_cache[4] = _createElementVNode("div", null, [
        _createElementVNode("h1", null, "整理质量检查"),
        _createElementVNode("p", null, "这是整理流程的最后一道检查：逐条核对历史异常，找出需要处理的项目。检查不会移动、删除、改名或创建文件。")
      ], -1)),
      _createElementVNode("button", {
        class: "secondary",
        disabled: loading.value,
        onClick: refresh
      }, _toDisplayString(loading.value ? '正在读取…' : '更新进度'), 9, _hoisted_3)
    ]),
    (notice.value)
      ? (_openBlock(), _createElementBlock("p", _hoisted_4, _toDisplayString(notice.value), 1))
      : _createCommentVNode("", true),
    (!hasRun.value)
      ? (_openBlock(), _createElementBlock("section", _hoisted_5, [
          _createElementVNode("div", _hoisted_6, [
            _createElementVNode("h2", null, _toDisplayString(summary.value.total ? `有 ${summary.value.total} 条历史记录等待检查` : '还没有需要检查的历史记录'), 1),
            _createElementVNode("p", null, _toDisplayString(summary.value.total ? '先逐条确认 MoviePilot 已保存的影片信息；只有仍需处理的记录才会显示出来。' : 'MoviePilot 尚未提供需要处理的失败记录。'), 1)
          ]),
          (summary.value.total)
            ? (_openBlock(), _createElementBlock("button", {
                key: 0,
                class: "primary primary-large",
                disabled: loading.value,
                onClick: auditAll
              }, _toDisplayString(loading.value ? '正在检查全部记录…' : '一键检查全部（不改文件）'), 9, _hoisted_7))
            : _createCommentVNode("", true)
        ]))
      : (_openBlock(), _createElementBlock("section", _hoisted_8, [
          _createElementVNode("div", _hoisted_9, [
            _createElementVNode("div", null, [
              _createElementVNode("h2", null, _toDisplayString(completed.value ? '检查完成' : (running.value ? '正在检查' : '检查已暂停')), 1),
              _createElementVNode("p", null, "已检查 " + _toDisplayString(summary.value.checked || 0) + " / " + _toDisplayString(summary.value.total || 0) + " 条历史记录。检查会逐条保存结果，刷新页面也不会丢失进度。", 1)
            ]),
            _createElementVNode("div", _hoisted_10, [
              (running.value)
                ? (_openBlock(), _createElementBlock("button", {
                    key: 0,
                    class: "secondary",
                    disabled: loading.value,
                    onClick: pauseAudit
                  }, "暂停检查", 8, _hoisted_11))
                : _createCommentVNode("", true),
              (!completed.value && !running.value)
                ? (_openBlock(), _createElementBlock("button", {
                    key: 1,
                    class: "primary",
                    disabled: loading.value,
                    onClick: auditAll
                  }, "继续检查", 8, _hoisted_12))
                : _createCommentVNode("", true)
            ])
          ]),
          _createElementVNode("div", _hoisted_13, [
            _createElementVNode("div", _hoisted_14, [
              _createElementVNode("strong", null, _toDisplayString(progress.value) + "%", 1),
              (running.value)
                ? (_openBlock(), _createElementBlock("span", _hoisted_15, "正在核对第 " + _toDisplayString((summary.value.checked || 0) + 1) + " 条", 1))
                : (_openBlock(), _createElementBlock("span", _hoisted_16, "本轮进度已保存"))
            ]),
            _createElementVNode("div", _hoisted_17, [
              _createElementVNode("div", {
                class: "progress-bar",
                style: _normalizeStyle({ width: `${progress.value}%` })
              }, null, 4)
            ])
          ]),
          _createElementVNode("div", _hoisted_18, [
            _createElementVNode("article", null, [
              _createElementVNode("strong", null, _toDisplayString(summary.value.actionable || 0), 1),
              _cache[5] || (_cache[5] = _createElementVNode("span", null, "可生成方案", -1))
            ]),
            _createElementVNode("article", null, [
              _createElementVNode("strong", null, _toDisplayString(summary.value.ready_for_preview || 0), 1),
              _cache[6] || (_cache[6] = _createElementVNode("span", null, "等待核对", -1))
            ]),
            _createElementVNode("article", null, [
              _createElementVNode("strong", null, _toDisplayString(summary.value.blocked || 0), 1),
              _cache[7] || (_cache[7] = _createElementVNode("span", null, "暂不能处理", -1))
            ]),
            _createElementVNode("article", null, [
              _createElementVNode("strong", null, _toDisplayString(summary.value.unresolved || 0), 1),
              _cache[8] || (_cache[8] = _createElementVNode("span", null, "信息不足", -1))
            ])
          ]),
          (summary.value.unresolved)
            ? (_openBlock(), _createElementBlock("section", _hoisted_19, [
                _createElementVNode("h3", null, _toDisplayString(summary.value.unresolved) + " 条记录没有查到可靠作品身份", 1),
                _cache[9] || (_cache[9] = _createElementVNode("p", null, "系统已经尝试按原有整理链路识别；因为没有足够证据确认片名，所以不会猜测、不会把原始文件名当成影片名，也不会把它们伪装成可处理的问题卡。", -1))
              ]))
            : _createCommentVNode("", true),
          (!cards.value.length)
            ? (_openBlock(), _createElementBlock("div", _hoisted_20, [...(_cache[10] || (_cache[10] = [
                _createElementVNode("h3", null, "目前没有需要处理的记录", -1),
                _createElementVNode("p", null, "已检查的历史异常没有发现需要你继续处理的问题。", -1)
              ]))]))
            : (_openBlock(), _createElementBlock("div", _hoisted_21, [
                (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(cards.value, (card) => {
                  return (_openBlock(), _createElementBlock("article", {
                    key: card.history_id,
                    class: "issue-card"
                  }, [
                    _createElementVNode("div", _hoisted_22, [
                      _createElementVNode("span", _hoisted_23, _toDisplayString(guideFor(card).label), 1),
                      _createElementVNode("h3", null, _toDisplayString(titleFor(card)), 1),
                      _createElementVNode("p", null, _toDisplayString(guideFor(card).detail), 1)
                    ]),
                    _createElementVNode("button", {
                      class: "primary",
                      onClick: $event => (openIssue(card))
                    }, "查看问题和方案", 8, _hoisted_24)
                  ]))
                }), 128))
              ]))
        ])),
    (selected.value)
      ? (_openBlock(), _createElementBlock("div", {
          key: 3,
          class: "modal-backdrop",
          onClick: _withModifiers(closeIssue, ["self"])
        }, [
          _createElementVNode("section", _hoisted_25, [
            _createElementVNode("header", _hoisted_26, [
              _createElementVNode("div", null, [
                _cache[11] || (_cache[11] = _createElementVNode("span", { class: "modal-label" }, "检查结论", -1)),
                _createElementVNode("h2", null, _toDisplayString(titleFor(selected.value)), 1)
              ]),
              _createElementVNode("button", {
                class: "icon-button",
                "aria-label": "关闭",
                onClick: closeIssue
              }, "×")
            ]),
            _createElementVNode("section", _hoisted_27, [
              _createElementVNode("h3", null, _toDisplayString(latestCheck(selected.value).title), 1),
              _createElementVNode("p", null, _toDisplayString(latestCheck(selected.value).detail), 1)
            ]),
            (selected.value.status === 'needs_preview' || selected.value.status === 'ready_to_plan')
              ? (_openBlock(), _createElementBlock("section", _hoisted_28, [
                  _cache[12] || (_cache[12] = _createElementVNode("h3", null, "下一步", -1)),
                  _cache[13] || (_cache[13] = _createElementVNode("p", null, "先生成一份即时处理方案。它仍然不会改文件；只有你在下一步确认后才会创建硬链接。", -1)),
                  (!planFor(selected.value))
                    ? (_openBlock(), _createElementBlock("button", {
                        key: 0,
                        class: "primary wide",
                        disabled: loading.value,
                        onClick: _cache[0] || (_cache[0] = $event => (preparePlan(selected.value)))
                      }, _toDisplayString(loading.value ? '正在准备方案…' : '生成处理方案（不改文件）'), 9, _hoisted_29))
                    : (_openBlock(), _createElementBlock("button", {
                        key: 1,
                        class: "primary wide",
                        disabled: loading.value,
                        onClick: _cache[1] || (_cache[1] = $event => (requestRepair(planFor(selected.value))))
                      }, "确认创建硬链接", 8, _hoisted_30))
                ]))
              : _createCommentVNode("", true),
            (selected.value.status !== 'needs_preview' && selected.value.status !== 'ready_to_plan')
              ? (_openBlock(), _createElementBlock("details", _hoisted_31, [...(_cache[14] || (_cache[14] = [
                  _createElementVNode("summary", null, "仍无法处理？查看人工步骤", -1),
                  _createElementVNode("ol", null, [
                    _createElementVNode("li", null, "在 MoviePilot 的搜索页确认作品、年份和类型。"),
                    _createElementVNode("li", null, "在整理或历史记录中确认它是否已经入库；已入库就不需要处理。"),
                    _createElementVNode("li", null, "确认仍未入库后，修正可识别的名称，再重新执行“一键检查全部”。")
                  ], -1)
                ]))]))
              : _createCommentVNode("", true)
          ])
        ]))
      : _createCommentVNode("", true),
    (pendingRepair.value)
      ? (_openBlock(), _createElementBlock("div", {
          key: 4,
          class: "modal-backdrop",
          onClick: _cache[3] || (_cache[3] = _withModifiers($event => (pendingRepair.value = null), ["self"]))
        }, [
          _createElementVNode("section", _hoisted_32, [
            _cache[15] || (_cache[15] = _createElementVNode("h2", null, "确认创建硬链接？", -1)),
            _cache[16] || (_cache[16] = _createElementVNode("p", null, "系统只会为这一个已检查通过的项目创建硬链接。", -1)),
            _cache[17] || (_cache[17] = _createElementVNode("ul", null, [
              _createElementVNode("li", null, "不会删除、移动、改名或覆盖原文件"),
              _createElementVNode("li", null, "不会修改下载器、代理或既有整理规则"),
              _createElementVNode("li", null, "完成后会回到此页面显示结果")
            ], -1)),
            _createElementVNode("div", _hoisted_33, [
              _createElementVNode("button", {
                class: "secondary",
                disabled: loading.value,
                onClick: _cache[2] || (_cache[2] = $event => (pendingRepair.value = null))
              }, "返回", 8, _hoisted_34),
              _createElementVNode("button", {
                class: "primary",
                disabled: loading.value,
                onClick: repair
              }, "确认创建", 8, _hoisted_35)
            ])
          ])
        ]))
      : _createCommentVNode("", true)
  ]))
}
}

};
const AppPage = /*#__PURE__*/_export_sfc(_sfc_main, [['__scopeId',"data-v-e21f332c"]]);

export { AppPage as default };
