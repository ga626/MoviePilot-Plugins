import { importShared } from './__federation_fn_import-JrT3xvdd.js';
import { _ as _export_sfc } from './_plugin-vue_export-helper-pcqpp-6-.js';

const {createElementVNode:_createElementVNode,toDisplayString:_toDisplayString,openBlock:_openBlock,createElementBlock:_createElementBlock,createCommentVNode:_createCommentVNode,renderList:_renderList,Fragment:_Fragment,normalizeClass:_normalizeClass,withModifiers:_withModifiers} = await importShared('vue');


const _hoisted_1 = { class: "governor-page" };
const _hoisted_2 = { class: "page-header" };
const _hoisted_3 = ["disabled"];
const _hoisted_4 = {
  key: 0,
  class: "notice"
};
const _hoisted_5 = {
  class: "overview",
  "aria-label": "问题概览"
};
const _hoisted_6 = {
  class: "issues",
  "aria-label": "整理问题列表"
};
const _hoisted_7 = {
  key: 0,
  class: "empty"
};
const _hoisted_8 = { class: "issue-copy" };
const _hoisted_9 = { class: "issue-type" };
const _hoisted_10 = ["onClick"];
const _hoisted_11 = {
  key: 1,
  class: "verified-history"
};
const _hoisted_12 = { class: "issue-copy" };
const _hoisted_13 = ["onClick"];
const _hoisted_14 = {
  class: "modal",
  role: "dialog",
  "aria-modal": "true",
  "aria-label": "核对整理问题"
};
const _hoisted_15 = { class: "modal-header" };
const _hoisted_16 = { class: "modal-section" };
const _hoisted_17 = { class: "modal-section" };
const _hoisted_18 = ["disabled"];
const _hoisted_19 = ["disabled"];
const _hoisted_20 = { class: "manual-guide" };
const _hoisted_21 = {
  key: 0,
  class: "source-name"
};
const _hoisted_22 = {
  class: "modal confirm",
  role: "dialog",
  "aria-modal": "true",
  "aria-label": "确认创建硬链接"
};
const _hoisted_23 = { class: "actions" };
const _hoisted_24 = ["disabled"];
const _hoisted_25 = ["disabled"];

const {computed,inject,onMounted,ref} = await importShared('vue');



const _sfc_main = {
  __name: 'AppPage',
  props: { api: { type: Object, default: () => ({}) }, pluginId: { type: String, default: 'MediaGovernor' } },
  setup(__props) {

const props = __props;
const toast = inject('moviepilot:toast', null);
const loading = ref(false);
const notice = ref('');
const result = ref({ items: [], summary: {} });
const plans = ref([]);
const selected = ref(null);
const previewResult = ref(null);
const pendingRepair = ref(null);
const cards = computed(() => result.value.items || []);
const issueCards = computed(() => cards.value.filter(card => card.status !== 'verified'));
const verifiedCards = computed(() => cards.value.filter(card => card.status === 'verified'));
const activeCount = computed(() => issueCards.value.length);

const typeGuide = {
  transfer_failed: { label: '整理没有完成', detail: 'MoviePilot 曾记录这次整理没有完成。先做一次模拟检查，确认现在是否还可以安全处理。' },
  unexpected_transfer_mode: { label: '整理方式不符合预期', detail: '这次整理使用的方式和硬链接规则不一致，需要先核对。' },
  identity_conflict: { label: '作品信息有冲突', detail: '同一条记录出现了不同作品信息，程序不会替你猜测正确答案。' },
  missing_media_identity: { label: '影片尚未识别', detail: '历史记录没有可靠的作品身份，不能自动把原始名称当成影片名。' },
  missing_transfer_mode: { label: '缺少整理信息', detail: 'MoviePilot 没有提供足够的整理信息，当前不能安全自动处理。' },
};
const fallbackGuide = { label: '需要人工核对', detail: '这条记录需要先核对，程序不会猜测或直接改动文件。' };

function hasChinese(text) { return /[\u3400-\u9fff]/.test(String(text || '')) }
function hasReliableIdentity(card) { return Boolean(card?.media_source && card?.media_id && card?.media_type) }
function titleFor(card) {
  if (hasChinese(card?.title) || (hasReliableIdentity(card) && card?.title)) return `${card.title}${card.year ? `（${card.year}）` : ''}`
  return '待确认影片'
}
function sourceName(card) { return card?.title && titleFor(card) === '待确认影片' ? card.title : '' }
function guideFor(card) { return typeGuide[(card?.reason_codes || []).find(item => typeGuide[item])] || fallbackGuide }
function latestCheck(card) {
  if (!card?.last_preview) return { tone: 'neutral', label: '尚未模拟检查', detail: '还没有核对现在能否安全处理。' }
  if (card.last_preview.status === 'ready') return { tone: 'ready', label: '可以继续处理', detail: '最近一次模拟检查已通过；仍需你在确认窗口里核对后再执行。' }
  return { tone: 'blocked', label: '暂不能自动处理', detail: '最近一次模拟检查没有生成安全方案，请按下方人工处理说明核对。' }
}
function planFor(card) { return plans.value.find(plan => plan.package_id === card?.package_id && plan.status === 'ready') || null }

async function refresh() {
  if (typeof props.api?.get !== 'function') { notice.value = '当前 MoviePilot 未提供插件数据接口'; return }
  loading.value = true;
  try {
    const [packages, nextPlans] = await Promise.all([props.api.get(`plugin/${props.pluginId}/packages`), props.api.get(`plugin/${props.pluginId}/plans`)]);
    result.value = packages?.data ?? packages ?? { items: [], summary: {} };
    plans.value = (nextPlans?.data ?? nextPlans ?? {}).items || [];
    notice.value = '';
  } catch (cause) { notice.value = cause?.message || '暂时无法读取整理问题'; }
  finally { loading.value = false; }
}
function openIssue(card) { selected.value = card; previewResult.value = null; }
function closeIssue() { selected.value = null; previewResult.value = null; }
async function checkPlan(card) {
  const historyId = (card.history_ids || [])[0];
  if (!historyId || typeof props.api?.post !== 'function') { previewResult.value = { ok: false, detail: '这条记录没有可用于检查的历史信息。' }; return }
  loading.value = true;
  try {
    const response = await props.api.post(`plugin/${props.pluginId}/packages/${historyId}/preview`);
    const data = response?.data ?? response;
    await refresh();
    previewResult.value = data?.ok ? { ok: true, detail: '模拟检查通过。系统已生成一份仅创建硬链接的计划，等待你确认。' } : { ok: false, detail: '模拟检查未能生成安全方案。不会改动任何文件，请按人工处理说明核对。' };
  } catch (cause) { previewResult.value = { ok: false, detail: cause?.message || '模拟检查没有完成，未改动任何文件。' }; }
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
    notice.value = data?.ok ? '已完成硬链接创建；原文件、下载器和原有整理规则都没有改动。' : '这次没有完成硬链接创建，原文件没有被删除或移动。';
    if (data?.ok) toast?.success?.('已完成硬链接创建');
  } catch (cause) { notice.value = cause?.message || '这次没有完成硬链接创建，原文件没有被删除或移动。'; }
  finally { loading.value = false; pendingRepair.value = null; }
}
onMounted(refresh);

return (_ctx, _cache) => {
  return (_openBlock(), _createElementBlock("main", _hoisted_1, [
    _createElementVNode("header", _hoisted_2, [
      _cache[4] || (_cache[4] = _createElementVNode("div", null, [
        _createElementVNode("h1", null, "整理问题"),
        _createElementVNode("p", null, "这里列出 MoviePilot 真实记录过的异常。每张卡都需要先核对，再决定是否处理。")
      ], -1)),
      _createElementVNode("button", {
        class: "secondary",
        disabled: loading.value,
        onClick: refresh
      }, _toDisplayString(loading.value ? '正在更新' : '更新列表'), 9, _hoisted_3)
    ]),
    (notice.value)
      ? (_openBlock(), _createElementBlock("p", _hoisted_4, _toDisplayString(notice.value), 1))
      : _createCommentVNode("", true),
    _createElementVNode("section", _hoisted_5, [
      _createElementVNode("article", null, [
        _createElementVNode("strong", null, _toDisplayString(activeCount.value), 1),
        _cache[5] || (_cache[5] = _createElementVNode("span", null, "需要核对", -1))
      ]),
      _createElementVNode("article", null, [
        _createElementVNode("strong", null, _toDisplayString(verifiedCards.value.length), 1),
        _cache[6] || (_cache[6] = _createElementVNode("span", null, "历史记录一致", -1))
      ]),
      _createElementVNode("article", null, [
        _createElementVNode("strong", null, _toDisplayString(issueCards.value.filter(card => planFor(card)).length), 1),
        _cache[7] || (_cache[7] = _createElementVNode("span", null, "可确认处理", -1))
      ])
    ]),
    _createElementVNode("section", _hoisted_6, [
      _cache[8] || (_cache[8] = _createElementVNode("div", { class: "section-heading" }, [
        _createElementVNode("h2", null, "待处理问题"),
        _createElementVNode("p", null, "“待确认影片”表示历史记录没有可靠片名；不会把英文或乱码硬说成中文片名。")
      ], -1)),
      (!issueCards.value.length)
        ? (_openBlock(), _createElementBlock("div", _hoisted_7, "目前没有需要核对的整理记录。"))
        : _createCommentVNode("", true),
      (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(issueCards.value, (card) => {
        return (_openBlock(), _createElementBlock("article", {
          key: card.package_id,
          class: "issue-card"
        }, [
          _createElementVNode("div", _hoisted_8, [
            _createElementVNode("span", _hoisted_9, _toDisplayString(guideFor(card).label), 1),
            _createElementVNode("h3", null, _toDisplayString(titleFor(card)), 1),
            _createElementVNode("p", null, _toDisplayString(guideFor(card).detail), 1)
          ]),
          _createElementVNode("button", {
            class: "primary",
            onClick: $event => (openIssue(card))
          }, "查看并核对", 8, _hoisted_10)
        ]))
      }), 128))
    ]),
    (verifiedCards.value.length)
      ? (_openBlock(), _createElementBlock("details", _hoisted_11, [
          _createElementVNode("summary", null, "查看历史记录一致的项目（" + _toDisplayString(verifiedCards.value.length) + "）", 1),
          _cache[11] || (_cache[11] = _createElementVNode("p", null, "这里只表示 MoviePilot 保存的公开记录彼此一致，不表示媒体库最终展示已经人工核对。", -1)),
          (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(verifiedCards.value, (card) => {
            return (_openBlock(), _createElementBlock("article", {
              key: card.package_id,
              class: "issue-card verified"
            }, [
              _createElementVNode("div", _hoisted_12, [
                _cache[9] || (_cache[9] = _createElementVNode("span", { class: "issue-type" }, "历史记录一致", -1)),
                _createElementVNode("h3", null, _toDisplayString(titleFor(card)), 1),
                _cache[10] || (_cache[10] = _createElementVNode("p", null, "当前没有发现需要处理的公开记录冲突。", -1))
              ]),
              _createElementVNode("button", {
                class: "secondary",
                onClick: $event => (openIssue(card))
              }, "查看记录", 8, _hoisted_13)
            ]))
          }), 128))
        ]))
      : _createCommentVNode("", true),
    (selected.value)
      ? (_openBlock(), _createElementBlock("div", {
          key: 2,
          class: "modal-backdrop",
          onClick: _withModifiers(closeIssue, ["self"])
        }, [
          _createElementVNode("section", _hoisted_14, [
            _createElementVNode("header", _hoisted_15, [
              _createElementVNode("div", null, [
                _cache[12] || (_cache[12] = _createElementVNode("p", { class: "modal-label" }, "整理问题核对", -1)),
                _createElementVNode("h2", null, _toDisplayString(titleFor(selected.value)), 1),
                _createElementVNode("p", null, _toDisplayString(guideFor(selected.value).label), 1)
              ]),
              _createElementVNode("button", {
                class: "icon-button",
                "aria-label": "关闭",
                onClick: closeIssue
              }, "×")
            ]),
            _createElementVNode("section", _hoisted_16, [
              _cache[13] || (_cache[13] = _createElementVNode("h3", null, "这是什么问题？", -1)),
              _createElementVNode("p", null, _toDisplayString(guideFor(selected.value).detail), 1),
              _cache[14] || (_cache[14] = _createElementVNode("p", { class: "quiet" }, "这条卡来自 MoviePilot 的历史整理记录。它说明当时发生过异常，不代表现在一定还没有入库。", -1))
            ]),
            _createElementVNode("section", _hoisted_17, [
              _cache[15] || (_cache[15] = _createElementVNode("h3", null, "现在怎么处理？", -1)),
              _createElementVNode("div", {
                class: _normalizeClass(["check-state", latestCheck(selected.value).tone])
              }, [
                _createElementVNode("strong", null, _toDisplayString(latestCheck(selected.value).label), 1),
                _createElementVNode("p", null, _toDisplayString(previewResult.value?.detail || latestCheck(selected.value).detail), 1)
              ], 2),
              (selected.value.failure_count)
                ? (_openBlock(), _createElementBlock("button", {
                    key: 0,
                    class: "primary wide",
                    disabled: loading.value,
                    onClick: _cache[0] || (_cache[0] = $event => (checkPlan(selected.value)))
                  }, _toDisplayString(loading.value ? '正在模拟检查' : '模拟检查，不改文件'), 9, _hoisted_18))
                : _createCommentVNode("", true),
              (planFor(selected.value))
                ? (_openBlock(), _createElementBlock("button", {
                    key: 1,
                    class: "primary wide",
                    disabled: loading.value,
                    onClick: _cache[1] || (_cache[1] = $event => (requestRepair(planFor(selected.value))))
                  }, "确认创建硬链接", 8, _hoisted_19))
                : _createCommentVNode("", true)
            ]),
            _createElementVNode("section", _hoisted_20, [
              _cache[16] || (_cache[16] = _createElementVNode("h3", null, "暂不能自动处理时怎么办？", -1)),
              _cache[17] || (_cache[17] = _createElementVNode("ol", null, [
                _createElementVNode("li", null, "用下方的原始任务名称到 MoviePilot 的“搜索结果”中核对影片、年份和类型。"),
                _createElementVNode("li", null, "到“整理”或“历史记录”确认它是否已经入库；已经入库就不需要再处理。"),
                _createElementVNode("li", null, "确认仍未入库后，回到这里重新做一次模拟检查。只有检查通过，才会出现确认按钮。")
              ], -1)),
              (sourceName(selected.value))
                ? (_openBlock(), _createElementBlock("p", _hoisted_21, "原始任务名称：" + _toDisplayString(sourceName(selected.value)), 1))
                : _createCommentVNode("", true)
            ])
          ])
        ]))
      : _createCommentVNode("", true),
    (pendingRepair.value)
      ? (_openBlock(), _createElementBlock("div", {
          key: 3,
          class: "modal-backdrop",
          onClick: _cache[3] || (_cache[3] = _withModifiers($event => (pendingRepair.value = null), ["self"]))
        }, [
          _createElementVNode("section", _hoisted_22, [
            _cache[18] || (_cache[18] = _createElementVNode("h2", null, "确认创建硬链接？", -1)),
            _cache[19] || (_cache[19] = _createElementVNode("p", null, "系统只会为已通过模拟检查的这一条记录创建硬链接。", -1)),
            _cache[20] || (_cache[20] = _createElementVNode("ul", null, [
              _createElementVNode("li", null, "不会删除、移动、改名或覆盖原文件"),
              _createElementVNode("li", null, "不会修改下载器、代理或既有整理规则"),
              _createElementVNode("li", null, "完成后会回到此页面显示结果")
            ], -1)),
            _createElementVNode("div", _hoisted_23, [
              _createElementVNode("button", {
                class: "secondary",
                disabled: loading.value,
                onClick: _cache[2] || (_cache[2] = $event => (pendingRepair.value = null))
              }, "返回核对", 8, _hoisted_24),
              _createElementVNode("button", {
                class: "primary",
                disabled: loading.value,
                onClick: repair
              }, "确认创建", 8, _hoisted_25)
            ])
          ])
        ]))
      : _createCommentVNode("", true)
  ]))
}
}

};
const AppPage = /*#__PURE__*/_export_sfc(_sfc_main, [['__scopeId',"data-v-20bd3666"]]);

export { AppPage as default };
