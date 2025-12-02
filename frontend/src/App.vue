<template>
  <div id="app">
    <nav class="app-nav">
      <div class="nav-container">
        <div class="nav-content">
          <div class="nav-brand">
            <svg class="brand-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span class="brand-text">Profo 房产数据中心</span>
          </div>
          
          <div class="nav-right">
            <div class="nav-links">
              <router-link 
                v-for="menu in visibleMenus" 
                :key="menu.path"
                :to="menu.path" 
                class="nav-link"
                :class="{ 'nav-link-active': currentRoute === menu.path }"
              >
                <svg class="nav-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path :d="menu.icon" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" />
                </svg>
                {{ menu.name }}
              </router-link>
            </div>
            
            <!-- User Menu -->
            <div class="user-menu" v-if="authStore.isAuthenticated">
              <div class="user-info" @click="toggleUserMenu">
                <div class="user-avatar" v-if="authStore.user?.avatar">
                  <img :src="authStore.user.avatar" alt="User Avatar" />
                </div>
                <div class="user-avatar placeholder" v-else>
                  <span>{{ authStore.user?.nickname?.charAt(0) || authStore.user?.username.charAt(0) }}</span>
                </div>
                <span class="user-name">{{ authStore.user?.nickname || authStore.user?.username }}</span>
                <svg class="dropdown-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              
              <div class="user-dropdown" v-if="showUserMenu">
                <div class="dropdown-item">
                  <svg class="dropdown-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span>个人中心</span>
                </div>
                <div class="dropdown-item" @click="handleLogout">
                  <svg class="dropdown-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  <span>退出登录</span>
                </div>
              </div>
            </div>
            
            <!-- Login Button -->
            <router-link v-else to="/login" class="btn btn-primary btn-sm">
              登录
            </router-link>
          </div>
        </div>
      </div>
    </nav>
    
    <main class="app-main">
      <router-view />
    </main>
    
    <!-- Toast notifications -->
    <Toast />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Toast from '@/components/Toast.vue'
import { useAuthStore } from './stores/auth'

// Auth store
const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()

// User menu state
const showUserMenu = ref(false)

// Navigation menus with permissions
const navMenus = [
  {
    name: '房源列表',
    path: '/',
    icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
    permissions: ['view_data'],
    roles: ['admin', 'operator', 'user']
  },
  {
    name: '数据上传',
    path: '/upload',
    icon: 'M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12',
    permissions: ['edit_data'],
    roles: ['admin', 'operator']
  },
  {
    name: '项目管理',
    path: '/projects',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
    permissions: ['view_data'],
    roles: ['admin', 'operator', 'user']
  },
  {
    name: '数据治理',
    path: '/admin/merge',
    icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
    permissions: ['manage_users'],
    roles: ['admin']
  },
  {
    name: '用户管理',
    path: '/admin/users',
    icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
    permissions: ['manage_users'],
    roles: ['admin']
  },
  {
    name: '角色管理',
    path: '/admin/roles',
    icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
    permissions: ['manage_roles'],
    roles: ['admin']
  }
]

// Computed properties
const currentRoute = computed(() => route.path)

// Check if user has permission to access a menu
const hasMenuPermission = (menu: any) => {
  // If no permissions or roles specified, allow everyone
  if (!menu.permissions && !menu.roles) {
    return true
  }
  
  // Check if user has any of the required roles
  if (menu.roles && menu.roles.length > 0) {
    if (authStore.userRole && menu.roles.includes(authStore.userRole)) {
      return true
    }
  }
  
  // Check if user has any of the required permissions
  if (menu.permissions && menu.permissions.length > 0) {
    return menu.permissions.some((perm: string) => authStore.hasPermission(perm))
  }
  
  return false
}

// Get visible menus based on user permissions
const visibleMenus = computed(() => {
  // If not authenticated, return empty array
  if (!authStore.isAuthenticated) {
    return []
  }
  
  return navMenus.filter(menu => hasMenuPermission(menu))
})

// Methods
const toggleUserMenu = () => {
  showUserMenu.value = !showUserMenu.value
}

const handleLogout = () => {
  authStore.logout()
  router.push('/login')
  showUserMenu.value = false
}

// Close user menu when clicking outside
const closeUserMenu = (event: MouseEvent) => {
  const userMenu = document.querySelector('.user-menu')
  if (userMenu && !userMenu.contains(event.target as Node)) {
    showUserMenu.value = false
  }
}

// Lifecycle hooks
onMounted(() => {
  // Fetch current user info if authenticated
  if (authStore.isAuthenticated && !authStore.user) {
    authStore.fetchCurrentUser()
  }
  
  // Add click outside listener to close user menu
  document.addEventListener('click', closeUserMenu)
})
</script>

<style scoped>
#app {
  width: 100%;
  min-height: 100vh;
  background-color: #f9fafb;
  display: flex;
  flex-direction: column;
}

/* Navigation */
.app-nav {
  background: white;
  border-bottom: 1px solid #e5e7eb;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
  position: sticky;
  top: 0;
  z-index: 50;
  backdrop-filter: blur(8px);
}

.nav-container {
  max-width: 1920px;
  margin: 0 auto;
  padding: 0 2rem;
}

.nav-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 4rem;
}

.nav-brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-weight: 700;
  font-size: 1.125rem;
  color: #111827;
}

.brand-icon {
  width: 2rem;
  height: 2rem;
  color: #3b82f6;
}

.brand-text {
  letter-spacing: -0.025em;
}

.nav-right {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.nav-links {
  display: flex;
  gap: 0.5rem;
}

.nav-link {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: #6b7280;
  border-radius: 0.375rem;
  transition: all 0.2s ease;
  text-decoration: none;
  position: relative;
}

.nav-icon {
  width: 1.125rem;
  height: 1.125rem;
}

.nav-link:hover {
  color: #3b82f6;
  background-color: rgba(59, 130, 246, 0.05);
}

.nav-link-active {
  color: #3b82f6;
  background-color: rgba(59, 130, 246, 0.1);
  font-weight: 600;
}

.nav-link-active::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 0;
  right: 0;
  height: 2px;
  background: #3b82f6;
}

/* User Menu */
.user-menu {
  position: relative;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  cursor: pointer;
  border-radius: 0.375rem;
  transition: all 0.2s ease;
}

.user-info:hover {
  background-color: rgba(0, 0, 0, 0.05);
}

.user-avatar {
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid transparent;
  transition: all 0.2s ease;
}

.user-avatar:hover {
  border-color: #3b82f6;
}

.user-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.user-avatar.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #3b82f6;
  color: white;
  font-weight: 600;
}

.user-name {
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
}

.dropdown-icon {
  width: 1rem;
  height: 1rem;
  color: #6b7280;
  transition: transform 0.2s ease;
}

.user-info:hover .dropdown-icon {
  color: #3b82f6;
}

.user-dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 0.25rem;
  background-color: white;
  border-radius: 0.5rem;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  min-width: 160px;
  z-index: 100;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  font-size: 0.875rem;
  color: #374151;
  cursor: pointer;
  transition: all 0.2s ease;
}

.dropdown-item:hover {
  background-color: rgba(59, 130, 246, 0.05);
  color: #3b82f6;
}

.dropdown-item:last-child {
  border-top: 1px solid #e5e7eb;
  color: #ef4444;
}

.dropdown-item:last-child:hover {
  background-color: rgba(239, 68, 68, 0.05);
  color: #dc2626;
}

/* Login button */
.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  text-decoration: none;
}

.btn-primary {
  background-color: #3b82f6;
  color: white;
}

.btn-primary:hover {
  background-color: #2563eb;
}

.btn-sm {
  padding: 0.375rem 0.75rem;
  font-size: 0.75rem;
}

/* Main content */
.app-main {
  flex: 1;
  width: 100%;
}

/* Responsive */
@media (max-width: 1024px) {
  .nav-container {
    padding: 0 1rem;
  }
  
  .nav-brand {
    gap: 0.5rem;
  }
  
  .brand-text {
    font-size: 1rem;
  }
  
  .nav-link span {
    display: none;
  }
  
  .nav-link {
    padding: 0.625rem;
    min-width: 40px;
    justify-content: center;
  }
}

@media (max-width: 768px) {
  .nav-content {
    flex-direction: column;
    height: auto;
    padding: 1rem 0;
    gap: 1rem;
  }
  
  .nav-right {
    width: 100%;
    flex-direction: column;
    gap: 1rem;
  }
  
  .nav-links {
    width: 100%;
    justify-content: center;
    flex-wrap: wrap;
  }
  
  .nav-link span {
    display: inline;
  }
  
  .nav-link {
    flex: 1;
    min-width: 120px;
    justify-content: center;
  }
  
  .user-info {
    justify-content: center;
  }
  
  .user-dropdown {
    right: 50%;
    transform: translateX(50%);
  }
}
</style>
