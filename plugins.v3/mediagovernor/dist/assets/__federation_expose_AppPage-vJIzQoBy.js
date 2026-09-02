import { importShared } from './__federation_fn_import-JrT3xvdd.js';
import { _ as _export_sfc } from './_plugin-vue_export-helper-pcqpp-6-.js';

const {createElementVNode:_createElementVNode,toDisplayString:_toDisplayString,openBlock:_openBlock,createElementBlock:_createElementBlock,createCommentVNode:_createCommentVNode,normalizeStyle:_normalizeStyle,renderList:_renderList,Fragment:_Fragment,createTextVNode:_createTextVNode,vModelSelect:_vModelSelect,withDirectives:_withDirectives,withModifiers:_withModifiers} = await importShared('vue');


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
const _hoisted_7 = { key: 0 };
const _hoisted_8 = { key: 1 };
const _hoisted_9 = { key: 2 };
const _hoisted_10 = { class: "header-actions" };
const _hoisted_11 = ["disabled"];
const _hoisted_12 = ["disabled"];
const _hoisted_13 = ["disabled"];
const _hoisted_14 = {
  class: "progress-wrap",
  "aria-label": "检查进度"
};
const _hoisted_15 = { class: "progress-copy" };
const _hoisted_16 = { key: 0 };
const _hoisted_17 = { key: 1 };
const _hoisted_18 = { key: 2 };
const _hoisted_19 = { key: 3 };
const _hoisted_20 = { key: 4 };
const _hoisted_21 = { key: 5 };
const _hoisted_22 = { key: 6 };
const _hoisted_23 = {
  key: 0,
  class: "progress-track"
};
const _hoisted_24 = {
  key: 0,
  class: "notice"
};
const _hoisted_25 = {
  class: "overview",
  "aria-label": "检查结果概览"
};
const _hoisted_26 = {
  key: 1,
  class: "unresolved"
};
const _hoisted_27 = {
  key: 2,
  class: "unresolved"
};
const _hoisted_28 = {
  key: 3,
  class: "empty"
};
const _hoisted_29 = {
  key: 4,
  class: "issues"
};
const _hoisted_30 = { class: "issue-copy" };
const _hoisted_31 = { class: "issue-type" };
const _hoisted_32 = { class: "finding-list" };
const _hoisted_33 = ["onClick"];
const _hoisted_34 = {
  class: "modal",
  role: "dialog",
  "aria-modal": "true",
  "aria-label": "整理检查结论"
};
const _hoisted_35 = { class: "modal-header" };
const _hoisted_36 = { class: "modal-section" };
const _hoisted_37 = {
  key: 0,
  class: "evidence-copy"
};
const _hoisted_38 = {
  key: 0,
  class: "modal-section"
};
const _hoisted_39 = {
  key: 0,
  class: "directory-picker"
};
const _hoisted_40 = ["value"];
const _hoisted_41 = {
  key: 1,
  class: "evidence-copy"
};
const _hoisted_42 = ["disabled"];
const _hoisted_43 = ["disabled"];
const _hoisted_44 = {
  class: "modal confirm",
  role: "dialog",
  "aria-modal": "true",
  "aria-label": "确认批量创建硬链接"
};
const _hoisted_45 = { class: "actions" };
const _hoisted_46 = ["disabled"];
const _hoisted_47 = ["disabled"];

const {computed,nextTick,onMounted,ref} = await importShared('vue');


const batchSize = 25;

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
const directories = ref([]);
const selectedDirectory = ref(null);
const directoryNotice = ref('');
const stopRequested = ref(false);
const cards = computed(() => result.value.items || []);
const summary = computed(() => result.value.summary || {});
const completed = computed(() => summary.value.state === 'complete');
const running = computed(() => summary.value.state === 'running');
const discovering = computed(() => summary.value.state === 'discovering');
const paused = computed(() => summary.value.state === 'paused');
const scopeChanged = computed(() => Boolean(summary.value.scope_changed));
const stale = computed(() => summary.value.state === 'stale');
const displayedTotal = computed(() => stale.value ? (summary.value.run_total || 0) : (summary.value.total || 0));
const displayedChecked = computed(() => stale.value ? (summary.value.run_checked || 0) : (summary.value.checked || 0));
const progress = computed(() => displayedTotal.value ? Math.round(displayedChecked.value * 100 / displayedTotal.value) : 0);

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
    loading.value = false;
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
    loading.value = false;
    await runNextItems();
  } catch (cause) { notice.value = cause?.message || '继续检查没有完成，未改动任何文件。'; }
  finally { loading.value = false; }
}

async function runNextItems() {
  while (!stopRequested.value && (summary.value.state === 'running' || discovering.value)) {
    await props.api.post(`plugin/${props.pluginId}/audit/batch`, { limit: batchSize });
    await refresh(false);
    await nextTick();
  }
  if (summary.value.state === 'complete') notice.value = '本轮检查完成。你可以随时点击“再次检查全部”开始新一轮；期间没有改动影片文件、下载器或既有整理规则。';
  else if (summary.value.state === 'stale') notice.value = '历史记录范围发生了变化；上一轮结果仍被保留，但不能代表当前全部记录。开始新一轮检查后才会重新核对全部。';
  else if (summary.value.state === 'paused') notice.value = '检查已暂停。进度已保存，稍后点击“继续检查”会从下一条开始。';
}

async function pauseAudit() {
  if (typeof props.api?.post !== 'function') return
  stopRequested.value = true;
  await props.api.post(`plugin/${props.pluginId}/audit/pause`);
  await refresh(false);
  notice.value = '检查已暂停。已完成的结论已保存，未开始的记录不会丢失。';
}

function directoryKey(directory) {
  return directory ? `${directory.library_storage}\u0000${directory.library_path}\u0000${directory.name}` : ''
}

async function loadDirectories({ preserveSelection = false } = {}) {
  const previousKey = preserveSelection ? directoryKey(selectedDirectory.value) : '';
  directories.value = [];
  if (!preserveSelection) selectedDirectory.value = null;
  directoryNotice.value = '';
  try {
    const response = await props.api.get('storage/directories?directory_type=library', { feedback: 'silent' });
    const payload = response?.data ?? response;
    const data = payload?.data ?? payload;
    directories.value = Array.isArray(data) ? data.filter(item => item?.name && item?.library_path && item?.library_storage) : [];
    if (previousKey) selectedDirectory.value = directories.value.find(item => directoryKey(item) === previousKey) || null;
    if (previousKey && !selectedDirectory.value) directoryNotice.value = '所选目录已经在 MoviePilot 当前设置中变化或被删除；请重新选择后再生成方案。';
    if (!directories.value.length) directoryNotice.value = 'MoviePilot 当前没有返回可选择的媒体库目录；仍可按当前原生规则生成方案。';
  } catch {
    directoryNotice.value = '暂时无法读取 MoviePilot 当前目录设置；不会使用固定目录替代。';
  }
}

function openIssue(card) { selected.value = card; loadDirectories(); }
function closeIssue() { selected.value = null; selectedDirectory.value = null; }

function targetPayload() {
  const target = selectedDirectory.value;
  return target ? { storage: target.library_storage, path: target.library_path, name: target.name } : {}
}

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
      const response = await props.api.post(`plugin/${props.pluginId}/packages/${historyId}/preview`, targetPayload());
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
    if (selectedDirectory.value) {
      await loadDirectories({ preserveSelection: true });
      if (!selectedDirectory.value) {
        pendingGroupRepair.value = null;
        notice.value = '目标目录已经变化。为避免把作品放到旧位置，请重新选择目录并生成新的方案。';
        return
      }
    }
    let completedCount = 0;
    for (const plan of readyPlans) {
      const response = await props.api.post(`plugin/${props.pluginId}/plans/${plan.plan_id}/repair`, targetPayload());
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
      _cache[5] || (_cache[5] = _createElementVNode("div", null, [
        _createElementVNode("h1", null, "整理质量检查"),
        _createElementVNode("p", null, "按作品核对 MoviePilot 整理历史，只列出有证据需要处理的作品。检查本身不会移动、删除、改名或创建文件。")
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
          _createElementVNode("h2", null, _toDisplayString(stale.value ? '检查范围已变化' : (discovering.value ? '正在读取整理历史' : (completed.value ? '本轮检查完成' : (running.value ? '正在检查' : (paused.value ? '检查已暂停' : '准备开始检查'))))), 1),
          (stale.value)
            ? (_openBlock(), _createElementBlock("p", _hoisted_7, "上一轮已检查 " + _toDisplayString(displayedChecked.value) + " / " + _toDisplayString(displayedTotal.value) + " 条；当前共有 " + _toDisplayString(summary.value.total || 0) + " 条历史记录。上次结论不会丢失，但新增或变动的记录尚未检查。", 1))
            : (discovering.value)
              ? (_openBlock(), _createElementBlock("p", _hoisted_8, "正在分批读取 MoviePilot 已记录的整理历史，已发现 " + _toDisplayString(summary.value.discovered || 0) + " 条。读取完成后才会开始检查文件，不会把旧结果冒充为全库结论。", 1))
              : (_openBlock(), _createElementBlock("p", _hoisted_9, "已检查 " + _toDisplayString(displayedChecked.value) + " / " + _toDisplayString(displayedTotal.value) + " 条历史记录。暂停后可以继续；完成后可以随时重新检查全部记录。", 1))
        ]),
        _createElementVNode("div", _hoisted_10, [
          (running.value || discovering.value)
            ? (_openBlock(), _createElementBlock("button", {
                key: 0,
                class: "secondary",
                disabled: loading.value,
                onClick: pauseAudit
              }, "暂停检查", 8, _hoisted_11))
            : (paused.value && !scopeChanged.value)
              ? (_openBlock(), _createElementBlock("button", {
                  key: 1,
                  class: "primary",
                  disabled: loading.value,
                  onClick: resumeAudit
                }, "继续本轮检查", 8, _hoisted_12))
              : (_openBlock(), _createElementBlock("button", {
                  key: 2,
                  class: "primary",
                  disabled: loading.value,
                  onClick: auditAll
                }, _toDisplayString(stale.value ? '重新检查全部' : (completed.value ? '再次检查全部' : '开始检查全部')), 9, _hoisted_13))
        ])
      ]),
      _createElementVNode("div", _hoisted_14, [
        _createElementVNode("div", _hoisted_15, [
          (discovering.value)
            ? (_openBlock(), _createElementBlock("strong", _hoisted_16, "读取中"))
            : (_openBlock(), _createElementBlock("strong", _hoisted_17, _toDisplayString(progress.value) + "%", 1)),
          (stale.value)
            ? (_openBlock(), _createElementBlock("span", _hoisted_18, "这是上一轮进度；当前范围已变化"))
            : (discovering.value)
              ? (_openBlock(), _createElementBlock("span", _hoisted_19, "已发现 " + _toDisplayString(summary.value.discovered || 0) + " 条历史记录", 1))
              : (running.value)
                ? (_openBlock(), _createElementBlock("span", _hoisted_20, "正在核对第 " + _toDisplayString((summary.value.checked || 0) + 1) + " 条", 1))
                : (completed.value)
                  ? (_openBlock(), _createElementBlock("span", _hoisted_21, "本轮已完成，可随时再次检查"))
                  : (_openBlock(), _createElementBlock("span", _hoisted_22, "本轮进度已保存"))
        ]),
        (!discovering.value)
          ? (_openBlock(), _createElementBlock("div", _hoisted_23, [
              _createElementVNode("div", {
                class: "progress-bar",
                style: _normalizeStyle({ width: `${progress.value}%` })
              }, null, 4)
            ]))
          : _createCommentVNode("", true)
      ]),
      (stale.value)
        ? (_openBlock(), _createElementBlock("p", _hoisted_24, "下面是上一轮已完成部分的结论，仅供参考；在重新检查全部前，不能把它当作当前媒体库的完整结论。"))
        : _createCommentVNode("", true),
      _createElementVNode("div", _hoisted_25, [
        _createElementVNode("article", null, [
          _createElementVNode("strong", null, _toDisplayString(cards.value.length), 1),
          _cache[6] || (_cache[6] = _createElementVNode("span", null, "部作品需要处理", -1))
        ]),
        _createElementVNode("article", null, [
          _createElementVNode("strong", null, _toDisplayString(summary.value.actionable || 0), 1),
          _cache[7] || (_cache[7] = _createElementVNode("span", null, "可安全补建", -1))
        ]),
        _createElementVNode("article", null, [
          _createElementVNode("strong", null, _toDisplayString(summary.value.needs_attention || 0), 1),
          _cache[8] || (_cache[8] = _createElementVNode("span", null, "暂不能自动处理", -1))
        ]),
        _createElementVNode("article", null, [
          _createElementVNode("strong", null, _toDisplayString(summary.value.history_info || 0), 1),
          _cache[9] || (_cache[9] = _createElementVNode("span", null, "历史资料说明", -1))
        ])
      ]),
      (summary.value.history_info)
        ? (_openBlock(), _createElementBlock("section", _hoisted_26, [
            _createElementVNode("h3", null, _toDisplayString(summary.value.history_info) + " 条历史资料不完整或记录了非硬链接方式", 1),
            _cache[10] || (_cache[10] = _createElementVNode("p", null, "这不是影片异常，也不会出现在待处理作品里。已读取到源和目标的记录会进一步核对文件集合；没有足够文件证据时不会把历史说成当前故障。", -1))
          ]))
        : _createCommentVNode("", true),
      (summary.value.unresolved)
        ? (_openBlock(), _createElementBlock("section", _hoisted_27, [
            _createElementVNode("h3", null, _toDisplayString(summary.value.unresolved) + " 条失败记录没有查到可靠作品身份", 1),
            _cache[11] || (_cache[11] = _createElementVNode("p", null, "没有足够证据确认片名时，系统不会猜测，也不会把它伪装成可修复的影片问题。", -1))
          ]))
        : _createCommentVNode("", true),
      (!cards.value.length)
        ? (_openBlock(), _createElementBlock("div", _hoisted_28, [...(_cache[12] || (_cache[12] = [
            _createElementVNode("h3", null, "本轮没有发现已确认需要处理的作品", -1),
            _createElementVNode("p", null, "历史资料说明不代表影片有问题。之后可以随时再次检查。", -1)
          ]))]))
        : (_openBlock(), _createElementBlock("div", _hoisted_29, [
            (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(cards.value, (card) => {
              return (_openBlock(), _createElementBlock("article", {
                key: card.group_id,
                class: "issue-card"
              }, [
                _createElementVNode("div", _hoisted_30, [
                  _createElementVNode("span", _hoisted_31, "涉及 " + _toDisplayString(card.record_count) + " 条整理记录", 1),
                  _createElementVNode("h3", null, _toDisplayString(titleFor(card)), 1),
                  _createElementVNode("ul", _hoisted_32, [
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
                }, "查看详细结论", 8, _hoisted_33)
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
          _createElementVNode("section", _hoisted_34, [
            _createElementVNode("header", _hoisted_35, [
              _createElementVNode("div", null, [
                _cache[13] || (_cache[13] = _createElementVNode("span", { class: "modal-label" }, "检查结论", -1)),
                _createElementVNode("h2", null, _toDisplayString(titleFor(selected.value)), 1)
              ]),
              _createElementVNode("button", {
                class: "icon-button",
                "aria-label": "关闭",
                onClick: closeIssue
              }, "×")
            ]),
            _createElementVNode("section", _hoisted_36, [
              _createElementVNode("h3", null, "这部作品的 " + _toDisplayString(selected.value.record_count) + " 条整理记录", 1),
              _cache[14] || (_cache[14] = _createElementVNode("p", null, "这里按影片合并展示。下面每项都有当前文件或历史证据；不能证明的内容不会被说成影片故障。", -1)),
              (selected.value.file_summary)
                ? (_openBlock(), _createElementBlock("p", _hoisted_37, "源包：" + _toDisplayString(selected.value.file_summary.source_video_count || 0) + " 个视频、" + _toDisplayString(selected.value.file_summary.source_subtitle_count || 0) + " 个字幕；目标：" + _toDisplayString(selected.value.file_summary.target_video_count || 0) + " 个视频、" + _toDisplayString(selected.value.file_summary.target_subtitle_count || 0) + " 个字幕。", 1))
                : _createCommentVNode("", true)
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
              ? (_openBlock(), _createElementBlock("section", _hoisted_38, [
                  _cache[17] || (_cache[17] = _createElementVNode("h3", null, "生成方案（不会改文件）", -1)),
                  _cache[18] || (_cache[18] = _createElementVNode("p", null, "可以按 MoviePilot 当前规则生成方案，也可以在下面从它当前的媒体库目录中选择一个目标。目录列表每次打开时都重新读取，不会写死为几个文件夹。", -1)),
                  (directories.value.length)
                    ? (_openBlock(), _createElementBlock("label", _hoisted_39, [
                        _cache[16] || (_cache[16] = _createElementVNode("span", null, "目标目录（可选）", -1)),
                        _withDirectives(_createElementVNode("select", {
                          "onUpdate:modelValue": _cache[0] || (_cache[0] = $event => ((selectedDirectory).value = $event))
                        }, [
                          _cache[15] || (_cache[15] = _createElementVNode("option", { value: null }, "让 MoviePilot 按当前规则选择", -1)),
                          (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(directories.value, (directory) => {
                            return (_openBlock(), _createElementBlock("option", {
                              key: `${directory.library_storage}-${directory.library_path}`,
                              value: directory
                            }, _toDisplayString(directory.name) + _toDisplayString(directory.media_type ? ` · ${directory.media_type}` : '') + _toDisplayString(directory.media_category ? ` · ${directory.media_category}` : ''), 9, _hoisted_40))
                          }), 128))
                        ], 512), [
                          [_vModelSelect, selectedDirectory.value]
                        ])
                      ]))
                    : _createCommentVNode("", true),
                  (directoryNotice.value)
                    ? (_openBlock(), _createElementBlock("p", _hoisted_41, _toDisplayString(directoryNotice.value), 1))
                    : _createCommentVNode("", true),
                  (!readyPlansFor(selected.value).length)
                    ? (_openBlock(), _createElementBlock("button", {
                        key: 2,
                        class: "primary wide",
                        disabled: loading.value,
                        onClick: _cache[1] || (_cache[1] = $event => (prepareGroupPlans(selected.value)))
                      }, _toDisplayString(loading.value ? '正在生成方案…' : '生成整理方案（不改文件）'), 9, _hoisted_42))
                    : (_openBlock(), _createElementBlock("button", {
                        key: 3,
                        class: "primary wide",
                        disabled: loading.value,
                        onClick: _cache[2] || (_cache[2] = $event => (pendingGroupRepair.value = selected.value))
                      }, "确认重新整理 " + _toDisplayString(readyPlansFor(selected.value).length) + " 条记录", 9, _hoisted_43))
                ]))
              : _createCommentVNode("", true),
            _cache[19] || (_cache[19] = _createElementVNode("details", { class: "manual-guide" }, [
              _createElementVNode("summary", null, "为什么这里不能直接一键修复所有项目？"),
              _createElementVNode("ol", null, [
                _createElementVNode("li", null, "“历史记录显示为复制/移动”只说明当时的记录方式，不等于实际文件现在不存在或损坏。"),
                _createElementVNode("li", null, "创建硬链接会写入媒体库；只有原整理明确失败、或文件集合检查明确发现缺失且补建前检查通过的记录，才适合进入确认后的修复流程。"),
                _createElementVNode("li", null, "目录和目标发生变化后，旧方案会失效并要求重新预演；插件不会用固定目录或猜测覆盖。")
              ])
            ], -1))
          ])
        ]))
      : _createCommentVNode("", true),
    (pendingGroupRepair.value)
      ? (_openBlock(), _createElementBlock("div", {
          key: 2,
          class: "modal-backdrop",
          onClick: _cache[4] || (_cache[4] = _withModifiers($event => (pendingGroupRepair.value = null), ["self"]))
        }, [
          _createElementVNode("section", _hoisted_44, [
            _createElementVNode("h2", null, "确认修复 " + _toDisplayString(readyPlansFor(pendingGroupRepair.value).length) + " 条记录？", 1),
            _cache[20] || (_cache[20] = _createElementVNode("p", null, "系统只会为这部作品中已通过补建前检查的记录创建硬链接。", -1)),
            _cache[21] || (_cache[21] = _createElementVNode("ul", null, [
              _createElementVNode("li", null, "不会删除、移动、改名或覆盖原文件"),
              _createElementVNode("li", null, "不会修改下载器、代理或既有整理规则"),
              _createElementVNode("li", null, "整理方式待复核的成功记录不会被包含在内")
            ], -1)),
            _createElementVNode("div", _hoisted_45, [
              _createElementVNode("button", {
                class: "secondary",
                disabled: loading.value,
                onClick: _cache[3] || (_cache[3] = $event => (pendingGroupRepair.value = null))
              }, "返回", 8, _hoisted_46),
              _createElementVNode("button", {
                class: "primary",
                disabled: loading.value,
                onClick: repairGroup
              }, "确认创建硬链接", 8, _hoisted_47)
            ])
          ])
        ]))
      : _createCommentVNode("", true)
  ]))
}
}

};
const AppPage = /*#__PURE__*/_export_sfc(_sfc_main, [['__scopeId',"data-v-21118681"]]);

export { AppPage as default };
