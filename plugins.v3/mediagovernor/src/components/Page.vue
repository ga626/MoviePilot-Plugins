<script setup>
import AppPage from './AppPage.vue'
defineProps({ api: { type: Object, default: () => ({}) }, pluginId: { type: String, default: 'MediaGovernor' } })
defineEmits(['action', 'close'])
</script>
<template><AppPage :api="api" :plugin-id="pluginId" /></template>
