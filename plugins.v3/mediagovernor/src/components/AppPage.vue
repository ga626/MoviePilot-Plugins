<script setup>
import { computed, inject, onMounted, ref } from 'vue'

const props = defineProps({ api: { type: Object, default: () => ({}) }, pluginId: { type: String, default: 'MediaGovernor' } })
const toast = inject('moviepilot:toast', null)
const loading = ref(false)
const error = ref('')
const result = ref({ items: [], summary: {} })
const plans = ref([])
const statuses = {
  verified: ['已验证', '记录彼此一致，尚未发现可证明的问题。'],
  needs_attention: ['需要处理', '原生记录失败或出现可证明的不一致。'],
  needs_selection: ['需要选择', '记录存在身份冲突，插件不会替你猜测。'],
  awaiting_host_information: ['等待宿主信息', 'MoviePilot 未提供足够公开字段，插件不会猜测。'],
}
const cards = computed(() => result.value.items || [])
const previewDetails = {
  preview_ready: '可以继续：MoviePilot 已生成硬链接预演计划，但本插件不会执行写入。',
  preview_rejected: '暂不能继续：MoviePilot 未能为这条记录生成安全的硬链接预演。请保留该问题，等待更多宿主信息或在原生整理页面核对。',
  history_fileitem_unavailable: '暂不能继续：原始失败记录没有提供可用于预演的文件信息。',
  history_not_previewable: '暂不能继续：这条历史记录已不适合再次预演。',
  history_not_in_failure_queue: '暂不能继续：这条记录不在当前失败问题队列中。',
  plugin_disabled: '暂不能继续：媒体治理当前未启用。',
}
function describePreview(detail) { return previewDetails[detail] || '暂不能继续：MoviePilot 没有返回可安全执行的预演结果。' }
async function refresh() {
  if (typeof props.api?.get !== 'function') { error.value = '当前 MoviePilot 未提供插件数据接口'; return }
  loading.value = true; error.value = ''
  try {
    const [packages, nextPlans] = await Promise.all([
      props.api.get(`plugin/${props.pluginId}/packages`),
      props.api.get(`plugin/${props.pluginId}/plans`),
    ])
    result.value = packages?.data ?? packages ?? { items: [], summary: {} }
    plans.value = (nextPlans?.data ?? nextPlans ?? {}).items || []
  } catch (cause) { error.value = cause?.message || '读取媒体治理数据失败' }
  finally { loading.value = false }
}
async function preview(card) {
  const historyId = (card.history_ids || [])[0]
  if (!historyId || typeof props.api?.post !== 'function') { error.value = '此问题没有可预演的失败记录'; return }
  loading.value = true; error.value = ''
  try {
    const response = await props.api.post(`plugin/${props.pluginId}/packages/${historyId}/preview`)
    const data = response?.data ?? response
    await refresh()
    if (!data?.ok) { error.value = describePreview(data?.detail); return }
    toast?.success?.('已生成零写入预演计划')
  } catch (cause) { error.value = cause?.message || '生成预演失败' }
  finally { loading.value = false }
}
onMounted(refresh)
</script>

<template>
  <main class="governor-page">
    <header><div><p class="eyebrow">MEDIA GOVERNOR</p><h1>媒体治理</h1><p>核对整理结果，归集问题；所有预演都不会改动文件。</p></div><button :disabled="loading" @click="refresh">{{ loading ? '刷新中…' : '刷新' }}</button></header>
    <p v-if="error" class="notice error">{{ error }}</p>
    <section class="summary" aria-label="问题概览"><article v-for="(count, key) in result.summary || {}" :key="key"><strong>{{ count }}</strong><span>{{ statuses[key]?.[0] || key }}</span></article></section>
    <section class="panel"><h2>问题与结果</h2><p class="muted">“已验证”表示公开记录一致，不代表媒体服务器最终展示已被验证。</p><div v-if="!cards.length" class="empty">还没有可展示的整理记录。启用后，新的整理事件会自动进入这里。</div><article v-for="card in cards" :key="card.package_id" class="card"><div><span class="badge" :class="card.status">{{ statuses[card.status]?.[0] || card.status }}</span><h3>{{ card.title || '未取得媒体身份' }} <small v-if="card.year">({{ card.year }})</small></h3><p>{{ statuses[card.status]?.[1] }}</p><p class="muted">原因：{{ (card.reason_codes || []).join('、') || '公开记录一致' }}</p><p v-if="card.last_preview" class="muted">最近预演：{{ card.last_preview.status === 'ready' ? '可以继续' : '暂不能继续' }}。{{ describePreview(card.last_preview.detail) }}</p></div><button v-if="card.failure_count" :disabled="loading" @click="preview(card)">查看硬链接预演</button></article></section>
    <section v-if="plans.length" class="panel"><h2>预演计划</h2><p class="muted">计划只证明预演可以继续；它不会创建、移动、改名、覆盖或删除任何文件。</p><article v-for="plan in plans" :key="plan.plan_id" class="plan"><strong>{{ plan.status === 'ready' ? '预演已准备好' : '预演已过期' }}</strong><span>方式：{{ plan.transfer_type }} · {{ plan.detail }}</span></article></section>
  </main>
</template>

<style scoped>
.governor-page{min-height:100%;padding:32px;color:rgb(var(--v-theme-on-background,232,231,241));background:rgb(var(--v-theme-background,16,16,24));box-sizing:border-box}.governor-page header{display:flex;justify-content:space-between;gap:20px;align-items:start;margin-bottom:24px}.eyebrow{letter-spacing:.14em;color:rgb(var(--v-theme-primary,139,92,246));font-size:12px;font-weight:700}h1{margin:6px 0;font-size:32px}h2{margin:0 0 6px}h3{margin:10px 0 6px}p{color:rgba(var(--v-theme-on-surface,232,231,241),.72)}button{border:0;border-radius:9px;padding:9px 13px;background:rgb(var(--v-theme-primary,139,92,246));color:white;font-weight:650;cursor:pointer}button:disabled{opacity:.55;cursor:default}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px}.summary article,.panel,.card,.plan{border:1px solid rgba(var(--v-border-color,232,231,241),.14);background:rgba(var(--v-theme-surface,23,23,34),.8);border-radius:14px}.summary article{padding:16px}.summary strong{font-size:25px;display:block}.summary span,.muted,small{font-size:12px;color:rgba(var(--v-theme-on-surface,232,231,241),.62)}.panel{padding:18px;margin-bottom:18px}.card{padding:15px;margin-top:12px;display:flex;align-items:center;justify-content:space-between;gap:16px}.card p{margin:5px 0}.badge{display:inline-block;border-radius:999px;padding:4px 8px;font-size:12px;background:rgba(255,255,255,.09)}.needs_attention{background:rgba(244,67,54,.2)}.needs_selection,.awaiting_host_information{background:rgba(251,140,0,.2)}.verified{background:rgba(76,175,80,.2)}.plan{padding:12px;margin-top:10px}.plan strong{font-size:14px}.plan span{display:block;margin-top:5px;font-size:12px}.notice{padding:10px 12px;border-radius:9px}.error{background:rgba(244,67,54,.18)}.empty{padding:16px 0;color:rgba(var(--v-theme-on-surface,232,231,241),.62)}@media(max-width:760px){.governor-page{padding:18px}.summary{grid-template-columns:repeat(2,1fr)}.governor-page header,.card{flex-direction:column;align-items:stretch}}
</style>
