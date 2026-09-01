<script setup>
import { computed, inject, onMounted, ref } from 'vue'

const props = defineProps({ api: { type: Object, default: () => ({}) }, pluginId: { type: String, default: 'MediaGovernor' } })
const toast = inject('moviepilot:toast', null)
const loading = ref(false)
const notice = ref('')
const result = ref({ items: [], summary: { state: 'idle', total: 0, checked: 0, pending: 0 } })
const plans = ref([])
const selected = ref(null)
const previewResult = ref(null)
const pendingRepair = ref(null)
const cards = computed(() => result.value.items || [])
const summary = computed(() => result.value.summary || {})
const hasChecked = computed(() => summary.value.state === 'complete' || summary.value.state === 'partial')
const completed = computed(() => summary.value.state === 'complete')

const auditGuide = {
  ready_to_plan: { label: '可以处理', detail: '已经识别作品，并确认目前可以安全创建硬链接。' },
  preview_rejected: { label: '暂不能处理', detail: '已经识别作品，但这次检查不能安全创建硬链接。' },
  identity_unresolved: { label: '无法自动识别', detail: '历史记录的信息不足，暂时不能可靠确定这是什么作品。' },
}
const fallbackGuide = { label: '需要进一步核对', detail: '这条记录需要进一步核对；系统不会猜测作品或改动文件。' }

function titleFor(card) {
  if (!card?.title) return '无法自动识别的整理记录'
  return `${card.title}${card.year ? `（${card.year}）` : ''}`
}
function guideFor(card) { return auditGuide[card?.status] || fallbackGuide }
function planFor(card) { return plans.value.find(plan => plan.history_id === card?.history_id && plan.status === 'ready') || null }
function latestCheck(card) {
  if (previewResult.value) return previewResult.value
  if (card?.status === 'ready_to_plan') return { tone: 'ready', title: '可以创建硬链接', detail: '批量检查已通过。生成处理方案后，仍需你确认才会真正创建硬链接。' }
  if (card?.status === 'preview_rejected') return { tone: 'blocked', title: '现在不能安全处理', detail: '这次检查没有通过；没有创建、删除、移动或改名任何文件。' }
  return { tone: 'blocked', title: '无法自动识别', detail: '没有可靠作品身份时，系统不会把原始任务名当成影片名，也不会自动处理。' }
}

async function refresh() {
  if (typeof props.api?.get !== 'function') { notice.value = '当前 MoviePilot 未提供插件数据接口'; return }
  loading.value = true
  try {
    const [packages, nextPlans] = await Promise.all([props.api.get(`plugin/${props.pluginId}/packages`), props.api.get(`plugin/${props.pluginId}/plans`)])
    result.value = packages?.data ?? packages ?? { items: [], summary: {} }
    plans.value = (nextPlans?.data ?? nextPlans ?? {}).items || []
    notice.value = ''
  } catch (cause) { notice.value = cause?.message || '暂时无法读取检查结果' }
  finally { loading.value = false }
}

async function auditAll() {
  if (typeof props.api?.post !== 'function') { notice.value = '当前 MoviePilot 未提供检查接口'; return }
  loading.value = true
  notice.value = ''
  try {
    const response = await props.api.post(`plugin/${props.pluginId}/audit`)
    const data = response?.data ?? response
    await refresh()
    notice.value = data?.ok ? '检查完成：没有改动影片文件、下载器或现有整理规则。' : '检查没有完成，未改动任何文件。'
  } catch (cause) { notice.value = cause?.message || '检查没有完成，未改动任何文件。' }
  finally { loading.value = false }
}

function openIssue(card) { selected.value = card; previewResult.value = null }
function closeIssue() { selected.value = null; previewResult.value = null }
async function preparePlan(card) {
  if (!card?.history_id || typeof props.api?.post !== 'function') return
  loading.value = true
  try {
    const response = await props.api.post(`plugin/${props.pluginId}/packages/${card.history_id}/preview`)
    const data = response?.data ?? response
    await refresh()
    previewResult.value = data?.ok
      ? { tone: 'ready', title: '处理方案已准备好', detail: '系统只准备了创建硬链接的方案；请确认作品和结论后再执行。' }
      : { tone: 'blocked', title: '现在不能安全处理', detail: '没有生成处理方案，也没有改动任何文件。' }
  } catch (cause) { previewResult.value = { tone: 'blocked', title: '检查没有完成', detail: cause?.message || '没有生成处理方案，也没有改动任何文件。' } }
  finally { loading.value = false }
}
function requestRepair(plan) { pendingRepair.value = plan }
async function repair() {
  const plan = pendingRepair.value
  if (!plan || typeof props.api?.post !== 'function') return
  loading.value = true
  try {
    const response = await props.api.post(`plugin/${props.pluginId}/plans/${plan.plan_id}/repair`)
    const data = response?.data ?? response
    await refresh()
    notice.value = data?.ok ? '已创建硬链接；原文件、下载器和既有整理规则没有改动。' : '没有完成硬链接创建；原文件没有被删除或移动。'
    if (data?.ok) toast?.success?.('已完成硬链接创建')
  } catch (cause) { notice.value = cause?.message || '没有完成硬链接创建；原文件没有被删除或移动。' }
  finally { loading.value = false; pendingRepair.value = null }
}
onMounted(refresh)
</script>

<template>
  <main class="governor-page">
    <header class="page-header">
      <div><h1>整理检查</h1><p>一次核查所有历史异常。检查只读取记录、识别作品并模拟硬链接，不会改动文件。</p></div>
      <button class="secondary" :disabled="loading" @click="refresh">{{ loading ? '正在更新…' : '更新页面' }}</button>
    </header>
    <p v-if="notice" class="notice" role="status">{{ notice }}</p>
    <section v-if="!hasChecked" class="start-panel" aria-label="开始整理检查">
      <div class="start-copy"><h2>{{ summary.total ? `有 ${summary.total} 条历史记录等待检查` : '还没有需要检查的历史记录' }}</h2><p>{{ summary.total ? '先让系统逐条查明影片、年份和当前能否安全处理；只有检查后仍有问题的记录才会显示出来。' : 'MoviePilot 尚未提供需要处理的失败记录。' }}</p></div>
      <button v-if="summary.total" class="primary primary-large" :disabled="loading" @click="auditAll">{{ loading ? '正在检查全部记录…' : '一键检查全部（不改文件）' }}</button>
    </section>
    <section v-else class="result-panel" aria-label="检查结果">
      <div class="result-heading"><div><h2>{{ completed ? '检查完成' : '检查尚未完成' }}</h2><p>已检查 {{ summary.checked || 0 }} / {{ summary.total || 0 }} 条历史记录。只显示仍需你决定的项目。</p></div><button v-if="!completed" class="primary" :disabled="loading" @click="auditAll">继续检查</button></div>
      <div class="overview" aria-label="检查结果概览"><article><strong>{{ summary.actionable || 0 }}</strong><span>可以处理</span></article><article><strong>{{ summary.needs_attention || 0 }}</strong><span>需要你查看</span></article><article><strong>{{ summary.pending || 0 }}</strong><span>尚未检查</span></article></div>
      <div v-if="!cards.length" class="empty"><h3>目前没有需要处理的记录</h3><p>已检查的历史异常没有发现需要你继续处理的问题。</p></div>
      <div v-else class="issues"><article v-for="card in cards" :key="card.history_id" class="issue-card"><div class="issue-copy"><span class="issue-type">{{ guideFor(card).label }}</span><h3>{{ titleFor(card) }}</h3><p>{{ guideFor(card).detail }}</p></div><button class="primary" @click="openIssue(card)">查看结论</button></article></div>
    </section>
    <div v-if="selected" class="modal-backdrop" @click.self="closeIssue"><section class="modal" role="dialog" aria-modal="true" aria-label="整理检查结论"><header class="modal-header"><div><span class="modal-label">检查结论</span><h2>{{ titleFor(selected) }}</h2></div><button class="icon-button" aria-label="关闭" @click="closeIssue">×</button></header><section class="modal-section"><h3>{{ latestCheck(selected).title }}</h3><p>{{ latestCheck(selected).detail }}</p></section><section v-if="selected.status === 'ready_to_plan'" class="modal-section"><h3>下一步</h3><p>先生成一份即时处理方案。它仍然不会改文件；只有你在下一步确认后才会创建硬链接。</p><button v-if="!planFor(selected)" class="primary wide" :disabled="loading" @click="preparePlan(selected)">{{ loading ? '正在准备方案…' : '生成处理方案（不改文件）' }}</button><button v-else class="primary wide" :disabled="loading" @click="requestRepair(planFor(selected))">确认创建硬链接</button></section><details v-if="selected.status !== 'ready_to_plan'" class="manual-guide"><summary>仍无法处理？查看人工步骤</summary><ol><li>在 MoviePilot 的搜索页确认作品、年份和类型。</li><li>在整理或历史记录中确认它是否已经入库；已入库就不需要处理。</li><li>确认仍未入库后，修正可识别的名称，再重新执行“一键检查全部”。</li></ol></details></section></div>
    <div v-if="pendingRepair" class="modal-backdrop" @click.self="pendingRepair = null"><section class="modal confirm" role="dialog" aria-modal="true" aria-label="确认创建硬链接"><h2>确认创建硬链接？</h2><p>系统只会为这一个已检查通过的项目创建硬链接。</p><ul><li>不会删除、移动、改名或覆盖原文件</li><li>不会修改下载器、代理或既有整理规则</li><li>完成后会回到此页面显示结果</li></ul><div class="actions"><button class="secondary" :disabled="loading" @click="pendingRepair = null">返回</button><button class="primary" :disabled="loading" @click="repair">确认创建</button></div></section></div>
  </main>
</template>

<style scoped>
.governor-page{min-height:100%;box-sizing:border-box;padding:44px;max-width:1180px;margin:0 auto;color:rgb(var(--v-theme-on-background,232,231,241));background:rgb(var(--v-theme-background,16,16,24))}.page-header,.modal-header,.result-heading{display:flex;justify-content:space-between;gap:24px;align-items:flex-start}.page-header{margin-bottom:32px}.page-header h1{margin:0;font-size:38px;line-height:1.2}.page-header p,.result-heading p,.start-copy p{max-width:700px;margin:10px 0 0;color:rgba(var(--v-theme-on-surface,232,231,241),.72);font-size:18px;line-height:1.65}.primary,.secondary{border:0;border-radius:12px;padding:12px 18px;font-size:16px;font-weight:750;cursor:pointer}.primary{background:rgb(var(--v-theme-primary,139,92,246));color:#fff}.secondary{background:rgba(var(--v-theme-on-surface,232,231,241),.09);color:rgb(var(--v-theme-on-surface,232,231,241))}.primary:disabled,.secondary:disabled{opacity:.55;cursor:default}.notice{margin:0 0 22px;padding:15px 18px;border-radius:12px;background:rgba(251,140,0,.16);font-size:16px;line-height:1.5}.start-panel,.result-panel,.modal,.issue-card{border:1px solid rgba(var(--v-border-color,232,231,241),.16);background:rgba(var(--v-theme-surface,23,23,34),.9);border-radius:18px}.start-panel{padding:38px;display:flex;align-items:center;justify-content:space-between;gap:32px}.start-copy h2,.result-heading h2{margin:0;font-size:29px;line-height:1.3}.primary-large{flex:0 0 auto;padding:16px 22px;font-size:18px}.result-panel{padding:30px}.overview{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:28px 0}.overview article{padding:20px;border-radius:14px;background:rgba(255,255,255,.045)}.overview strong{display:block;font-size:34px;line-height:1.05}.overview span{display:block;margin-top:8px;color:rgba(var(--v-theme-on-surface,232,231,241),.72);font-size:16px}.issues{display:grid;gap:14px}.issue-card{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:26px}.issue-copy{min-width:0}.issue-type,.modal-label{display:inline-block;margin-bottom:10px;color:rgb(var(--v-theme-primary,139,92,246));font-size:16px;font-weight:750}.issue-copy h3{margin:0;font-size:25px;line-height:1.35}.issue-copy p{margin:9px 0 0;color:rgba(var(--v-theme-on-surface,232,231,241),.86);font-size:17px;line-height:1.6}.empty{padding:46px 18px;text-align:center}.empty h3{margin:0;font-size:24px}.empty p{margin:10px 0 0;color:rgba(var(--v-theme-on-surface,232,231,241),.72);font-size:17px}.modal-backdrop{position:fixed;inset:0;z-index:20;display:grid;place-items:center;padding:24px;background:rgba(0,0,0,.58)}.modal{width:min(100%,780px);max-height:calc(100vh - 48px);overflow:auto;padding:34px}.modal h2{margin:4px 0 0;font-size:32px;line-height:1.3}.modal h3{margin:0;font-size:23px;line-height:1.4}.icon-button{border:0;background:transparent;color:rgb(var(--v-theme-on-surface,232,231,241));font-size:36px;line-height:1;cursor:pointer}.modal-section,.manual-guide{padding-top:24px;margin-top:24px;border-top:1px solid rgba(var(--v-border-color,232,231,241),.14)}.modal-section p,.manual-guide li{font-size:18px;line-height:1.7;color:rgba(var(--v-theme-on-surface,232,231,241),.9)}.wide{width:100%;margin-top:18px;padding:15px 18px;font-size:17px}.manual-guide summary{cursor:pointer;font-size:18px;font-weight:750}.manual-guide ol{padding-left:26px;margin:16px 0 0}.confirm{width:min(100%,560px)}.confirm>p,.confirm li{font-size:18px;line-height:1.65}.actions{display:flex;justify-content:flex-end;gap:12px;margin-top:26px}@media(max-width:760px){.governor-page{padding:24px 18px}.page-header,.result-heading,.start-panel,.issue-card{flex-direction:column;align-items:stretch}.page-header h1{font-size:32px}.page-header p,.result-heading p,.start-copy p{font-size:17px}.start-panel,.result-panel{padding:25px}.overview{grid-template-columns:1fr}.issue-card{padding:22px}.issue-copy h3{font-size:22px}.modal{padding:25px}.modal h2{font-size:27px}.modal h3{font-size:21px}.modal-section p,.manual-guide li{font-size:17px}}
</style>
