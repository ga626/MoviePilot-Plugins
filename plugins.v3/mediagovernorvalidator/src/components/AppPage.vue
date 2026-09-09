<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { unwrapMoviePilotResponse } from '../lib/moviepilot-response.js'

const props = defineProps({ api: { type: Object, default: () => ({}) } })
const snapshot = ref({ run: { status: 'idle', current: '尚未运行' }, stages: [], summary: {} })
const plan = ref(null)
const busy = ref(false)
const message = ref('')
const confirmRun = ref(false)
let timer = null

const running = computed(() => ['running', 'stopping'].includes(snapshot.value.run?.status))
const stopping = computed(() => snapshot.value.run?.status === 'stopping')
const finished = computed(() => ['completed', 'completed_with_findings', 'failed', 'cancelled', 'interrupted'].includes(snapshot.value.run?.status))
const completedStages = computed(() => snapshot.value.stages.filter(row => ['passed', 'failed', 'blocked', 'skipped'].includes(row.status)).length)
const progress = computed(() => Math.round(completedStages.value * 100 / 9))
const overallLabel = computed(() => ({ passed: '可以进入正式实现', not_ready: '尚未达到正式实现门槛' }[snapshot.value.summary?.overall] || '等待完整验证'))

function fail (error, fallback) { message.value = error?.message || fallback }
async function get (path) { return unwrapMoviePilotResponse(await props.api.get(path, { feedback: 'silent' })) }
async function post (path, body) { return unwrapMoviePilotResponse(await props.api.post(path, body, { feedback: 'silent' })) }

async function refresh () {
  try { snapshot.value = await get('plugin/MediaGovernorValidator/status') } catch (error) { fail(error, '没有读到验证状态') }
}

async function prepare () {
  busy.value = true; message.value = ''
  try { plan.value = await get('plugin/MediaGovernorValidator/plan'); confirmRun.value = true } catch (error) { fail(error, '没有完成只读预检') } finally { busy.value = false }
}

async function run (action) {
  busy.value = true; message.value = action === 'resume' ? '正在从已保存阶段继续。' : '完整只读验证已经启动，关闭页面不会丢失结果。'
  try { snapshot.value = await post('plugin/MediaGovernorValidator/run', { action, options: { ai_confirmed: true } }); confirmRun.value = false } catch (error) { fail(error, '没有启动验证') } finally { busy.value = false }
}

async function stop () {
  if (stopping.value) return
  message.value = '已停止领取新阶段，正在等待当前只读调用在超时边界内返回。'
  try { snapshot.value = await post('plugin/MediaGovernorValidator/run', { action: 'cancel' }) } catch (error) { fail(error, '没有提交停止请求') }
}

async function exportReport () {
  busy.value = true
  try {
    const result = await get('plugin/MediaGovernorValidator/export?format=markdown')
    const blob = new Blob([result.content], { type: `${result.content_type};charset=utf-8` })
    const url = URL.createObjectURL(blob); const link = document.createElement('a')
    link.href = url; link.download = result.filename; link.click(); URL.revokeObjectURL(url)
    message.value = '脱敏报告已经导出。'
  } catch (error) { fail(error, '没有导出报告') } finally { busy.value = false }
}

function stageLabel (status) { return ({ passed: '通过', failed: '失败', blocked: '阻断', skipped: '跳过', interrupted: '未完成，续跑会重试', running: '运行中' }[status] || '等待') }

onMounted(async () => { await refresh(); timer = window.setInterval(() => { if (running.value) refresh() }, 1500) })
onBeforeUnmount(() => window.clearInterval(timer))
</script>

<template>
  <main class="validator-shell">
    <section class="hero">
      <div>
        <p class="eyebrow">MediaGovernorValidator 0.1.0 · 只读</p>
        <h1>一次跑完，先证明整条链真的可用</h1>
        <p class="lead">新下载按下载器任务建立强边界，旧库存按当前顶层目录建立推定边界。验证台只读证据并做实验，不会整理、删除、移动或创建硬链接。</p>
      </div>
      <div class="actions">
        <button v-if="running" class="secondary" :disabled="stopping" @click="stop">{{ stopping ? '正在停止…' : '停止' }}</button>
        <button v-else class="primary" :disabled="busy" @click="prepare">运行全部只读验证</button>
        <button class="secondary" :disabled="busy || running || !finished" @click="run('resume')">继续未完成验证</button>
        <button class="secondary" :disabled="busy || running || !snapshot.stages.length" @click="exportReport">导出脱敏报告</button>
      </div>
    </section>

    <section class="status" aria-live="polite">
      <div class="status-head">
        <div><span class="signal" :class="snapshot.run.status" /><span><b>{{ overallLabel }}</b><small>{{ snapshot.run.current }}</small></span></div>
        <strong>{{ completedStages }}/9</strong>
      </div>
      <div class="bar"><i :style="{ width: `${progress}%` }" /></div>
      <p v-if="snapshot.run.error" class="error">{{ snapshot.run.error }}</p>
      <p v-if="message" class="notice">{{ message }}</p>
    </section>

    <section class="summary-grid">
      <article><span>整理失败</span><strong>{{ snapshot.summary?.native_failure || 0 }}</strong></article>
      <article><span>假成功</span><strong>{{ snapshot.summary?.false_success || 0 }}</strong></article>
      <article><span>需要确认</span><strong>{{ snapshot.summary?.needs_confirmation || 0 }}</strong></article>
      <article><span>没有读完</span><strong>{{ snapshot.summary?.incomplete || 0 }}</strong></article>
    </section>

    <section class="panel">
      <header><div><p class="eyebrow">V0—V8</p><h2>完整验证链</h2></div><span>关键门失败后仍保留诊断，不会显示整体通过</span></header>
      <ol class="stages">
        <li v-for="(row, index) in [
          ['V0','宿主能力预检'],['V1','新下载与旧库存边界'],['V2','完整证据编译'],['V3','AI 格式与批次实验'],['V4','数据库候选核验'],['V5','官方预览合同'],['V6','源、当前目标与应有目标对账'],['V7','隐藏答案真值回放'],['V8','停止、恢复与增量验证']
        ]" :key="row[0]">
          <span class="step">{{ index + 1 }}</span>
          <span><b>{{ row[0] }} · {{ row[1] }}</b><small>{{ stageLabel(snapshot.stages.find(item => item.stage === row[0])?.status) }}</small></span>
          <em :class="snapshot.stages.find(item => item.stage === row[0])?.status">{{ snapshot.stages.find(item => item.stage === row[0])?.elapsed_ms || 0 }} ms</em>
        </li>
      </ol>
    </section>

    <div v-if="confirmRun" class="backdrop" @click.self="confirmRun = false">
      <section class="dialog" role="dialog" aria-modal="true" aria-label="确认运行全部只读验证">
        <button class="close" aria-label="关闭" @click="confirmRun = false">×</button>
        <p class="eyebrow">运行前确认</p>
        <h2>这次会读取和发送什么</h2>
        <div class="facts">
          <div><span>当前下载任务</span><b>{{ plan?.current_torrents ?? '未读到' }}</b></div>
          <div><span>唯一下载根</span><b>{{ plan?.unique_download_roots ?? '未读到' }}</b></div>
          <div><span>预计模型调用</span><b>约 {{ plan?.estimated_ai_calls || 13 }} 次</b></div>
        </div>
        <ul>
          <li>发送：脱敏相对文件名、大小、扩展名和本地提取的年份/季集弱提示。</li>
          <li>不发送：视频内容、真实根路径、torrent hash、tracker、Cookie 或下载器凭据。</li>
          <li>不写入：媒体、历史、下载器和 MoviePilot 配置。</li>
        </ul>
        <p v-if="plan?.preflight_error" class="error">预检发现：{{ plan.preflight_error }}</p>
        <div class="dialog-actions"><button class="secondary" @click="confirmRun = false">返回</button><button class="primary" :disabled="busy" @click="run('all')">确认并运行全部</button></div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.validator-shell{--ink:rgb(var(--v-theme-on-surface,242,245,250));--muted:rgba(var(--v-theme-on-surface,242,245,250),.68);--line:rgba(var(--v-theme-on-surface,242,245,250),.13);--surface:rgba(var(--v-theme-surface,31,27,46),.9);--paper:rgba(var(--v-theme-surface-variant,var(--v-theme-surface,31,27,46)),.55);--primary:rgb(var(--v-theme-primary,179,157,219));--primary-soft:rgba(var(--v-theme-primary,179,157,219),.14);--error:rgb(var(--v-theme-error,239,83,80));color:var(--ink);display:grid;gap:16px;max-width:1120px;margin:auto;padding:20px}.validator-shell h1,.validator-shell h2,.validator-shell b,.validator-shell strong{color:var(--ink)}.hero,.status,.panel{background:var(--surface);border:1px solid var(--line);border-radius:18px;box-shadow:0 14px 40px rgba(0,0,0,.16)}.hero{display:flex;justify-content:space-between;gap:26px;padding:26px;background:linear-gradient(135deg,var(--primary-soft),rgba(var(--v-theme-surface,31,27,46),.95) 58%,rgba(var(--v-theme-background,18,15,28),.9))}.hero h1{font-size:30px;line-height:1.18;margin:0}.eyebrow{margin:0 0 7px;color:var(--primary);font-size:12px;font-weight:800;letter-spacing:.11em;text-transform:uppercase}.lead{max-width:700px;color:var(--muted);line-height:1.65}.actions{display:flex;align-content:flex-start;justify-content:flex-end;gap:9px;flex-wrap:wrap}.primary,.secondary{font:inherit;border-radius:11px;padding:10px 14px;font-weight:750;cursor:pointer}.primary{border:0;color:rgb(var(--v-theme-on-primary,255,255,255));background:var(--primary)}.secondary{border:1px solid var(--line);color:var(--ink);background:var(--paper)}button:disabled{opacity:.46;cursor:not-allowed}.status{padding:18px 20px}.status-head,.status-head>div{display:flex;align-items:center;justify-content:space-between}.status-head>div{gap:10px}.status-head span:not(.signal){display:grid;gap:3px}.status-head small{color:var(--muted)}.signal{width:10px;height:10px;border-radius:50%;background:var(--muted)}.signal.running{background:var(--primary);box-shadow:0 0 0 5px var(--primary-soft)}.signal.completed{background:rgb(var(--v-theme-success,76,175,80))}.signal.completed_with_findings,.signal.failed{background:var(--error)}.bar{height:6px;margin-top:14px;border-radius:99px;overflow:hidden;background:rgba(var(--v-theme-on-surface,242,245,250),.08)}.bar i{display:block;height:100%;background:var(--primary);transition:width .25s}.notice,.error{font-size:13px;line-height:1.55}.notice{color:var(--primary)}.error{color:var(--error)}.summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.summary-grid article{display:flex;align-items:flex-end;justify-content:space-between;padding:17px 19px;border:1px solid var(--line);border-radius:14px;background:var(--paper)}.summary-grid span{color:var(--muted);font-size:12px}.summary-grid strong{font-size:27px}.panel{overflow:hidden}.panel header{display:flex;justify-content:space-between;align-items:end;padding:21px 22px 14px}.panel h2{margin:0;font-size:20px}.panel header>span{max-width:330px;text-align:right;color:var(--muted);font-size:12px}.stages{list-style:none;margin:0;padding:0}.stages li{display:grid;grid-template-columns:34px 1fr auto;gap:12px;align-items:center;padding:14px 22px;border-top:1px solid var(--line)}.step{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:var(--primary-soft);color:var(--primary);font-size:12px;font-weight:800}.stages li>span:nth-child(2){display:grid;gap:4px}.stages small{color:var(--muted)}.stages em{font-style:normal;color:var(--muted);font-size:12px}.stages em.passed{color:rgb(var(--v-theme-success,76,175,80))}.stages em.failed,.stages em.blocked{color:var(--error)}.backdrop{position:fixed;inset:0;z-index:60;display:grid;place-items:center;padding:20px;background:rgba(5,4,9,.74)}.dialog{position:relative;width:min(680px,95vw);max-height:90vh;overflow:auto;padding:28px;border:1px solid var(--line);border-radius:20px;background:rgb(var(--v-theme-surface,31,27,46));box-shadow:0 24px 80px #0008}.dialog h2{margin:0}.close{position:absolute;right:17px;top:13px;border:0;background:transparent;color:var(--ink);font-size:28px;cursor:pointer}.facts{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:20px 0}.facts div{display:grid;gap:5px;padding:13px;border-radius:11px;background:var(--paper)}.facts span,.dialog li{color:var(--muted);font-size:13px;line-height:1.55}.dialog-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:22px}@media(max-width:760px){.validator-shell{padding:12px}.hero{display:grid}.actions{justify-content:flex-start}.summary-grid,.facts{grid-template-columns:1fr 1fr}.panel header{display:grid;gap:8px}.panel header>span{text-align:left}.stages li{padding:13px 15px}.stages em{display:none}}@media(max-width:480px){.summary-grid,.facts{grid-template-columns:1fr}.actions button{width:100%}}@media(prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}}
</style>
