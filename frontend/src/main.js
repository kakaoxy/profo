import './assets/main.css'

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { initAuth } from '@/stores/auth'

const app = createApp(App)

app.use(router)

// 初始化认证状态
initAuth()

app.mount('#app')
