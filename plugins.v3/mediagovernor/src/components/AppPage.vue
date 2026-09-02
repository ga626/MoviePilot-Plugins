<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'

const props = defineProps({ api: { type: Object, default: () => ({}) }, pluginId: { type: String, default: 'MediaGovernor' } })
const loading = ref(false)
const notice = ref('')
const result = ref({ items: [], summary: { state: 'idle', total: 0, checked: 0, pending: 0 } })
const plans = ref([])
const selected = ref(null)
const pendingGroupRepair = ref(null)
const directories = ref([])
const selectedDirectory = ref(null)
const directoryNotice = ref('')
const stopRequested = ref(false)
const cards = computed(() => result.value.items || [])
const summary = computed(() => result.value.summary || {})
const completed = computed(() => summary.value.state === 'complete')
const running = computed(() => summary.value.state === 'running')
const discovering = computed(() => summary.value.state === 'discovering')
const paused = computed(() => summary.value.state === 'paused')
const scopeChanged = computed(() => Boolean(summary.value.scope_changed))
const stale = computed(() => summary.value.state === 'stale')
const batchSize = 25
const displayedTotal = computed(() => stale.value ? (summary.value.run_total || 0) : (summary.value.total || 0))
const displayedChecked = computed(() => stale.value ? (summary.value.run_checked || 0) : (summary.value.checked || 0))
const progress = computed(() => displayedTotal.value ? Math.round(displayedChecked.value * 100 / displayedTotal.value) : 0)

function titleFor(card) {
  if (!card?.title) return '作品信息不足，无法合并展示'
  return `${card.title}${card.year ? `（${card.year}）` : ''}`
}

async function refresh(showSpinner = true) {
  if (typeof props.api?.get !== 'function') { notice.value = '当前 MoviePilot 未提供插件数据接口'; return }
  if (showSpinner) loading.value = true
  try {
    const [packages, nextPlans] = await Promise.all([props.api.get(`plugin/${props.pluginId}/packages`), props.api.get(`plugin/${props.pluginId}/plans`)])
    result.value = packages?.data ?? packages ?? { items: [], summary: {} }
    plans.value = (nextPlans?.data ?? nextPlans ?? {}).items || []
    notice.value = ''
  } catch (cause) { notice.value = cause?.message || '暂时无法读取检查结果' }
  finally { if (showSpinner) loading.value = false }
}

async function auditAll() {
  if (typeof props.api?.post !== 'function') { notice.value = '当前 MoviePilot 未提供检查接口'; return }
  loading.value = true
  notice.value = ''
  try {
    stopRequested.value = false
    const response = await props.api.post(`plugin/${props.pluginId}/audit`)
    const data = response?.data ?? response
    await refresh(false)
    if (!data?.ok) { notice.value = '新一轮检查没有开始，未改动任何文件。'; return }
    loading.value = false
    await runNextItems()
  } catch (cause) { notice.value = cause?.message || '本轮检查没有完成，未改动任何文件。' }
  finally { loading.value = false }
}

async function resumeAudit() {
  if (typeof props.api?.post !== 'function') { notice.value = '当前 MoviePilot 未提供检查接口'; return }
  loading.value = true
  notice.value = ''
  try {
    stopRequested.value = false
    const response = await props.api.post(`plugin/${props.pluginId}/audit/resume`)
    const data = response?.data ?? response
    await refresh(false)
    if (!data?.ok) { notice.value = '没有可继续的本轮检查。你可以直接开始一次新的检查。'; return }
    loading.value = false
    await runNextItems()
  } catch (cause) { notice.value = cause?.message || '继续检查没有完成，未改动任何文件。' }
  finally { loading.value = false }
}

async function runNextItems() {
  while (!stopRequested.value && (summary.value.state === 'running' || discovering.value)) {
    await props.api.post(`plugin/${props.pluginId}/audit/batch`, { limit: batchSize })
    await refresh(false)
    await nextTick()
  }
  if (summary.value.state === 'complete') notice.value = '本轮检查完成。你可以随时点击“再次检查全部”开始新一轮；期间没有改动影片文件、下载器或既有整理规则。'
  else if (summary.value.state === 'stale') notice.value = '历史记录范围发生了变化；上一轮结果仍被保留，但不能代表当前全部记录。开始新一轮检查后才会重新核对全部。'
  else if (summary.value.state === 'paused') notice.value = '检查已暂停。进度已保存，稍后点击“继续检查”会从下一条开始。'
}

async function pauseAudit() {
  if (typeof props.api?.post !== 'function') return
  stopRequested.value = true
  await props.api.post(`plugin/${props.pluginId}/audit/pause`)
  await refresh(false)
  notice.value = '检查已暂停。已完成的结论已保存，未开始的记录不会丢失。'
}

function directoryKey(directory) {
  return directory ? `${directory.library_storage}\u0000${directory.library_path}\u0000${directory.name}` : ''
}

async function loadDirectories({ preserveSelection = false } = {}) {
  const previousKey = preserveSelection ? directoryKey(selectedDirectory.value) : ''
  directories.value = []
  if (!preserveSelection) selectedDirectory.value = null
  directoryNotice.value = ''
  try {
    const response = await props.api.get('storage/directories?directory_type=library', { feedback: 'silent' })
    const payload = response?.data ?? response
    const data = payload?.data ?? payload
    directories.value = Array.isArray(data) ? data.filter(item => item?.name && item?.library_path && item?.library_storage) : []
    if (previousKey) selectedDirectory.value = directories.value.find(item => directoryKey(item) === previousKey) || null
    if (previousKey && !selectedDirectory.value) directoryNotice.value = '所选目录已经在 MoviePilot 当前设置中变化或被删除；请重新选择后再生成方案。'
    if (!directories.value.length) directoryNotice.value = 'MoviePilot 当前没有返回可选择的媒体库目录；仍可按当前原生规则生成方案。'
  } catch {
    directoryNotice.value = '暂时无法读取 MoviePilot 当前目录设置；不会使用固定目录替代。'
  }
}

function openIssue(card) { selected.value = card; loadDirectories() }
function closeIssue() { selected.value = null; selectedDirectory.value = null }

function targetPayload() {
  const target = selectedDirectory.value
  return target ? { storage: target.library_storage, path: target.library_path, name: target.name } : {}
}

function readyPlansFor(card) {
  const ids = new Set(card?.repairable_history_ids || [])
  return plans.value.filter(plan => ids.has(plan.history_id) && plan.status === 'ready')
}

async function prepareGroupPlans(card) {
  const historyIds = card?.repairable_history_ids || []
  if (!historyIds.length || typeof props.api?.post !== 'function') return
  loading.value = true
  notice.value = ''
  try {
    let ready = 0
    for (const historyId of historyIds) {
      const response = await props.api.post(`plugin/${props.pluginId}/packages/${historyId}/preview`, targetPayload())
      const data = response?.data ?? response
      if (data?.ok && data?.plan?.status === 'ready') ready += 1
    }
    await refresh(false)
    notice.value = ready ? `已为“${titleFor(card)}”准备 ${ready} 条零写入修复方案；请先查看后再确认创建硬链接。` : '没有生成可安全执行的修复方案；检查没有改动任何文件。'
  } catch (cause) { notice.value = cause?.message || '生成修复方案没有完成；没有改动任何文件。' }
  finally { loading.value = false }
}

async function repairGroup() {
  const card = pendingGroupRepair.value
  const readyPlans = readyPlansFor(card)
  if (!readyPlans.length || typeof props.api?.post !== 'function') { pendingGroupRepair.value = null; return }
  loading.value = true
  try {
    if (selectedDirectory.value) {
      await loadDirectories({ preserveSelection: true })
      if (!selectedDirectory.value) {
        pendingGroupRepair.value = null
        notice.value = '目标目录已经变化。为避免把作品放到旧位置，请重新选择目录并生成新的方案。'
        return
      }
    }
    let completedCount = 0
    for (const plan of readyPlans) {
      const response = await props.api.post(`plugin/${props.pluginId}/plans/${plan.plan_id}/repair`, targetPayload())
      const data = response?.data ?? response
      if (data?.ok) completedCount += 1
    }
    await refresh(false)
    notice.value = completedCount === readyPlans.length
      ? `已为“${titleFor(card)}”创建 ${completedCount} 条硬链接；原文件没有被删除、移动或改名。`
      : `已创建 ${completedCount} / ${readyPlans.length} 条硬链接；其余项目没有被删除、移动或覆盖。`
  } catch (cause) { notice.value = cause?.message || '批量创建没有完成；未完成项目的原文件没有被删除、移动或覆盖。' }
  finally { loading.value = false; pendingGroupRepair.value = null }
}
onMounted(refresh)
</script>

<template>
  <main class="governor-page">
    <header class="page-header">
      <div><h1>整理质量检查</h1><p>按作品核对 MoviePilot 整理历史，只列出有证据需要处理的作品。检查本身不会移动、删除、改名或创建文件。</p></div>
      <button class="secondary" :disabled="loading" @click="refresh">{{ loading ? '正在读取…' : '更新进度' }}</button>
    </header>
    <p v-if="notice" class="notice" role="status">{{ notice }}</p>
    <section class="result-panel" aria-label="检查结果">
      <div class="result-heading"><div><h2>{{ stale ? '检查范围已变化' : (discovering ? '正在读取整理历史' : (completed ? '本轮检查完成' : (running ? '正在检查' : (paused ? '检查已暂停' : '准备开始检查')))) }}</h2><p v-if="stale">上一轮已检查 {{ displayedChecked }} / {{ displayedTotal }} 条；当前共有 {{ summary.total || 0 }} 条历史记录。上次结论不会丢失，但新增或变动的记录尚未检查。</p><p v-else-if="discovering">正在分批读取 MoviePilot 已记录的整理历史，已发现 {{ summary.discovered || 0 }} 条。读取完成后才会开始检查文件，不会把旧结果冒充为全库结论。</p><p v-else>已检查 {{ displayedChecked }} / {{ displayedTotal }} 条历史记录。暂停后可以继续；完成后可以随时重新检查全部记录。</p></div><div class="header-actions"><button v-if="running || discovering" class="secondary" :disabled="loading" @click="pauseAudit">暂停检查</button><button v-else-if="paused && !scopeChanged" class="primary" :disabled="loading" @click="resumeAudit">继续本轮检查</button><button v-else class="primary" :disabled="loading" @click="auditAll">{{ stale ? '重新检查全部' : (completed ? '再次检查全部' : '开始检查全部') }}</button></div></div>
      <div class="progress-wrap" aria-label="检查进度"><div class="progress-copy"><strong v-if="discovering">读取中</strong><strong v-else>{{ progress }}%</strong><span v-if="stale">这是上一轮进度；当前范围已变化</span><span v-else-if="discovering">已发现 {{ summary.discovered || 0 }} 条历史记录</span><span v-else-if="running">正在核对第 {{ (summary.checked || 0) + 1 }} 条</span><span v-else-if="completed">本轮已完成，可随时再次检查</span><span v-else>本轮进度已保存</span></div><div v-if="!discovering" class="progress-track"><div class="progress-bar" :style="{ width: `${progress}%` }"></div></div></div>
      <p v-if="stale" class="notice">下面是上一轮已完成部分的结论，仅供参考；在重新检查全部前，不能把它当作当前媒体库的完整结论。</p>
      <div class="overview" aria-label="检查结果概览"><article><strong>{{ cards.length }}</strong><span>部作品需要处理</span></article><article><strong>{{ summary.actionable || 0 }}</strong><span>可安全补建</span></article><article><strong>{{ summary.needs_attention || 0 }}</strong><span>暂不能自动处理</span></article><article><strong>{{ summary.history_info || 0 }}</strong><span>历史资料说明</span></article></div>
      <section v-if="summary.history_info" class="unresolved"><h3>{{ summary.history_info }} 条历史资料不完整或记录了非硬链接方式</h3><p>这不是影片异常，也不会出现在待处理作品里。已读取到源和目标的记录会进一步核对文件集合；没有足够文件证据时不会把历史说成当前故障。</p></section>
      <section v-if="summary.unresolved" class="unresolved"><h3>{{ summary.unresolved }} 条失败记录没有查到可靠作品身份</h3><p>没有足够证据确认片名时，系统不会猜测，也不会把它伪装成可修复的影片问题。</p></section>
      <div v-if="!cards.length" class="empty"><h3>本轮没有发现已确认需要处理的作品</h3><p>历史资料说明不代表影片有问题。之后可以随时再次检查。</p></div>
      <div v-else class="issues"><article v-for="card in cards" :key="card.group_id" class="issue-card"><div class="issue-copy"><span class="issue-type">涉及 {{ card.record_count }} 条整理记录</span><h3>{{ titleFor(card) }}</h3><ul class="finding-list"><li v-for="finding in card.findings" :key="`${finding.status}-${finding.transfer_mode || 'none'}`"><strong>{{ finding.count }} 条：</strong>{{ finding.title }}</li></ul></div><button class="primary" @click="openIssue(card)">查看详细结论</button></article></div>
    </section>
    <div v-if="selected" class="modal-backdrop" @click.self="closeIssue"><section class="modal" role="dialog" aria-modal="true" aria-label="整理检查结论"><header class="modal-header"><div><span class="modal-label">检查结论</span><h2>{{ titleFor(selected) }}</h2></div><button class="icon-button" aria-label="关闭" @click="closeIssue">×</button></header><section class="modal-section"><h3>这部作品的 {{ selected.record_count }} 条整理记录</h3><p>这里按影片合并展示。下面每项都有当前文件或历史证据；不能证明的内容不会被说成影片故障。</p><p v-if="selected.file_summary" class="evidence-copy">源包：{{ selected.file_summary.source_video_count || 0 }} 个视频、{{ selected.file_summary.source_subtitle_count || 0 }} 个字幕；目标：{{ selected.file_summary.target_video_count || 0 }} 个视频、{{ selected.file_summary.target_subtitle_count || 0 }} 个字幕。</p></section><section v-for="finding in selected.findings" :key="`${finding.status}-${finding.transfer_mode || 'none'}`" class="modal-section"><h3>{{ finding.title }}（{{ finding.count }} 条）</h3><p>{{ finding.detail }}</p></section><section v-if="selected.repairable_count" class="modal-section"><h3>生成方案（不会改文件）</h3><p>可以按 MoviePilot 当前规则生成方案，也可以在下面从它当前的媒体库目录中选择一个目标。目录列表每次打开时都重新读取，不会写死为几个文件夹。</p><label v-if="directories.length" class="directory-picker"><span>目标目录（可选）</span><select v-model="selectedDirectory"><option :value="null">让 MoviePilot 按当前规则选择</option><option v-for="directory in directories" :key="`${directory.library_storage}-${directory.library_path}`" :value="directory">{{ directory.name }}{{ directory.media_type ? ` · ${directory.media_type}` : '' }}{{ directory.media_category ? ` · ${directory.media_category}` : '' }}</option></select></label><p v-if="directoryNotice" class="evidence-copy">{{ directoryNotice }}</p><button v-if="!readyPlansFor(selected).length" class="primary wide" :disabled="loading" @click="prepareGroupPlans(selected)">{{ loading ? '正在生成方案…' : '生成整理方案（不改文件）' }}</button><button v-else class="primary wide" :disabled="loading" @click="pendingGroupRepair = selected">确认重新整理 {{ readyPlansFor(selected).length }} 条记录</button></section><details class="manual-guide"><summary>为什么这里不能直接一键修复所有项目？</summary><ol><li>“历史记录显示为复制/移动”只说明当时的记录方式，不等于实际文件现在不存在或损坏。</li><li>创建硬链接会写入媒体库；只有原整理明确失败、或文件集合检查明确发现缺失且补建前检查通过的记录，才适合进入确认后的修复流程。</li><li>目录和目标发生变化后，旧方案会失效并要求重新预演；插件不会用固定目录或猜测覆盖。</li></ol></details></section></div>
    <div v-if="pendingGroupRepair" class="modal-backdrop" @click.self="pendingGroupRepair = null"><section class="modal confirm" role="dialog" aria-modal="true" aria-label="确认批量创建硬链接"><h2>确认修复 {{ readyPlansFor(pendingGroupRepair).length }} 条记录？</h2><p>系统只会为这部作品中已通过补建前检查的记录创建硬链接。</p><ul><li>不会删除、移动、改名或覆盖原文件</li><li>不会修改下载器、代理或既有整理规则</li><li>整理方式待复核的成功记录不会被包含在内</li></ul><div class="actions"><button class="secondary" :disabled="loading" @click="pendingGroupRepair = null">返回</button><button class="primary" :disabled="loading" @click="repairGroup">确认创建硬链接</button></div></section></div>
  </main>
</template>

<style scoped>
.governor-page{min-height:100%;box-sizing:border-box;padding:44px;max-width:1180px;margin:0 auto;color:rgb(var(--v-theme-on-background,232,231,241));background:rgb(var(--v-theme-background,16,16,24))}.page-header,.modal-header,.result-heading{display:flex;justify-content:space-between;gap:24px;align-items:flex-start}.page-header{margin-bottom:32px}.page-header h1{margin:0;font-size:38px;line-height:1.2}.page-header p,.result-heading p{max-width:700px;margin:10px 0 0;color:rgba(var(--v-theme-on-surface,232,231,241),.72);font-size:18px;line-height:1.65}.primary,.secondary{border:0;border-radius:12px;padding:12px 18px;font-size:16px;font-weight:750;cursor:pointer}.primary{background:rgb(var(--v-theme-primary,139,92,246));color:#fff}.secondary{background:rgba(var(--v-theme-on-surface,232,231,241),.09);color:rgb(var(--v-theme-on-surface,232,231,241))}.primary:disabled,.secondary:disabled{opacity:.55;cursor:default}.notice{margin:0 0 22px;padding:15px 18px;border-radius:12px;background:rgba(251,140,0,.16);font-size:16px;line-height:1.5}.result-panel,.modal,.issue-card,.unresolved{border:1px solid rgba(var(--v-border-color,232,231,241),.16);background:rgba(var(--v-theme-surface,23,23,34),.9);border-radius:18px}.result-panel{padding:30px}.result-heading h2{margin:0;font-size:29px;line-height:1.3}.header-actions{display:flex;gap:12px;flex-wrap:wrap}.progress-wrap{margin:28px 0 22px;padding:20px;border-radius:14px;background:rgba(255,255,255,.045)}.progress-copy{display:flex;justify-content:space-between;gap:18px;align-items:baseline;font-size:17px}.progress-copy strong{font-size:28px}.progress-copy span{color:rgba(var(--v-theme-on-surface,232,231,241),.72)}.progress-track{height:12px;margin-top:14px;overflow:hidden;border-radius:999px;background:rgba(255,255,255,.1)}.progress-bar{height:100%;min-width:0;border-radius:inherit;background:rgb(var(--v-theme-primary,139,92,246));transition:width .24s ease}.overview{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin:22px 0}.overview article{padding:20px;border-radius:14px;background:rgba(255,255,255,.045)}.overview strong{display:block;font-size:34px;line-height:1.05}.overview span{display:block;margin-top:8px;color:rgba(var(--v-theme-on-surface,232,231,241),.72);font-size:16px}.unresolved{padding:23px;margin:0 0 20px;background:rgba(251,140,0,.09)}.unresolved h3{margin:0;font-size:21px}.unresolved p{margin:10px 0 0;font-size:17px;line-height:1.6;color:rgba(var(--v-theme-on-surface,232,231,241),.82)}.issues{display:grid;gap:14px}.issue-card{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:26px}.issue-copy{min-width:0}.issue-type,.modal-label{display:inline-block;margin-bottom:10px;color:rgb(var(--v-theme-primary,139,92,246));font-size:16px;font-weight:750}.issue-copy h3{margin:0;font-size:25px;line-height:1.35}.finding-list{padding-left:20px;margin:12px 0 0;color:rgba(var(--v-theme-on-surface,232,231,241),.86);font-size:17px;line-height:1.65}.empty{padding:46px 18px;text-align:center}.empty h3{margin:0;font-size:24px}.empty p{margin:10px 0 0;color:rgba(var(--v-theme-on-surface,232,231,241),.72);font-size:17px}.modal-backdrop{position:fixed;inset:0;z-index:20;display:grid;place-items:center;padding:24px;background:rgba(0,0,0,.58)}.modal{width:min(100%,780px);max-height:calc(100vh - 48px);overflow:auto;padding:34px}.modal h2{margin:4px 0 0;font-size:32px;line-height:1.3}.modal h3{margin:0;font-size:23px;line-height:1.4}.icon-button{border:0;background:transparent;color:rgb(var(--v-theme-on-surface,232,231,241));font-size:36px;line-height:1;cursor:pointer}.modal-section,.manual-guide{padding-top:24px;margin-top:24px;border-top:1px solid rgba(var(--v-border-color,232,231,241),.14)}.modal-section p,.manual-guide li{font-size:18px;line-height:1.7;color:rgba(var(--v-theme-on-surface,232,231,241),.9)}.evidence-copy{padding:14px 16px;border-radius:12px;background:rgba(255,255,255,.055)}.directory-picker{display:grid;gap:9px;margin:20px 0 0;font-size:17px;font-weight:750}.directory-picker select{width:100%;min-height:46px;padding:10px 12px;border:1px solid rgba(var(--v-border-color,232,231,241),.24);border-radius:10px;background:rgba(0,0,0,.16);color:inherit;font:inherit}.wide{width:100%;margin-top:18px;padding:15px 18px;font-size:17px}.manual-guide summary{cursor:pointer;font-size:18px;font-weight:750}.manual-guide ol{padding-left:26px;margin:16px 0 0}.confirm{width:min(100%,560px)}.confirm>p,.confirm li{font-size:18px;line-height:1.65}.actions{display:flex;justify-content:flex-end;gap:12px;margin-top:26px}@media(max-width:760px){.governor-page{padding:24px 18px}.page-header,.result-heading,.issue-card{flex-direction:column;align-items:stretch}.page-header h1{font-size:32px}.page-header p,.result-heading p{font-size:17px}.result-panel{padding:25px}.overview{grid-template-columns:repeat(2,1fr)}.issue-card{padding:22px}.issue-copy h3{font-size:22px}.finding-list{font-size:16px}.modal{padding:25px}.modal h2{font-size:27px}.modal h3{font-size:21px}.modal-section p,.manual-guide li{font-size:17px}}
</style>
