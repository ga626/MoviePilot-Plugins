<script setup>
import { computed, inject, onMounted, ref } from 'vue'

const props = defineProps({ api: { type: Object, default: () => ({}) }, pluginId: { type: String, default: 'MediaGovernor' } })
const toast = inject('moviepilot:toast', null)
const loading = ref(false)
const notice = ref('')
const result = ref({ items: [], summary: {} })
const plans = ref([])
const selected = ref(null)
const previewResult = ref(null)
const pendingRepair = ref(null)
const cards = computed(() => result.value.items || [])
const issueCards = computed(() => cards.value.filter(card => card.status !== 'verified'))
const verifiedCards = computed(() => cards.value.filter(card => card.status === 'verified'))
const activeCount = computed(() => issueCards.value.length)

const typeGuide = {
  transfer_failed: { label: '整理没有完成', detail: 'MoviePilot 曾记录这次整理没有完成。先做一次模拟检查，确认现在是否还可以安全处理。' },
  unexpected_transfer_mode: { label: '整理方式不符合预期', detail: '这次整理使用的方式和硬链接规则不一致，需要先核对。' },
  identity_conflict: { label: '作品信息有冲突', detail: '同一条记录出现了不同作品信息，程序不会替你猜测正确答案。' },
  missing_media_identity: { label: '影片尚未识别', detail: '历史记录没有可靠的作品身份，不能自动把原始名称当成影片名。' },
  missing_transfer_mode: { label: '缺少整理信息', detail: 'MoviePilot 没有提供足够的整理信息，当前不能安全自动处理。' },
}
const fallbackGuide = { label: '需要人工核对', detail: '这条记录需要先核对，程序不会猜测或直接改动文件。' }

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
  loading.value = true
  try {
    const [packages, nextPlans] = await Promise.all([props.api.get(`plugin/${props.pluginId}/packages`), props.api.get(`plugin/${props.pluginId}/plans`)])
    result.value = packages?.data ?? packages ?? { items: [], summary: {} }
    plans.value = (nextPlans?.data ?? nextPlans ?? {}).items || []
    notice.value = ''
  } catch (cause) { notice.value = cause?.message || '暂时无法读取整理问题' }
  finally { loading.value = false }
}
function openIssue(card) { selected.value = card; previewResult.value = null }
function closeIssue() { selected.value = null; previewResult.value = null }
async function checkPlan(card) {
  const historyId = (card.history_ids || [])[0]
  if (!historyId || typeof props.api?.post !== 'function') { previewResult.value = { ok: false, detail: '这条记录没有可用于检查的历史信息。' }; return }
  loading.value = true
  try {
    const response = await props.api.post(`plugin/${props.pluginId}/packages/${historyId}/preview`)
    const data = response?.data ?? response
    await refresh()
    previewResult.value = data?.ok ? { ok: true, detail: '模拟检查通过。系统已生成一份仅创建硬链接的计划，等待你确认。' } : { ok: false, detail: '模拟检查未能生成安全方案。不会改动任何文件，请按人工处理说明核对。' }
  } catch (cause) { previewResult.value = { ok: false, detail: cause?.message || '模拟检查没有完成，未改动任何文件。' } }
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
    notice.value = data?.ok ? '已完成硬链接创建；原文件、下载器和原有整理规则都没有改动。' : '这次没有完成硬链接创建，原文件没有被删除或移动。'
    if (data?.ok) toast?.success?.('已完成硬链接创建')
  } catch (cause) { notice.value = cause?.message || '这次没有完成硬链接创建，原文件没有被删除或移动。' }
  finally { loading.value = false; pendingRepair.value = null }
}
onMounted(refresh)
</script>

<template>
  <main class="governor-page">
    <header class="page-header"><div><h1>整理问题</h1><p>这里列出 MoviePilot 真实记录过的异常。每张卡都需要先核对，再决定是否处理。</p></div><button class="secondary" :disabled="loading" @click="refresh">{{ loading ? '正在更新' : '更新列表' }}</button></header>
    <p v-if="notice" class="notice">{{ notice }}</p>
    <section class="overview" aria-label="问题概览"><article><strong>{{ activeCount }}</strong><span>需要核对</span></article><article><strong>{{ verifiedCards.length }}</strong><span>历史记录一致</span></article><article><strong>{{ issueCards.filter(card => planFor(card)).length }}</strong><span>可确认处理</span></article></section>
    <section class="issues" aria-label="整理问题列表"><div class="section-heading"><h2>待处理问题</h2><p>“待确认影片”表示历史记录没有可靠片名；不会把英文或乱码硬说成中文片名。</p></div><div v-if="!issueCards.length" class="empty">目前没有需要核对的整理记录。</div><article v-for="card in issueCards" :key="card.package_id" class="issue-card"><div class="issue-copy"><span class="issue-type">{{ guideFor(card).label }}</span><h3>{{ titleFor(card) }}</h3><p>{{ guideFor(card).detail }}</p></div><button class="primary" @click="openIssue(card)">查看并核对</button></article></section>
    <details v-if="verifiedCards.length" class="verified-history"><summary>查看历史记录一致的项目（{{ verifiedCards.length }}）</summary><p>这里只表示 MoviePilot 保存的公开记录彼此一致，不表示媒体库最终展示已经人工核对。</p><article v-for="card in verifiedCards" :key="card.package_id" class="issue-card verified"><div class="issue-copy"><span class="issue-type">历史记录一致</span><h3>{{ titleFor(card) }}</h3><p>当前没有发现需要处理的公开记录冲突。</p></div><button class="secondary" @click="openIssue(card)">查看记录</button></article></details>

    <div v-if="selected" class="modal-backdrop" @click.self="closeIssue"><section class="modal" role="dialog" aria-modal="true" aria-label="核对整理问题"><header class="modal-header"><div><p class="modal-label">整理问题核对</p><h2>{{ titleFor(selected) }}</h2><p>{{ guideFor(selected).label }}</p></div><button class="icon-button" aria-label="关闭" @click="closeIssue">×</button></header><section class="modal-section"><h3>这是什么问题？</h3><p>{{ guideFor(selected).detail }}</p><p class="quiet">这条卡来自 MoviePilot 的历史整理记录。它说明当时发生过异常，不代表现在一定还没有入库。</p></section><section class="modal-section"><h3>现在怎么处理？</h3><div class="check-state" :class="latestCheck(selected).tone"><strong>{{ latestCheck(selected).label }}</strong><p>{{ previewResult?.detail || latestCheck(selected).detail }}</p></div><button v-if="selected.failure_count" class="primary wide" :disabled="loading" @click="checkPlan(selected)">{{ loading ? '正在模拟检查' : '模拟检查，不改文件' }}</button><button v-if="planFor(selected)" class="primary wide" :disabled="loading" @click="requestRepair(planFor(selected))">确认创建硬链接</button></section><section class="manual-guide"><h3>暂不能自动处理时怎么办？</h3><ol><li>用下方的原始任务名称到 MoviePilot 的“搜索结果”中核对影片、年份和类型。</li><li>到“整理”或“历史记录”确认它是否已经入库；已经入库就不需要再处理。</li><li>确认仍未入库后，回到这里重新做一次模拟检查。只有检查通过，才会出现确认按钮。</li></ol><p v-if="sourceName(selected)" class="source-name">原始任务名称：{{ sourceName(selected) }}</p></section></section></div>
    <div v-if="pendingRepair" class="modal-backdrop" @click.self="pendingRepair = null"><section class="modal confirm" role="dialog" aria-modal="true" aria-label="确认创建硬链接"><h2>确认创建硬链接？</h2><p>系统只会为已通过模拟检查的这一条记录创建硬链接。</p><ul><li>不会删除、移动、改名或覆盖原文件</li><li>不会修改下载器、代理或既有整理规则</li><li>完成后会回到此页面显示结果</li></ul><div class="actions"><button class="secondary" :disabled="loading" @click="pendingRepair = null">返回核对</button><button class="primary" :disabled="loading" @click="repair">确认创建</button></div></section></div>
  </main>
</template>

<style scoped>
.governor-page{min-height:100%;box-sizing:border-box;padding:36px;color:rgb(var(--v-theme-on-background,232,231,241));background:rgb(var(--v-theme-background,16,16,24))}.page-header,.modal-header{display:flex;justify-content:space-between;gap:24px;align-items:flex-start}.page-header{margin-bottom:28px}.page-header h1{margin:0;font-size:34px;line-height:1.2}.page-header p,.section-heading p,.quiet,.verified-history>p{margin:8px 0 0;color:rgba(var(--v-theme-on-surface,232,231,241),.68);font-size:15px;line-height:1.65}.primary,.secondary{border:0;border-radius:10px;padding:11px 16px;font-size:15px;font-weight:700;cursor:pointer}.primary{background:rgb(var(--v-theme-primary,139,92,246));color:#fff}.secondary{background:rgba(var(--v-theme-on-surface,232,231,241),.09);color:rgb(var(--v-theme-on-surface,232,231,241))}.primary:disabled,.secondary:disabled{opacity:.55;cursor:default}.overview{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:30px}.overview article,.issue-card,.modal{border:1px solid rgba(var(--v-border-color,232,231,241),.16);background:rgba(var(--v-theme-surface,23,23,34),.88);border-radius:16px}.overview article{padding:18px}.overview strong{display:block;font-size:30px;line-height:1.1}.overview span{display:block;margin-top:7px;color:rgba(var(--v-theme-on-surface,232,231,241),.68);font-size:15px}.section-heading h2{margin:0;font-size:24px}.issues{max-width:980px}.issue-card{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:24px;margin-top:14px}.issue-card.verified{opacity:.78}.issue-copy{min-width:0}.issue-type,.modal-label{display:inline-block;margin-bottom:10px;color:rgb(var(--v-theme-primary,139,92,246));font-size:15px;font-weight:750}.issue-copy h3{margin:0;font-size:23px;line-height:1.35}.issue-copy p{margin:9px 0 0;font-size:16px;line-height:1.6;color:rgba(var(--v-theme-on-surface,232,231,241),.86)}.issue-copy .quiet{font-size:14px}.notice{margin:0 0 20px;padding:13px 15px;border-radius:10px;background:rgba(251,140,0,.16);color:rgb(var(--v-theme-on-surface,232,231,241));font-size:15px}.empty{padding:36px 0;color:rgba(var(--v-theme-on-surface,232,231,241),.65);font-size:16px}.verified-history{max-width:980px;margin-top:32px}.verified-history summary{cursor:pointer;font-size:16px;font-weight:700;color:rgba(var(--v-theme-on-surface,232,231,241),.86)}.modal-backdrop{position:fixed;inset:0;z-index:20;display:grid;place-items:center;padding:20px;background:rgba(0,0,0,.5)}.modal{width:min(100%,720px);max-height:calc(100vh - 40px);overflow:auto;padding:28px}.modal h2{margin:0;font-size:28px}.modal h3{margin:0 0 8px;font-size:19px}.modal-header>div>p:last-child{margin:8px 0 0;color:rgba(var(--v-theme-on-surface,232,231,241),.72);font-size:16px}.icon-button{border:0;background:transparent;color:rgb(var(--v-theme-on-surface,232,231,241));font-size:32px;line-height:1;cursor:pointer}.modal-section,.manual-guide{padding-top:22px;margin-top:22px;border-top:1px solid rgba(var(--v-border-color,232,231,241),.14)}.modal-section p,.manual-guide p,.manual-guide li{font-size:16px;line-height:1.65;color:rgba(var(--v-theme-on-surface,232,231,241),.86)}.check-state{margin:12px 0;padding:14px 16px;border-radius:12px}.check-state strong{font-size:17px}.check-state p{margin:5px 0 0}.neutral{background:rgba(33,150,243,.14)}.ready{background:rgba(76,175,80,.16)}.blocked{background:rgba(251,140,0,.16)}.wide{width:100%;margin-top:10px}.manual-guide ol{margin:10px 0;padding-left:24px}.source-name{padding:11px 13px;border-radius:9px;background:rgba(255,255,255,.06);word-break:break-word}.confirm{width:min(100%,520px)}.confirm>p,.confirm li{font-size:16px;line-height:1.6}.actions{display:flex;justify-content:flex-end;gap:10px;margin-top:24px}@media(max-width:760px){.governor-page{padding:22px}.page-header,.issue-card{flex-direction:column;align-items:stretch}.overview{grid-template-columns:1fr}.issue-card{padding:20px}.page-header h1{font-size:30px}.modal{padding:22px}.modal h2{font-size:24px}}
</style>
