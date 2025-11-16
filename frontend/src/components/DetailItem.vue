<template>
  <div :class="['detail-item', className]">
    <span class="detail-label">{{ label }}</span>
    <span v-if="!$slots.value" class="detail-value">{{ displayValue }}</span>
    <span v-else class="detail-value">
      <slot name="value"></slot>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  label: string
  value?: string | number | null
  className?: string
}

const props = withDefaults(defineProps<Props>(), {
  value: null,
  className: ''
})

const displayValue = computed(() => {
  if (props.value === null || props.value === undefined || props.value === '') {
    return '-'
  }
  return props.value
})
</script>

<style scoped>
.detail-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.detail-label {
  font-size: 0.75rem;
  font-weight: 500;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.025em;
}

.detail-value {
  font-size: 0.875rem;
  color: #111827;
  word-break: break-word;
}

.col-span-2 {
  grid-column: span 2;
}
</style>
