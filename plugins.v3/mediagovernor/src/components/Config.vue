<script setup>
import { reactive } from 'vue'
const props = defineProps({ initialConfig: { type: Object, default: () => ({}) } })
const emit = defineEmits(['save', 'close'])
const config = reactive({ enabled: false, backfill_existing_failures: false, ...props.initialConfig })
</script>
<template><main class="config-page"><h2>媒体治理设置</h2><label><input v-model="config.enabled" type="checkbox" /> 启用媒体治理</label><p>启用后只观察新发生的整理结果，不会改动文件。</p><label><input v-model="config.backfill_existing_failures" type="checkbox" /> 一次性读取旧失败记录</label><p>默认关闭；完成后自动停止，不会周期性重扫。</p><aside>本插件只能生成零写入预演计划，不能移动、改名、删除、重试或创建硬链接。</aside><footer><button @click="emit('close')">关闭</button><button class="primary" @click="emit('save', config)">保存</button></footer></main></template>
<style scoped>.config-page{padding:24px;color:rgb(var(--v-theme-on-background,232,231,241))}.config-page label{display:block;margin-top:18px;font-weight:650}.config-page p{margin:6px 0;color:rgba(var(--v-theme-on-surface,232,231,241),.65);font-size:13px}.config-page aside{margin-top:22px;padding:12px;border-radius:9px;background:rgba(33,150,243,.16);font-size:13px}.config-page footer{display:flex;justify-content:flex-end;gap:9px;margin-top:22px}.config-page button{border:0;border-radius:8px;padding:8px 13px;cursor:pointer}.config-page .primary{background:rgb(var(--v-theme-primary,139,92,246));color:white}</style>
