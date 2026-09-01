import { importShared } from './__federation_fn_import-JrT3xvdd.js';
import { _ as _export_sfc } from './_plugin-vue_export-helper-pcqpp-6-.js';

const {createElementVNode:_createElementVNode,vModelCheckbox:_vModelCheckbox,withDirectives:_withDirectives,createTextVNode:_createTextVNode,openBlock:_openBlock,createElementBlock:_createElementBlock} = await importShared('vue');


const _hoisted_1 = { class: "config-page" };

const {reactive} = await importShared('vue');


const _sfc_main = {
  __name: 'Config',
  props: { initialConfig: { type: Object, default: () => ({}) } },
  emits: ['save', 'close'],
  setup(__props, { emit: __emit }) {

const props = __props;
const emit = __emit;
const config = reactive({ enabled: false, backfill_existing_failures: false, ...props.initialConfig });

return (_ctx, _cache) => {
  return (_openBlock(), _createElementBlock("main", _hoisted_1, [
    _cache[6] || (_cache[6] = _createElementVNode("h2", null, "媒体治理设置", -1)),
    _createElementVNode("label", null, [
      _withDirectives(_createElementVNode("input", {
        "onUpdate:modelValue": _cache[0] || (_cache[0] = $event => ((config.enabled) = $event)),
        type: "checkbox"
      }, null, 512), [
        [_vModelCheckbox, config.enabled]
      ]),
      _cache[4] || (_cache[4] = _createTextVNode(" 启用媒体治理", -1))
    ]),
    _cache[7] || (_cache[7] = _createElementVNode("p", null, "启用后只观察新发生的整理结果，不会改动文件。", -1)),
    _createElementVNode("label", null, [
      _withDirectives(_createElementVNode("input", {
        "onUpdate:modelValue": _cache[1] || (_cache[1] = $event => ((config.backfill_existing_failures) = $event)),
        type: "checkbox"
      }, null, 512), [
        [_vModelCheckbox, config.backfill_existing_failures]
      ]),
      _cache[5] || (_cache[5] = _createTextVNode(" 一次性读取旧失败记录", -1))
    ]),
    _cache[8] || (_cache[8] = _createElementVNode("p", null, "默认关闭；完成后自动停止，不会周期性重扫。", -1)),
    _cache[9] || (_cache[9] = _createElementVNode("aside", null, "本插件只能生成零写入预演计划，不能移动、改名、删除、重试或创建硬链接。", -1)),
    _createElementVNode("footer", null, [
      _createElementVNode("button", {
        onClick: _cache[2] || (_cache[2] = $event => (emit('close')))
      }, "关闭"),
      _createElementVNode("button", {
        class: "primary",
        onClick: _cache[3] || (_cache[3] = $event => (emit('save', config)))
      }, "保存")
    ])
  ]))
}
}

};
const Config = /*#__PURE__*/_export_sfc(_sfc_main, [['__scopeId',"data-v-9b3cfe2b"]]);

export { Config as default };
