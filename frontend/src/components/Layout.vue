<template>
  <div class="min-h-screen bg-gray-50">
    <!-- 侧边栏 -->
    <div class="fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out lg:translate-x-0" 
         :class="{ '-translate-x-full': !sidebarOpen }">
      <div class="flex items-center justify-center h-16 px-4 bg-primary-600">
        <h1 class="text-xl font-bold text-white">房源管理系统</h1>
      </div>
      
      <nav class="mt-8 px-4">
        <div class="space-y-2">
          <router-link
            v-for="item in navigation"
            :key="item.name"
            :to="item.href"
            class="sidebar-link"
            :class="$route.name === item.name ? 'sidebar-link-active' : 'sidebar-link-inactive'"
          >
            <component :is="item.icon" class="w-5 h-5 mr-3" />
            {{ item.label }}
          </router-link>
        </div>
      </nav>
    </div>

    <!-- 主内容区域 -->
    <div class="lg:pl-64">
      <!-- 顶部导航栏 -->
      <div class="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b border-gray-200 bg-white px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8">
        <button
          type="button"
          class="-m-2.5 p-2.5 text-gray-700 lg:hidden"
          @click="sidebarOpen = !sidebarOpen"
        >
          <Bars3Icon class="h-6 w-6" />
        </button>

        <div class="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
          <div class="flex flex-1"></div>
          <div class="flex items-center gap-x-4 lg:gap-x-6">
            <!-- 用户菜单 -->
            <div class="relative">
              <button
                type="button"
                class="flex items-center gap-x-2 text-sm font-semibold leading-6 text-gray-900"
                @click="userMenuOpen = !userMenuOpen"
              >
                <img
                  class="h-8 w-8 rounded-full bg-gray-50"
                  :src="user?.avatar_url || '/default-avatar.png'"
                  :alt="user?.nickname || '用户'"
                />
                <span>{{ user?.nickname || user?.username }}</span>
                <ChevronDownIcon class="h-5 w-5 text-gray-400" />
              </button>
              
              <!-- 用户下拉菜单 -->
              <div
                v-show="userMenuOpen"
                class="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none"
                @click.away="userMenuOpen = false"
              >
                <a href="#" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">个人设置</a>
                <button
                  @click="handleLogout"
                  class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  退出登录
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 页面内容 -->
      <main class="py-8">
        <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <router-view />
        </div>
      </main>
    </div>

    <!-- 移动端侧边栏遮罩 -->
    <div
      v-show="sidebarOpen"
      class="fixed inset-0 z-40 bg-gray-600 bg-opacity-75 lg:hidden"
      @click="sidebarOpen = false"
    ></div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  Bars3Icon,
  ChevronDownIcon,
  HomeIcon,
  BuildingOfficeIcon,
  EyeIcon,
  ArrowUpTrayIcon,
  ChartBarIcon,
  Cog6ToothIcon
} from '@heroicons/vue/24/outline'
import { user, logout } from '@/stores/auth'

const router = useRouter()
const sidebarOpen = ref(false)
const userMenuOpen = ref(false)

// 导航菜单配置
const navigation = [
  { name: 'Dashboard', label: '数据看板', href: '/', icon: HomeIcon },
  { name: 'Properties', label: '房源管理', href: '/properties', icon: BuildingOfficeIcon },
  { name: 'MyViewings', label: '个人看房', href: '/my-viewings', icon: EyeIcon },
  { name: 'DataImport', label: '数据导入', href: '/data-import', icon: ArrowUpTrayIcon },
  { name: 'Communities', label: '小区分析', href: '/communities', icon: ChartBarIcon },
  { name: 'Admin', label: '基础数据', href: '/admin', icon: Cog6ToothIcon }
]

// 处理登出
const handleLogout = () => {
  logout()
  router.push('/login')
}

onMounted(() => {
  // 点击外部关闭用户菜单
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.relative')) {
      userMenuOpen.value = false
    }
  })
})
</script>
