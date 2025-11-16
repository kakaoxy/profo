<template>
  <div :class="['loading-spinner-container', sizeClass]">
    <div :class="['spinner', sizeClass]"></div>
    <p v-if="text" :class="['loading-text', sizeClass]">{{ text }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  size?: 'sm' | 'md' | 'lg'
  text?: string
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md',
  text: ''
})

const sizeClass = computed(() => {
  switch (props.size) {
    case 'sm':
      return 'size-sm'
    case 'lg':
      return 'size-lg'
    default:
      return 'size-md'
  }
})
</script>

<style scoped>
.loading-spinner-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
}

.loading-spinner-container.size-sm {
  gap: 0.5rem;
}

.loading-spinner-container.size-lg {
  gap: 1.5rem;
}

.spinner {
  border: 4px solid #e5e7eb;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.spinner.size-sm {
  width: 1.5rem;
  height: 1.5rem;
  border-width: 2px;
}

.spinner.size-md {
  width: 3rem;
  height: 3rem;
  border-width: 4px;
}

.spinner.size-lg {
  width: 4rem;
  height: 4rem;
  border-width: 5px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-text {
  color: #6b7280;
  font-weight: 500;
}

.loading-text.size-sm {
  font-size: 0.875rem;
}

.loading-text.size-md {
  font-size: 1rem;
}

.loading-text.size-lg {
  font-size: 1.125rem;
}
</style>
