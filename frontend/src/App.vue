<script setup>
import { onMounted } from 'vue'
import { initAuth } from '@/stores/auth'
</script>

<template>
  <div id="app">
    <router-view />
  </div>
</template>

<script>
export default {
  name: 'App',
  mounted() {
    // 初始化认证状态
    initAuth()
  }
}
</script>
