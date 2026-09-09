<script setup>
import AppPage from './AppPage.vue'
defineProps({ api: { type: Object, default: () => ({}) }, pluginId: { type: String, default: 'MediaGovernorValidator' } })
defineEmits(['action', 'close'])
</script>
<template><AppPage :api="api" /></template>
