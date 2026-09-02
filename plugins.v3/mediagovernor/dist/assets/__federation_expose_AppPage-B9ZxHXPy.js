import { importShared } from './__federation_fn_import-JrT3xvdd.js';
import { _ as _export_sfc } from './_plugin-vue_export-helper-pcqpp-6-.js';

const {createElementVNode:_createElementVNode,toDisplayString:_toDisplayString,openBlock:_openBlock,createElementBlock:_createElementBlock,createCommentVNode:_createCommentVNode,normalizeStyle:_normalizeStyle,renderList:_renderList,Fragment:_Fragment,createTextVNode:_createTextVNode,withModifiers:_withModifiers} = await importShared('vue');


const _hoisted_1 = { class: "governor-page" };
const _hoisted_2 = { class: "page-header" };
const _hoisted_3 = ["disabled"];
const _hoisted_4 = {
  key: 0,
  class: "notice",
  role: "status"
};
const _hoisted_5 = {
  class: "result-panel",
  "aria-label": "检查结果"
};
const _hoisted_6 = { class: "result-heading" };
const _hoisted_7 = { class: "header-actions" };
const _hoisted_8 = ["disabled"];
const _hoisted_9 = ["disabled"];
const _hoisted_10 = ["disabled"];
const _hoisted_11 = {
  class: "progress-wrap",
  "aria-label": "检查进度"
};
const _hoisted_12 = { class: "progress-copy" };
const _hoisted_13 = { key: 0 };
const _hoisted_14 = { key: 1 };
const _hoisted_15 = { key: 2 };
const _hoisted_16 = { class: "progress-track" };
const _hoisted_17 = {
  class: "overview",
  "aria-label": "检查结果概览"
};
const _hoisted_18 = {
  key: 0,
  class: "unresolved"
};
const _hoisted_19 = {
  key: 1,
  class: "empty"
};
const _hoisted_20 = {
  key: 2,
  class: "issues"
};
const _hoisted_21 = { class: "issue-copy" };
const _hoisted_22 = { class: "issue-type" };
const _hoisted_23 = { class: "finding-list" };
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
  class: "modal confirm",
  role: "dialog",
  "aria-modal": "true",
  "aria-label": "确认批量创建硬链接"
};
const _hoisted_32 = { class: "actions" };
const _hoisted_33 = ["disabled"];
const _hoisted_34 = ["disabled"];

const {computed,nextTick,onMounted,ref} = await importShared('vue');



const _sfc_main = {
  __name: 'AppPage',
  props: { api: { type: Object, default: () => ({}) }, pluginId: { type: String, default: 'MediaGovernor' } },
  setup(__props) {

const props = __props;
const loading = ref(false);
const notice = ref('');
const result = ref({ items: [], summary: { state: 'idle', total: 0, checked: 0, pending: 0 } });
const plans = ref([]);
const selected = ref(null);
const pendingGroupRepair = ref(null);
const stopRequested = ref(false);
const cards = computed(() => result.value.items || []);
const summary = computed(() => result.value.summary || {});
const completed = computed(() => summary.value.state === 'complete');
const running = computed(() => summary.value.state === 'running');
const paused = computed(() => summary.value.state === 'paused');
const progress = computed(() => summary.value.total ? Math.round((summary.value.checked || 0) * 100 / summary.value.total) : 0);

function titleFor(card) {
  if (!card?.title) return '作品信息不足，无法合并展示'
  return `${card.title}${card.year ? `（${card.year}）` : ''}`
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
    if (!data?.ok) { notice.value = '新一轮检查没有开始，未改动任何文件。'; return }
    await runNextItems();
  } catch (cause) { notice.value = cause?.message || '本轮检查没有完成，未改动任何文件。'; }
  finally { loading.value = false; }
}

async function resumeAudit() {
  if (typeof props.api?.post !== 'function') { notice.value = '当前 MoviePilot 未提供检查接口'; return }
  loading.value = true;
  notice.value = '';
  try {
    stopRequested.value = false;
    const response = await props.api.post(`plugin/${props.pluginId}/audit/resume`);
    const data = response?.data ?? response;
    await refresh(false);
    if (!data?.ok) { notice.value = '没有可继续的本轮检查。你可以直接开始一次新的检查。'; return }
    await runNextItems();
  } catch (cause) { notice.value = cause?.message || '继续检查没有完成，未改动任何文件。'; }
  finally { loading.value = false; }
}

async function runNextItems() {
  while (!stopRequested.value && summary.value.state === 'running') {
    await props.api.post(`plugin/${props.pluginId}/audit/next`);
    await refresh(false);
    await nextTick();
  }
  if (summary.value.state === 'complete') notice.value = '本轮检查完成。你可以随时点击“再次检查全部”开始新一轮；期间没有改动影片文件、下载器或既有整理规则。';
  else if (summary.value.state === 'paused') notice.value = '检查已暂停。进度已保存，稍后点击“继续检查”会从下一条开始。';
}

async function pauseAudit() {
  if (typeof props.api?.post !== 'function') return
  stopRequested.value = true;
  await props.api.post(`plugin/${props.pluginId}/audit/pause`);
  await refresh(false);
  notice.value = '检查已暂停。已完成的结论已保存，未开始的记录不会丢失。';
}

function openIssue(card) { selected.value = card; }
function closeIssue() { selected.value = null; }

function readyPlansFor(card) {
  const ids = new Set(card?.repairable_history_ids || []);
  return plans.value.filter(plan => ids.has(plan.history_id) && plan.status === 'ready')
}

async function prepareGroupPlans(card) {
  const historyIds = card?.repairable_history_ids || [];
  if (!historyIds.length || typeof props.api?.post !== 'function') return
  loading.value = true;
  notice.value = '';
  try {
    let ready = 0;
    for (const historyId of historyIds) {
      const response = await props.api.post(`plugin/${props.pluginId}/packages/${historyId}/preview`);
      const data = response?.data ?? response;
      if (data?.ok && data?.plan?.status === 'ready') ready += 1;
    }
    await refresh(false);
    notice.value = ready ? `已为“${titleFor(card)}”准备 ${ready} 条零写入修复方案；请先查看后再确认创建硬链接。` : '没有生成可安全执行的修复方案；检查没有改动任何文件。';
  } catch (cause) { notice.value = cause?.message || '生成修复方案没有完成；没有改动任何文件。'; }
  finally { loading.value = false; }
}

async function repairGroup() {
  const card = pendingGroupRepair.value;
  const readyPlans = readyPlansFor(card);
  if (!readyPlans.length || typeof props.api?.post !== 'function') { pendingGroupRepair.value = null; return }
  loading.value = true;
  try {
    let completedCount = 0;
    for (const plan of readyPlans) {
      const response = await props.api.post(`plugin/${props.pluginId}/plans/${plan.plan_id}/repair`);
      const data = response?.data ?? response;
      if (data?.ok) completedCount += 1;
    }
    await refresh(false);
    notice.value = completedCount === readyPlans.length
      ? `已为“${titleFor(card)}”创建 ${completedCount} 条硬链接；原文件没有被删除、移动或改名。`
      : `已创建 ${completedCount} / ${readyPlans.length} 条硬链接；其余项目没有被删除、移动或覆盖。`;
  } catch (cause) { notice.value = cause?.message || '批量创建没有完成；未完成项目的原文件没有被删除、移动或覆盖。'; }
  finally { loading.value = false; pendingGroupRepair.value = null; }
}
onMounted(refresh);

return (_ctx, _cache) => {
  return (_openBlock(), _createElementBlock("main", _hoisted_1, [
    _createElementVNode("header", _hoisted_2, [
      _cache[4] || (_cache[4] = _createElementVNode("div", null, [
        _createElementVNode("h1", null, "整理质量检查"),
        _createElementVNode("p", null, "按作品汇总核对 MoviePilot 的整理历史。每次检查都会从当前历史记录重新开始；检查本身不会移动、删除、改名或创建文件。")
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
    _createElementVNode("section", _hoisted_5, [
      _createElementVNode("div", _hoisted_6, [
        _createElementVNode("div", null, [
          _createElementVNode("h2", null, _toDisplayString(completed.value ? '本轮检查完成' : (running.value ? '正在检查' : (paused.value ? '检查已暂停' : '准备开始检查'))), 1),
          _createElementVNode("p", null, "已检查 " + _toDisplayString(summary.value.checked || 0) + " / " + _toDisplayString(summary.value.total || 0) + " 条历史记录。暂停后可以继续；完成后可以随时重新检查全部记录。", 1)
        ]),
        _createElementVNode("div", _hoisted_7, [
          (running.value)
            ? (_openBlock(), _createElementBlock("button", {
                key: 0,
                class: "secondary",
                disabled: loading.value,
                onClick: pauseAudit
              }, "暂停检查", 8, _hoisted_8))
            : (paused.value)
              ? (_openBlock(), _createElementBlock("button", {
                  key: 1,
                  class: "primary",
                  disabled: loading.value,
                  onClick: resumeAudit
                }, "继续本轮检查", 8, _hoisted_9))
              : (_openBlock(), _createElementBlock("button", {
                  key: 2,
                  class: "primary",
                  disabled: loading.value,
                  onClick: auditAll
                }, _toDisplayString(completed.value ? '再次检查全部' : '开始检查全部'), 9, _hoisted_10))
        ])
      ]),
      _createElementVNode("div", _hoisted_11, [
        _createElementVNode("div", _hoisted_12, [
          _createElementVNode("strong", null, _toDisplayString(progress.value) + "%", 1),
          (running.value)
            ? (_openBlock(), _createElementBlock("span", _hoisted_13, "正在核对第 " + _toDisplayString((summary.value.checked || 0) + 1) + " 条", 1))
            : (completed.value)
              ? (_openBlock(), _createElementBlock("span", _hoisted_14, "本轮已完成，可随时再次检查"))
              : (_openBlock(), _createElementBlock("span", _hoisted_15, "本轮进度已保存"))
        ]),
        _createElementVNode("div", _hoisted_16, [
          _createElementVNode("div", {
            class: "progress-bar",
            style: _normalizeStyle({ width: `${progress.value}%` })
          }, null, 4)
        ])
      ]),
      _createElementVNode("div", _hoisted_17, [
        _createElementVNode("article", null, [
          _createElementVNode("strong", null, _toDisplayString(cards.value.length), 1),
          _cache[5] || (_cache[5] = _createElementVNode("span", null, "部作品需要复核", -1))
        ]),
        _createElementVNode("article", null, [
          _createElementVNode("strong", null, _toDisplayString(summary.value.strategy_review || 0), 1),
          _cache[6] || (_cache[6] = _createElementVNode("span", null, "整理方式待复核", -1))
        ]),
        _createElementVNode("article", null, [
          _createElementVNode("strong", null, _toDisplayString(summary.value.ready_for_preview || 0), 1),
          _cache[7] || (_cache[7] = _createElementVNode("span", null, "可做补建前检查", -1))
        ]),
        _createElementVNode("article", null, [
          _createElementVNode("strong", null, _toDisplayString(summary.value.unresolved || 0), 1),
          _cache[8] || (_cache[8] = _createElementVNode("span", null, "信息不足", -1))
        ])
      ]),
      (summary.value.unresolved)
        ? (_openBlock(), _createElementBlock("section", _hoisted_18, [
            _createElementVNode("h3", null, _toDisplayString(summary.value.unresolved) + " 条记录没有查到可靠作品身份", 1),
            _cache[9] || (_cache[9] = _createElementVNode("p", null, "系统已经尝试按原有整理链路识别；因为没有足够证据确认片名，所以不会猜测、不会把原始文件名当成影片名，也不会把它们伪装成可处理的问题卡。", -1))
          ]))
        : _createCommentVNode("", true),
      (!cards.value.length)
        ? (_openBlock(), _createElementBlock("div", _hoisted_19, [...(_cache[10] || (_cache[10] = [
            _createElementVNode("h3", null, "目前没有需要你处理的作品", -1),
            _createElementVNode("p", null, "已检查的历史记录没有发现可展示的问题；你之后仍可再次检查。", -1)
          ]))]))
        : (_openBlock(), _createElementBlock("div", _hoisted_20, [
            (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(cards.value, (card) => {
              return (_openBlock(), _createElementBlock("article", {
                key: card.group_id,
                class: "issue-card"
              }, [
                _createElementVNode("div", _hoisted_21, [
                  _createElementVNode("span", _hoisted_22, "涉及 " + _toDisplayString(card.record_count) + " 条整理记录", 1),
                  _createElementVNode("h3", null, _toDisplayString(titleFor(card)), 1),
                  _createElementVNode("ul", _hoisted_23, [
                    (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(card.findings, (finding) => {
                      return (_openBlock(), _createElementBlock("li", {
                        key: `${finding.status}-${finding.transfer_mode || 'none'}`
                      }, [
                        _createElementVNode("strong", null, _toDisplayString(finding.count) + " 条：", 1),
                        _createTextVNode(_toDisplayString(finding.title), 1)
                      ]))
                    }), 128))
                  ])
                ]),
                _createElementVNode("button", {
                  class: "primary",
                  onClick: $event => (openIssue(card))
                }, "查看详细结论", 8, _hoisted_24)
              ]))
            }), 128))
          ]))
    ]),
    (selected.value)
      ? (_openBlock(), _createElementBlock("div", {
          key: 1,
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
              _createElementVNode("h3", null, "这部作品的 " + _toDisplayString(selected.value.record_count) + " 条整理记录", 1),
              _cache[12] || (_cache[12] = _createElementVNode("p", null, "这里按影片合并展示。下面每项都是检查到的具体事实，不把历史字段当成实际文件状态。", -1))
            ]),
            (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(selected.value.findings, (finding) => {
              return (_openBlock(), _createElementBlock("section", {
                key: `${finding.status}-${finding.transfer_mode || 'none'}`,
                class: "modal-section"
              }, [
                _createElementVNode("h3", null, _toDisplayString(finding.title) + "（" + _toDisplayString(finding.count) + " 条）", 1),
                _createElementVNode("p", null, _toDisplayString(finding.detail), 1)
              ]))
            }), 128)),
            (selected.value.repairable_count)
              ? (_openBlock(), _createElementBlock("section", _hoisted_28, [
                  _cache[13] || (_cache[13] = _createElementVNode("h3", null, "可以自动处理什么？", -1)),
                  _createElementVNode("p", null, "其中 " + _toDisplayString(selected.value.repairable_count) + " 条是原整理失败、且身份已确认的记录。整理方式待复核的成功记录不会被错误地拿去自动重建。", 1),
                  (!readyPlansFor(selected.value).length)
                    ? (_openBlock(), _createElementBlock("button", {
                        key: 0,
                        class: "primary wide",
                        disabled: loading.value,
                        onClick: _cache[0] || (_cache[0] = $event => (prepareGroupPlans(selected.value)))
                      }, _toDisplayString(loading.value ? '正在生成方案…' : '一键生成修复方案（不改文件）'), 9, _hoisted_29))
                    : (_openBlock(), _createElementBlock("button", {
                        key: 1,
                        class: "primary wide",
                        disabled: loading.value,
                        onClick: _cache[1] || (_cache[1] = $event => (pendingGroupRepair.value = selected.value))
                      }, "确认修复 " + _toDisplayString(readyPlansFor(selected.value).length) + " 条记录", 9, _hoisted_30))
                ]))
              : _createCommentVNode("", true),
            _cache[14] || (_cache[14] = _createElementVNode("details", { class: "manual-guide" }, [
              _createElementVNode("summary", null, "为什么这里不能直接一键修复所有项目？"),
              _createElementVNode("ol", null, [
                _createElementVNode("li", null, "“历史记录显示为复制/移动”只说明当时的记录方式，不等于实际文件现在不存在或损坏。"),
                _createElementVNode("li", null, "创建硬链接会写入媒体库；只有原整理明确失败且补建前检查通过的记录，才适合进入确认后的修复流程。"),
                _createElementVNode("li", null, "目录放错、缺集等问题需要宿主提供真实目录与剧集完整性证据；没有这些证据，工具不会猜测或误修。")
              ])
            ], -1))
          ])
        ]))
      : _createCommentVNode("", true),
    (pendingGroupRepair.value)
      ? (_openBlock(), _createElementBlock("div", {
          key: 2,
          class: "modal-backdrop",
          onClick: _cache[3] || (_cache[3] = _withModifiers($event => (pendingGroupRepair.value = null), ["self"]))
        }, [
          _createElementVNode("section", _hoisted_31, [
            _createElementVNode("h2", null, "确认修复 " + _toDisplayString(readyPlansFor(pendingGroupRepair.value).length) + " 条记录？", 1),
            _cache[15] || (_cache[15] = _createElementVNode("p", null, "系统只会为这部作品中已通过补建前检查的记录创建硬链接。", -1)),
            _cache[16] || (_cache[16] = _createElementVNode("ul", null, [
              _createElementVNode("li", null, "不会删除、移动、改名或覆盖原文件"),
              _createElementVNode("li", null, "不会修改下载器、代理或既有整理规则"),
              _createElementVNode("li", null, "整理方式待复核的成功记录不会被包含在内")
            ], -1)),
            _createElementVNode("div", _hoisted_32, [
              _createElementVNode("button", {
                class: "secondary",
                disabled: loading.value,
                onClick: _cache[2] || (_cache[2] = $event => (pendingGroupRepair.value = null))
              }, "返回", 8, _hoisted_33),
              _createElementVNode("button", {
                class: "primary",
                disabled: loading.value,
                onClick: repairGroup
              }, "确认创建硬链接", 8, _hoisted_34)
            ])
          ])
        ]))
      : _createCommentVNode("", true)
  ]))
}
}

};
const AppPage = /*#__PURE__*/_export_sfc(_sfc_main, [['__scopeId',"data-v-c687556c"]]);

export { AppPage as default };
