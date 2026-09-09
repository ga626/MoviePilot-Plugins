<script setup>
import { computed } from 'vue'
const props = defineProps({ modelValue: { type: Object, default: () => ({ enabled: false }) } })
const emit = defineEmits(['update:modelValue'])
const enabled = computed({ get: () => Boolean(props.modelValue?.enabled), set: value => emit('update:modelValue', { ...props.modelValue, enabled: value }) })
</script>
<template>
  <label class="validator-config"><input v-model="enabled" type="checkbox"> 启用媒体治理验证台</label>
</template>
<style scoped>.validator-config{display:flex;gap:10px;align-items:center;padding:16px;color:rgb(var(--v-theme-on-surface,242,245,250))}</style>
