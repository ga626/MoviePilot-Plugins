<script setup>
import { computed, ref } from 'vue'

const props = defineProps({ api: { type: Object, default: () => ({}) } })
const loading = ref(false)
const notice = ref('')
const cards = ref([])
const selected = ref(null)
const preview = ref(null)
const confirmRepair = ref(false)
const pageSize = 100

const canUseApi = computed(() => typeof props.api?.get === 'function' && typeof props.api?.post === 'function')
const safeName = value => String(value || '').replace(/[\\/]/g, '').slice(0, 140)
const dataOf = response => response?.data ?? response
const videoExt = /\.(mkv|mp4|avi|m2ts|ts|mov|webm)$/i
const subtitleExt = /\.(ass|ssa|srt|sub|vtt)$/i
const maxPackageDirectories = 120
const maxPackageDepth = 6

function sourcePackage(source) {
  if (source?.type === 'dir') return source
  const path = String(source?.path || '')
  const separator = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  if (separator < 1) return null
  return { ...source, path: path.slice(0, separator), name: '', basename: '', extension: '', type: 'dir', children: [] }
}

async function packageEvidence(root) {
  if (!root) return { ok: false, reason: '无法确定来源包目录，未生成预览。' }
  const pending = [{ item: root, depth: 0 }]
  let directories = 0
  let videos = 0
  let subtitles = 0
  while (pending.length) {
    if (directories >= maxPackageDirectories) return { ok: false, reason: '来源包目录过多，未完整核对，未生成预览。' }
    const current = pending.shift()
    let children
    try { children = dataOf(await props.api.post('storage/list', current.item, { feedback: 'silent' })) } catch { return { ok: false, reason: '来源包目录无法读取，未生成预览。' } }
    if (!Array.isArray(children)) return { ok: false, reason: '来源包目录返回异常，未生成预览。' }
    directories += 1
    for (const child of children) {
      if (child?.type === 'dir') {
        if (current.depth >= maxPackageDepth) return { ok: false, reason: '来源包层级过深，未完整核对，未生成预览。' }
        pending.push({ item: child, depth: current.depth + 1 })
      } else if (videoExt.test(child?.name || '')) videos += 1
      else if (subtitleExt.test(child?.name || '')) subtitles += 1
    }
  }
  return { ok: true, videos, subtitles, directories }
}

function identityOf(context, fallback) {
  const media = context?.media_info || context?.mediaInfo || context?.media || {}
  const meta = context?.meta_info || context?.metaInfo || {}
  return {
    title: safeName(media.title || media.name || meta.title || fallback),
    year: String(media.year || meta.year || '').slice(0, 8),
    media_source: String(media.media_source || media.source || ''),
    media_id: String(media.media_id || media.id || ''),
    type_name: String(media.type || media.mtype || meta.type || ''),
    season: Number(media.season || meta.season || 0) || undefined,
  }
}

async function historyRows() {
  const rows = []
  for (let page = 1; ; page += 1) {
    const envelope = await props.api.get(`history/transfer?status=false&page=${page}&count=${pageSize}`, { feedback: 'silent' })
    const payload = dataOf(envelope)
    if (payload?.success === false) throw new Error(payload.message || '无法读取整理历史')
    const data = payload?.data ?? payload
    const batch = data?.items || data?.list || data?.data || []
    if (!Array.isArray(batch)) break
    rows.push(...batch)
    if (batch.length < pageSize) break
  }
  return rows
}

async function packageFor(row) {
  const source = row?.src_fileitem
  const sourcePath = source?.path
  if (!source || !sourcePath) return { state: 'blocked', reason: '历史记录没有可读的来源文件', historyId: row?.id }
  let context = {}
  try { context = dataOf(await props.api.get(`media/recognize_file?path=${encodeURIComponent(sourcePath)}`, { feedback: 'silent' })) || {} } catch { context = {} }
  const identity = identityOf(context, source.name)
  if (!identity.title || !identity.media_source || !identity.media_id || !identity.type_name) {
    return { state: 'needs_selection', reason: '官方识别没有给出唯一作品身份', historyId: row.id, source }
  }
  const evidence = await packageEvidence(sourcePackage(source))
  if (!evidence.ok) return { state: 'blocked', reason: evidence.reason, historyId: row.id, source, identity }
  return {
    state: 'ready', historyId: row.id, source, identity,
    evidence,
  }
}

async function inspect() {
  if (!canUseApi.value) { notice.value = '当前 MoviePilot 未注入认证 API，无法安全检查。'; return }
  loading.value = true; cards.value = []; selected.value = null; preview.value = null; notice.value = '正在读取失败整理记录，并按来源包核对…'
  try {
    const rows = await historyRows()
    const inspected = []
    for (const row of rows) inspected.push(await packageFor(row))
    const grouped = new Map()
    for (const item of inspected) {
      const key = item.state === 'ready' ? `${item.identity.media_source}:${item.identity.media_id}:${item.identity.season || ''}` : `unknown:${item.historyId}`
      const current = grouped.get(key) || { ...item, historyIds: [], count: 0 }
      current.historyIds.push(item.historyId); current.count += 1
      if (item.evidence) current.evidence = item.evidence
      grouped.set(key, current)
    }
    cards.value = [...grouped.values()]
    const ready = cards.value.filter(item => item.state === 'ready').length
    const blocked = cards.value.length - ready
    notice.value = `检查结束：${ready} 个作品可生成官方预览，${blocked} 个仍需你选择作品或补充信息。没有改动文件。`
  } catch (error) { notice.value = error?.message || '检查未完成；没有改动文件。' } finally { loading.value = false }
}

async function searchCandidates() {
  if (!selected.value?.source?.name) return
  loading.value = true
  try {
    const candidates = dataOf(await props.api.get(`media/search?title=${encodeURIComponent(selected.value.source.name)}&type=media&count=3`, { feedback: 'silent' }))
    selected.value.candidates = Array.isArray(candidates) ? candidates.map(item => ({ title: safeName(item.title || item.name), year: String(item.year || ''), media_source: item.media_source || item.source, media_id: String(item.media_id || item.id || ''), type_name: item.type || item.mtype || '' })).filter(item => item.title && item.media_source && item.media_id && item.type_name) : []
    if (!selected.value.candidates.length) notice.value = '官方搜索也没有可靠候选；这条记录暂时不能自动整理。'
  } catch { notice.value = '官方候选搜索暂不可用；没有改动文件。' } finally { loading.value = false }
}

function chooseCandidate(candidate) { selected.value.identity = candidate; selected.value.state = 'ready'; selected.value.reason = '' }
function manualPayload(item, previewMode) {
  return { fileitem: item.source, transfer_type: 'link', preview: previewMode, reorganize: false, media_source: item.identity.media_source, media_id: item.identity.media_id, type_name: item.identity.type_name, season: item.identity.season }
}
async function makePreview() {
  if (!selected.value || selected.value.state !== 'ready') return
  loading.value = true
  try {
    const result = dataOf(await props.api.post('transfer/manual', manualPayload(selected.value, true), { feedback: 'silent' }))
    if (result?.success === false) throw new Error(result.message || '官方预览被拒绝')
    const data = result?.data ?? result
    preview.value = { ...data, item: selected.value }
    notice.value = '官方预览完成，仍未写入任何文件。请确认结果后再执行。'
  } catch (error) { notice.value = error?.message || '官方预览失败；没有改动文件。' } finally { loading.value = false }
}
async function repair() {
  if (!preview.value?.item) return
  loading.value = true
  try {
    const result = dataOf(await props.api.post('transfer/manual', manualPayload(preview.value.item, false), { feedback: 'all' }))
    if (result?.success === false) throw new Error(result.message || '官方整理失败')
    notice.value = `MoviePilot 已提交“${preview.value.item.identity.title}”的硬链接整理。来源文件未被插件移动、改名或删除。`
    confirmRepair.value = false; preview.value = null
  } catch (error) { notice.value = error?.message || '整理没有完成；请查看 MoviePilot 的官方结果。' } finally { loading.value = false }
}
</script>

<template>
  <main class="governor-page"><header><div><h1>媒体治理</h1><p>最后一关：把整理失败的来源包交给 MoviePilot 再识别、再预览。插件不猜作品，不直接操作文件。</p></div><button class="primary" :disabled="loading" @click="inspect">{{ loading ? '检查中…' : '开始检查全部' }}</button></header>
    <p v-if="notice" class="notice" role="status">{{ notice }}</p>
    <section class="panel"><h2>检查结果</h2><p v-if="!cards.length" class="muted">点击“开始检查全部”后，这里才会显示可解释的作品包。</p><article v-for="card in cards" :key="card.historyIds.join('-')" class="card"><div><span>{{ card.count }} 条失败整理记录</span><h3>{{ card.identity?.title || '没有可靠作品身份' }}{{ card.identity?.year ? `（${card.identity.year}）` : '' }}</h3><p v-if="card.state === 'ready'">来源包检测到 {{ card.evidence?.videos || 0 }} 个视频、{{ card.evidence?.subtitles || 0 }} 个字幕；可先看官方预览。</p><p v-else>{{ card.reason }}</p></div><button class="secondary" @click="selected = card; preview = null">{{ card.state === 'ready' ? '查看并预览' : '找作品' }}</button></article></section>
    <div v-if="selected" class="backdrop" @click.self="selected = null"><section class="modal"><button class="close" aria-label="关闭" @click="selected = null">×</button><h2>{{ selected.identity?.title || '找回作品身份' }}</h2><p v-if="selected.state !== 'ready'">这条记录还不能安全整理。你可以让 MoviePilot 搜索候选；遇到重名、翻拍或混包必须由你选择。</p><button v-if="selected.state !== 'ready'" class="secondary" :disabled="loading" @click="searchCandidates">搜索官方候选</button><div v-for="candidate in selected.candidates || []" :key="`${candidate.media_source}:${candidate.media_id}`" class="candidate"><span>{{ candidate.title }}{{ candidate.year ? `（${candidate.year}）` : '' }}</span><button class="secondary" @click="chooseCandidate(candidate)">就是这部</button></div><template v-if="selected.state === 'ready'"><p>下一步只调用 MoviePilot 的 <code>preview=true</code>，不会创建、删除、移动或改名文件。</p><button class="primary" :disabled="loading" @click="makePreview">生成官方预览</button></template><section v-if="preview" class="preview"><h3>官方预览</h3><p>将处理 {{ preview.summary?.total || preview.items?.length || 0 }} 项：成功 {{ preview.summary?.success || 0 }}，失败 {{ preview.summary?.failed || 0 }}。</p><p>普通修复只传来源文件，不传历史 ID，因此不会触发旧目标清理。</p><button class="primary" :disabled="loading" @click="confirmRepair = true">确认创建正确硬链接</button></section></section></div>
    <div v-if="confirmRepair" class="backdrop"><section class="modal confirm"><h2>确认创建硬链接？</h2><p>MoviePilot 将按刚才的官方预览执行。插件不会删除、移动、改名或覆盖来源文件。</p><button class="secondary" :disabled="loading" @click="confirmRepair = false">返回</button><button class="primary" :disabled="loading" @click="repair">确认执行</button></section></div>
  </main>
</template>

<style scoped>
.governor-page{max-width:1100px;margin:auto;padding:40px;color:rgb(var(--v-theme-on-background,232,231,241))}.governor-page header,.card{display:flex;justify-content:space-between;gap:24px;align-items:flex-start}.governor-page h1{margin:0;font-size:36px}.governor-page h2{margin:0 0 12px}.governor-page p{line-height:1.65}.primary,.secondary{border:0;border-radius:10px;padding:11px 16px;font-weight:700;cursor:pointer}.primary{background:rgb(var(--v-theme-primary,139,92,246));color:#fff}.secondary{background:rgba(255,255,255,.1);color:inherit}.notice,.panel,.modal{border-radius:16px;background:rgba(var(--v-theme-surface,23,23,34),.94);border:1px solid rgba(255,255,255,.14)}.notice{padding:14px 18px;margin:22px 0}.panel{padding:26px}.muted{color:rgba(255,255,255,.65)}.card{padding:20px 0;border-top:1px solid rgba(255,255,255,.12)}.card:first-of-type{border-top:0}.card span{color:rgb(var(--v-theme-primary,139,92,246));font-size:14px;font-weight:700}.card h3{margin:7px 0;font-size:23px}.card p{margin:0;color:rgba(255,255,255,.75)}.backdrop{position:fixed;inset:0;z-index:20;display:grid;place-items:center;padding:20px;background:rgba(0,0,0,.62)}.modal{position:relative;width:min(100%,680px);max-height:calc(100vh - 40px);overflow:auto;padding:30px}.close{position:absolute;right:15px;top:10px;border:0;background:none;color:inherit;font-size:32px;cursor:pointer}.candidate,.preview{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 0;border-top:1px solid rgba(255,255,255,.12)}.preview{display:block;margin-top:22px}.confirm{text-align:center}.confirm .secondary{margin-right:10px}@media(max-width:700px){.governor-page{padding:24px 16px}.governor-page header,.card{flex-direction:column;align-items:stretch}.governor-page h1{font-size:30px}}
</style>
