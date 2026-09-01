import { importShared } from './__federation_fn_import-JrT3xvdd.js';
import { _ as _export_sfc } from './_plugin-vue_export-helper-pcqpp-6-.js';

const {createElementVNode:_createElementVNode,toDisplayString:_toDisplayString,openBlock:_openBlock,createElementBlock:_createElementBlock,createCommentVNode:_createCommentVNode,renderList:_renderList,Fragment:_Fragment,normalizeClass:_normalizeClass,createTextVNode:_createTextVNode} = await importShared('vue');


const _hoisted_1 = { class: "governor-page" };
const _hoisted_2 = ["disabled"];
const _hoisted_3 = {
  key: 0,
  class: "notice error"
};
const _hoisted_4 = {
  class: "summary",
  "aria-label": "问题概览"
};
const _hoisted_5 = { class: "panel" };
const _hoisted_6 = {
  key: 0,
  class: "empty"
};
const _hoisted_7 = { key: 0 };
const _hoisted_8 = { class: "muted" };
const _hoisted_9 = {
  key: 0,
  class: "muted"
};
const _hoisted_10 = ["disabled", "onClick"];
const _hoisted_11 = {
  key: 1,
  class: "panel"
};

const {computed,inject,onMounted,ref} = await importShared('vue');



const _sfc_main = {
  __name: 'AppPage',
  props: { api: { type: Object, default: () => ({}) }, pluginId: { type: String, default: 'MediaGovernor' } },
  setup(__props) {

const props = __props;
const toast = inject('moviepilot:toast', null);
const loading = ref(false);
const error = ref('');
const result = ref({ items: [], summary: {} });
const plans = ref([]);
const statuses = {
  verified: ['已验证', '记录彼此一致，尚未发现可证明的问题。'],
  needs_attention: ['需要处理', '原生记录失败或出现可证明的不一致。'],
  needs_selection: ['需要选择', '记录存在身份冲突，插件不会替你猜测。'],
  awaiting_host_information: ['等待宿主信息', 'MoviePilot 未提供足够公开字段，插件不会猜测。'],
};
const cards = computed(() => result.value.items || []);
const previewDetails = {
  preview_ready: '可以继续：MoviePilot 已生成硬链接预演计划，但本插件不会执行写入。',
  preview_rejected: '暂不能继续：MoviePilot 未能为这条记录生成安全的硬链接预演。请保留该问题，等待更多宿主信息或在原生整理页面核对。',
  history_fileitem_unavailable: '暂不能继续：原始失败记录没有提供可用于预演的文件信息。',
  history_not_previewable: '暂不能继续：这条历史记录已不适合再次预演。',
  history_not_in_failure_queue: '暂不能继续：这条记录不在当前失败问题队列中。',
  plugin_disabled: '暂不能继续：媒体治理当前未启用。',
};
function describePreview(detail) { return previewDetails[detail] || '暂不能继续：MoviePilot 没有返回可安全执行的预演结果。' }
async function refresh() {
  if (typeof props.api?.get !== 'function') { error.value = '当前 MoviePilot 未提供插件数据接口'; return }
  loading.value = true; error.value = '';
  try {
    const [packages, nextPlans] = await Promise.all([
      props.api.get(`plugin/${props.pluginId}/packages`),
      props.api.get(`plugin/${props.pluginId}/plans`),
    ]);
    result.value = packages?.data ?? packages ?? { items: [], summary: {} };
    plans.value = (nextPlans?.data ?? nextPlans ?? {}).items || [];
  } catch (cause) { error.value = cause?.message || '读取媒体治理数据失败'; }
  finally { loading.value = false; }
}
async function preview(card) {
  const historyId = (card.history_ids || [])[0];
  if (!historyId || typeof props.api?.post !== 'function') { error.value = '此问题没有可预演的失败记录'; return }
  loading.value = true; error.value = '';
  try {
    const response = await props.api.post(`plugin/${props.pluginId}/packages/${historyId}/preview`);
    const data = response?.data ?? response;
    await refresh();
    if (!data?.ok) { error.value = describePreview(data?.detail); return }
    toast?.success?.('已生成零写入预演计划');
  } catch (cause) { error.value = cause?.message || '生成预演失败'; }
  finally { loading.value = false; }
}
onMounted(refresh);

return (_ctx, _cache) => {
  return (_openBlock(), _createElementBlock("main", _hoisted_1, [
    _createElementVNode("header", null, [
      _cache[0] || (_cache[0] = _createElementVNode("div", null, [
        _createElementVNode("p", { class: "eyebrow" }, "MEDIA GOVERNOR"),
        _createElementVNode("h1", null, "媒体治理"),
        _createElementVNode("p", null, "核对整理结果，归集问题；所有预演都不会改动文件。")
      ], -1)),
      _createElementVNode("button", {
        disabled: loading.value,
        onClick: refresh
      }, _toDisplayString(loading.value ? '刷新中…' : '刷新'), 9, _hoisted_2)
    ]),
    (error.value)
      ? (_openBlock(), _createElementBlock("p", _hoisted_3, _toDisplayString(error.value), 1))
      : _createCommentVNode("", true),
    _createElementVNode("section", _hoisted_4, [
      (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(result.value.summary || {}, (count, key) => {
        return (_openBlock(), _createElementBlock("article", { key: key }, [
          _createElementVNode("strong", null, _toDisplayString(count), 1),
          _createElementVNode("span", null, _toDisplayString(statuses[key]?.[0] || key), 1)
        ]))
      }), 128))
    ]),
    _createElementVNode("section", _hoisted_5, [
      _cache[1] || (_cache[1] = _createElementVNode("h2", null, "问题与结果", -1)),
      _cache[2] || (_cache[2] = _createElementVNode("p", { class: "muted" }, "“已验证”表示公开记录一致，不代表媒体服务器最终展示已被验证。", -1)),
      (!cards.value.length)
        ? (_openBlock(), _createElementBlock("div", _hoisted_6, "还没有可展示的整理记录。启用后，新的整理事件会自动进入这里。"))
        : _createCommentVNode("", true),
      (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(cards.value, (card) => {
        return (_openBlock(), _createElementBlock("article", {
          key: card.package_id,
          class: "card"
        }, [
          _createElementVNode("div", null, [
            _createElementVNode("span", {
              class: _normalizeClass(["badge", card.status])
            }, _toDisplayString(statuses[card.status]?.[0] || card.status), 3),
            _createElementVNode("h3", null, [
              _createTextVNode(_toDisplayString(card.title || '未取得媒体身份') + " ", 1),
              (card.year)
                ? (_openBlock(), _createElementBlock("small", _hoisted_7, "(" + _toDisplayString(card.year) + ")", 1))
                : _createCommentVNode("", true)
            ]),
            _createElementVNode("p", null, _toDisplayString(statuses[card.status]?.[1]), 1),
            _createElementVNode("p", _hoisted_8, "原因：" + _toDisplayString((card.reason_codes || []).join('、') || '公开记录一致'), 1),
            (card.last_preview)
              ? (_openBlock(), _createElementBlock("p", _hoisted_9, "最近预演：" + _toDisplayString(card.last_preview.status === 'ready' ? '可以继续' : '暂不能继续') + "。" + _toDisplayString(describePreview(card.last_preview.detail)), 1))
              : _createCommentVNode("", true)
          ]),
          (card.failure_count)
            ? (_openBlock(), _createElementBlock("button", {
                key: 0,
                disabled: loading.value,
                onClick: $event => (preview(card))
              }, "查看硬链接预演", 8, _hoisted_10))
            : _createCommentVNode("", true)
        ]))
      }), 128))
    ]),
    (plans.value.length)
      ? (_openBlock(), _createElementBlock("section", _hoisted_11, [
          _cache[3] || (_cache[3] = _createElementVNode("h2", null, "预演计划", -1)),
          _cache[4] || (_cache[4] = _createElementVNode("p", { class: "muted" }, "计划只证明预演可以继续；它不会创建、移动、改名、覆盖或删除任何文件。", -1)),
          (_openBlock(true), _createElementBlock(_Fragment, null, _renderList(plans.value, (plan) => {
            return (_openBlock(), _createElementBlock("article", {
              key: plan.plan_id,
              class: "plan"
            }, [
              _createElementVNode("strong", null, _toDisplayString(plan.status === 'ready' ? '预演已准备好' : '预演已过期'), 1),
              _createElementVNode("span", null, "方式：" + _toDisplayString(plan.transfer_type) + " · " + _toDisplayString(plan.detail), 1)
            ]))
          }), 128))
        ]))
      : _createCommentVNode("", true)
  ]))
}
}

};
const AppPage = /*#__PURE__*/_export_sfc(_sfc_main, [['__scopeId',"data-v-24d7f8f5"]]);

export { AppPage as default };
