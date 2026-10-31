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
const config = reactive({ enabled: false, ai_enabled: false, read_only: true, ...props.initialConfig });

return (_ctx, _cache) => {
  return (_openBlock(), _createElementBlock("main", _hoisted_1, [
    _cache[8] || (_cache[8] = _createElementVNode("h2", null, "媒体治理设置", -1)),
    _createElementVNode("label", null, [
      _withDirectives(_createElementVNode("input", {
        "onUpdate:modelValue": _cache[0] || (_cache[0] = $event => ((config.enabled) = $event)),
        type: "checkbox"
      }, null, 512), [
        [_vModelCheckbox, config.enabled]
      ]),
      _cache[5] || (_cache[5] = _createTextVNode(" 启用媒体治理", -1))
    ]),
    _cache[9] || (_cache[9] = _createElementVNode("p", null, "启用后才可打开治理台；检查只在你点击开始后发生。", -1)),
    _createElementVNode("label", null, [
      _withDirectives(_createElementVNode("input", {
        "onUpdate:modelValue": _cache[1] || (_cache[1] = $event => ((config.read_only) = $event)),
        type: "checkbox"
      }, null, 512), [
        [_vModelCheckbox, config.read_only]
      ]),
      _cache[6] || (_cache[6] = _createTextVNode(" 只读模式（默认开启）", -1))
    ]),
    _cache[10] || (_cache[10] = _createElementVNode("p", null, "只检查、保存身份选择和生成预览，不修改媒体。只读验收完成并决定执行某项修复后才关闭；关闭不等于批准修复，仍须逐项预览和确认。", -1)),
    _createElementVNode("label", null, [
      _withDirectives(_createElementVNode("input", {
        "onUpdate:modelValue": _cache[2] || (_cache[2] = $event => ((config.ai_enabled) = $event)),
        type: "checkbox"
      }, null, 512), [
        [_vModelCheckbox, config.ai_enabled]
      ]),
      _cache[7] || (_cache[7] = _createTextVNode(" 允许疑难项使用 AI 候选（默认关闭）", -1))
    ]),
    _cache[11] || (_cache[11] = _createElementVNode("p", null, "仅当规则和数据库没有候选、文件范围无明显混包时使用。会将标题和季集统计摘要发给已配置模型，可能计费；不会发送完整路径或文件名列表。关闭后仍可检查链接、搜索数据库和人工确认。", -1)),
    _cache[12] || (_cache[12] = _createElementVNode("aside", null, "插件把路径只保存在插件私有账本中。只有关闭只读、查看逐文件预览并最终确认后，才会让 MoviePilot 清理可归因的错误硬链接并重新整理；不会删除原始下载。", -1)),
    _createElementVNode("footer", null, [
      _createElementVNode("button", {
        onClick: _cache[3] || (_cache[3] = $event => (emit('close')))
      }, "关闭"),
      _createElementVNode("button", {
        class: "primary",
        onClick: _cache[4] || (_cache[4] = $event => (emit('save', config)))
      }, "保存")
    ])
  ]))
}
}

};
const Config = /*#__PURE__*/_export_sfc(_sfc_main, [['__scopeId',"data-v-5a5ab19a"]]);

export { Config as default };
