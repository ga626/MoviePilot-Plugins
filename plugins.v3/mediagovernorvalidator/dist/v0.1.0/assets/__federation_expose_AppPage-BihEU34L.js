import { importShared } from './__federation_fn_import-JrT3xvdd.js';
import { _ as _export_sfc } from './_plugin-vue_export-helper-pcqpp-6-.js';

function unwrapMoviePilotResponse (response) {
  const body = response?.data ?? response;
  if (body?.success === false) throw new Error(body.message || 'MoviePilot 返回失败')
  return body?.data ?? body ?? {}
}

const {createElementVNode:_createElementVNode,toDisplayString:_toDisplayString,openBlock:_openBlock,createElementBlock:_createElementBlock,createCommentVNode:_createCommentVNode,normalizeClass:_normalizeClass,normalizeStyle:_normalizeStyle,renderList:_renderList,Fragment:_Fragment,withModifiers:_withModifiers} = await importShared('vue');


const _hoisted_1 = { class: "validator-shell" };
const _hoisted_2 = { class: "hero" };
const _hoisted_3 = { class: "actions" };
const _hoisted_4 = ["disabled"];
const _hoisted_5 = ["disabled"];
const _hoisted_6 = ["disabled"];
const _hoisted_7 = ["disabled"];
const _hoisted_8 = {
  class: "status",
  "aria-live": "polite"
};
const _hoisted_9 = { class: "status-head" };
const _hoisted_10 = { class: "bar" };
const _hoisted_11 = {
  key: 0,
  class: "error"
};
const _hoisted_12 = {
  key: 1,
  class: "notice"
};
const _hoisted_13 = { class: "summary-grid" };
const _hoisted_14 = { class: "panel" };
const _hoisted_15 = { class: "stages" };
const _hoisted_16 = { class: "step" };
const _hoisted_17 = {
  class: "dialog",
  role: "dialog",
  "aria-modal": "true",
  "aria-label": "确认运行全部只读验证"
};
const _hoisted_18 = { class: "facts" };
const _hoisted_19 = {
  key: 0,
  class: "error"
};
const _hoisted_20 = { class: "dialog-actions" };
const _hoisted_21 = ["disabled"];

const {computed,onBeforeUnmount,onMounted,ref} = await importShared('vue');


const _sfc_main = {
  __name: 'AppPage',
  props: { api: { type: Object, default: () => ({}) } },
  setup(__props) {

const props = __props;
const snapshot = ref({ run: { status: 'idle', current: '尚未运行' }, stages: [], summary: {} });
const plan = ref(null);
const busy = ref(false);
const message = ref('');
const confirmRun = ref(false);
let timer = null;

const running = computed(() => ['running', 'stopping'].includes(snapshot.value.run?.status));
const stopping = computed(() => snapshot.value.run?.status === 'stopping');
const finished = computed(() => ['completed', 'completed_with_findings', 'failed', 'cancelled', 'interrupted'].includes(snapshot.value.run?.status));
const completedStages = computed(() => snapshot.value.stages.filter(row => ['passed', 'failed', 'blocked', 'skipped'].includes(row.status)).length);
const progress = computed(() => Math.round(completedStages.value * 100 / 9));
const overallLabel = computed(() => ({ passed: '可以进入正式实现', not_ready: '尚未达到正式实现门槛' }[snapshot.value.summary?.overall] || '等待完整验证'));

function fail (error, fallback) { message.value = error?.message || fallback; }
async function get (path) { return unwrapMoviePilotResponse(await props.api.get(path, { feedback: 'silent' })) }
async function post (path, body) { return unwrapMoviePilotResponse(await props.api.post(path, body, { feedback: 'silent' })) }

async function refresh () {
  try { snapshot.value = await get('plugin/MediaGovernorValidator/status'); } catch (error) { fail(error, '没有读到验证状态'); }
}

async function prepare () {
  busy.value = true; message.value = '';
  try { plan.value = await get('plugin/MediaGovernorValidator/plan'); confirmRun.value = true; } catch (error) { fail(error, '没有完成只读预检'); } finally { busy.value = false; }
}

async function run (action) {
  busy.value = true; message.value = action === 'resume' ? '正在从已保存阶段继续。' : '完整只读验证已经启动，关闭页面不会丢失结果。';
  try { snapshot.value = await post('plugin/MediaGovernorValidator/run', { action, options: { ai_confirmed: true } }); confirmRun.value = false; } catch (error) { fail(error, '没有启动验证'); } finally { busy.value = false; }
}

async function stop () {
  if (stopping.value) return
  message.value = '已停止领取新阶段，正在等待当前只读调用在超时边界内返回。';
  try { snapshot.value = await post('plugin/MediaGovernorValidator/run', { action: 'cancel' }); } catch (error) { fail(error, '没有提交停止请求'); }
}

async function exportReport () {
  busy.value = true;
  try {
    const result = await get('plugin/MediaGovernorValidator/export?format=markdown');
    const blob = new Blob([result.content], { type: `${result.content_type};charset=utf-8` });
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = result.filename; link.click(); URL.revokeObjectURL(url);
    message.value = '脱敏报告已经导出。';
  } catch (error) { fail(error, '没有导出报告'); } finally { busy.value = false; }
}

function stageLabel (status) { return ({ passed: '通过', failed: '失败', blocked: '阻断', skipped: '跳过', interrupted: '未完成，续跑会重试', running: '运行中' }[status] || '等待') }

onMounted(async () => { await refresh(); timer = window.setInterval(() => { if (running.value) refresh(); }, 1500); });
onBeforeUnmount(() => window.clearInterval(timer));

return (_ctx, _cache) => {
  return (_openBlock(), _createElementBlock("main", _hoisted_1, [
    _createElementVNode("section", _hoisted_2, [
      _cache[5] || (_cache[5] = _createElementVNode("div", null, [
        _createElementVNode("p", { class: "eyebrow" }, "MediaGovernorValidator 0.1.0 · 只读"),
        _createElementVNode("h1", null, "一次跑完，先证明整条链真的可用"),
        _createElementVNode("p", { class: "lead" }, "新下载按下载器任务建立强边界，旧库存按当前顶层目录建立推定边界。验证台只读证据并做实验，不会整理、删除、移动或创建硬链接。")
      ], -1)),
      _createElementVNode("div", _hoisted_3, [
        (running.value)
          ? (_openBlock(), _createElementBlock("button", {
              key: 0,
              class: "secondary",
              disabled: stopping.value,
              onClick: stop
            }, _toDisplayString(stopping.value ? '正在停止…' : '停止'), 9, _hoisted_4))
          : (_openBlock(), _createElementBlock("button", {
              key: 1,
              class: "primary",
              disabled: busy.value,
              onClick: prepare
            }, "运行全部只读验证", 8, _hoisted_5)),
        _createElementVNode("button", {
          class: "secondary",
          disabled: busy.value || running.value || !finished.value,
          onClick: _cache[0] || (_cache[0] = $event => (run('resume')))
        }, "继续未完成验证", 8, _hoisted_6),
        _createElementVNode("button", {
          class: "secondary",
          disabled: busy.value || running.value || !snapshot.value.stages.length,
          onClick: exportReport
        }, "导出脱敏报告", 8, _hoisted_7)
      ])
    ]),
    _createElementVNode("section", _hoisted_8, [
      _createElementVNode("div", _hoisted_9, [
        _createElementVNode("div", null, [
          _createElementVNode("span", {
            class: _normalizeClass(["signal", snapshot.value.run.status])
          }, null, 2),
          _createElementVNode("span", null, [
            _createElementVNode("b", null, _toDisplayString(overallLabel.value), 1),
            _createElementVNode("small", null, _toDisplayString(snapshot.value.run.current), 1)
          ])
        ]),
        _createElementVNode("strong", null, _toDisplayString(completedStages.value) + "/9", 1)
      ]),
      _createElementVNode("div", _hoisted_10, [
        _createElementVNode("i", {
          style: _normalizeStyle({ width: `${progress.value}%` })
        }, null, 4)
      ]),
      (snapshot.value.run.error)
        ? (_openBlock(), _createElementBlock("p", _hoisted_11, _toDisplayString(snapshot.value.run.error), 1))
        : _createCommentVNode("", true),
      (message.value)
        ? (_openBlock(), _createElementBlock("p", _hoisted_12, _toDisplayString(message.value), 1))
        : _createCommentVNode("", true)
    ]),
    _createElementVNode("section", _hoisted_13, [
      _createElementVNode("article", null, [
        _cache[6] || (_cache[6] = _createElementVNode("span", null, "整理失败", -1)),
        _createElementVNode("strong", null, _toDisplayString(snapshot.value.summary?.native_failure || 0), 1)
      ]),
      _createElementVNode("article", null, [
        _cache[7] || (_cache[7] = _createElementVNode("span", null, "假成功", -1)),
        _createElementVNode("strong", null, _toDisplayString(snapshot.value.summary?.false_success || 0), 1)
      ]),
      _createElementVNode("article", null, [
        _cache[8] || (_cache[8] = _createElementVNode("span", null, "需要确认", -1)),
        _createElementVNode("strong", null, _toDisplayString(snapshot.value.summary?.needs_confirmation || 0), 1)
      ]),
      _createElementVNode("article", null, [
        _cache[9] || (_cache[9] = _createElementVNode("span", null, "没有读完", -1)),
        _createElementVNode("strong", null, _toDisplayString(snapshot.value.summary?.incomplete || 0), 1)
      ])
    ]),
    _createElementVNode("section", _hoisted_14, [
      _cache[10] || (_cache[10] = _createElementVNode("header", null, [
        _createElementVNode("div", null, [
          _createElementVNode("p", { class: "eyebrow" }, "V0—V8"),
          _createElementVNode("h2", null, "完整验证链")
        ]),
        _createElementVNode("span", null, "关键门失败后仍保留诊断，不会显示整体通过")
      ], -1)),
      _createElementVNode("ol", _hoisted_15, [
        (_openBlock(), _createElementBlock(_Fragment, null, _renderList([
          ['V0','宿主能力预检'],['V1','新下载与旧库存边界'],['V2','完整证据编译'],['V3','AI 格式与批次实验'],['V4','数据库候选核验'],['V5','官方预览合同'],['V6','源、当前目标与应有目标对账'],['V7','隐藏答案真值回放'],['V8','停止、恢复与增量验证']
        ], (row, index) => {
          return _createElementVNode("li", {
            key: row[0]
          }, [
            _createElementVNode("span", _hoisted_16, _toDisplayString(index + 1), 1),
            _createElementVNode("span", null, [
              _createElementVNode("b", null, _toDisplayString(row[0]) + " · " + _toDisplayString(row[1]), 1),
              _createElementVNode("small", null, _toDisplayString(stageLabel(snapshot.value.stages.find(item => item.stage === row[0])?.status)), 1)
            ]),
            _createElementVNode("em", {
              class: _normalizeClass(snapshot.value.stages.find(item => item.stage === row[0])?.status)
            }, _toDisplayString(snapshot.value.stages.find(item => item.stage === row[0])?.elapsed_ms || 0) + " ms", 3)
          ])
        }), 64))
      ])
    ]),
    (confirmRun.value)
      ? (_openBlock(), _createElementBlock("div", {
          key: 0,
          class: "backdrop",
          onClick: _cache[4] || (_cache[4] = _withModifiers($event => (confirmRun.value = false), ["self"]))
        }, [
          _createElementVNode("section", _hoisted_17, [
            _createElementVNode("button", {
              class: "close",
              "aria-label": "关闭",
              onClick: _cache[1] || (_cache[1] = $event => (confirmRun.value = false))
            }, "×"),
            _cache[14] || (_cache[14] = _createElementVNode("p", { class: "eyebrow" }, "运行前确认", -1)),
            _cache[15] || (_cache[15] = _createElementVNode("h2", null, "这次会读取和发送什么", -1)),
            _createElementVNode("div", _hoisted_18, [
              _createElementVNode("div", null, [
                _cache[11] || (_cache[11] = _createElementVNode("span", null, "当前下载任务", -1)),
                _createElementVNode("b", null, _toDisplayString(plan.value?.current_torrents ?? '未读到'), 1)
              ]),
              _createElementVNode("div", null, [
                _cache[12] || (_cache[12] = _createElementVNode("span", null, "唯一下载根", -1)),
                _createElementVNode("b", null, _toDisplayString(plan.value?.unique_download_roots ?? '未读到'), 1)
              ]),
              _createElementVNode("div", null, [
                _cache[13] || (_cache[13] = _createElementVNode("span", null, "预计模型调用", -1)),
                _createElementVNode("b", null, "约 " + _toDisplayString(plan.value?.estimated_ai_calls || 13) + " 次", 1)
              ])
            ]),
            _cache[16] || (_cache[16] = _createElementVNode("ul", null, [
              _createElementVNode("li", null, "发送：脱敏相对文件名、大小、扩展名和本地提取的年份/季集弱提示。"),
              _createElementVNode("li", null, "不发送：视频内容、真实根路径、torrent hash、tracker、Cookie 或下载器凭据。"),
              _createElementVNode("li", null, "不写入：媒体、历史、下载器和 MoviePilot 配置。")
            ], -1)),
            (plan.value?.preflight_error)
              ? (_openBlock(), _createElementBlock("p", _hoisted_19, "预检发现：" + _toDisplayString(plan.value.preflight_error), 1))
              : _createCommentVNode("", true),
            _createElementVNode("div", _hoisted_20, [
              _createElementVNode("button", {
                class: "secondary",
                onClick: _cache[2] || (_cache[2] = $event => (confirmRun.value = false))
              }, "返回"),
              _createElementVNode("button", {
                class: "primary",
                disabled: busy.value,
                onClick: _cache[3] || (_cache[3] = $event => (run('all')))
              }, "确认并运行全部", 8, _hoisted_21)
            ])
          ])
        ]))
      : _createCommentVNode("", true)
  ]))
}
}

};
const AppPage = /*#__PURE__*/_export_sfc(_sfc_main, [['__scopeId',"data-v-65cd457d"]]);

export { AppPage as default };
