import { importShared } from './__federation_fn_import-JrT3xvdd.js';
import { _ as _export_sfc } from './_plugin-vue_export-helper-pcqpp-6-.js';

const {vModelCheckbox:_vModelCheckbox,createElementVNode:_createElementVNode,withDirectives:_withDirectives,createTextVNode:_createTextVNode,openBlock:_openBlock,createElementBlock:_createElementBlock} = await importShared('vue');


const _hoisted_1 = { class: "validator-config" };

const {computed} = await importShared('vue');


const _sfc_main = {
  __name: 'Config',
  props: { modelValue: { type: Object, default: () => ({ enabled: false }) } },
  emits: ['update:modelValue'],
  setup(__props, { emit: __emit }) {

const props = __props;
const emit = __emit;
const enabled = computed({ get: () => Boolean(props.modelValue?.enabled), set: value => emit('update:modelValue', { ...props.modelValue, enabled: value }) });

return (_ctx, _cache) => {
  return (_openBlock(), _createElementBlock("label", _hoisted_1, [
    _withDirectives(_createElementVNode("input", {
      "onUpdate:modelValue": _cache[0] || (_cache[0] = $event => ((enabled).value = $event)),
      type: "checkbox"
    }, null, 512), [
      [_vModelCheckbox, enabled.value]
    ]),
    _cache[1] || (_cache[1] = _createTextVNode(" 启用媒体治理验证台", -1))
  ]))
}
}

};
const Config = /*#__PURE__*/_export_sfc(_sfc_main, [['__scopeId',"data-v-f204948a"]]);

export { Config as default };
