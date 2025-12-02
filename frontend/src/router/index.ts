import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

// Define route meta type
declare module 'vue-router' {
  interface RouteMeta {
    // Whether the route requires authentication
    requiresAuth?: boolean
    // Roles that can access the route
    roles?: string[]
    // Permissions that can access the route
    permissions?: string[]
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      // Lazy load login page
      component: () => import(/* webpackChunkName: "login" */ '../pages/LoginView.vue'),
      meta: {
        requiresAuth: false
      }
    },
    {
      path: '/',
      name: 'home',
      // Lazy load with prefetch for better performance
      component: () => import(/* webpackChunkName: "home" */ '../pages/HomeView.vue'),
      meta: {
        requiresAuth: true,
        roles: ['admin', 'operator', 'user'],
        permissions: ['view_data']
      }
    },
    {
      path: '/upload',
      name: 'upload',
      // Lazy load upload page
      component: () => import(/* webpackChunkName: "upload" */ '../pages/UploadView.vue'),
      meta: {
        requiresAuth: true,
        roles: ['admin', 'operator'],
        permissions: ['edit_data']
      }
    },
    {
      path: '/projects',
      name: 'projects',
      // Lazy load project management page
      component: () => import(/* webpackChunkName: "projects" */ '../pages/ProjectManagementView.vue'),
      meta: {
        requiresAuth: true,
        roles: ['admin', 'operator', 'user'],
        permissions: ['view_data']
      }
    },
    {
      path: '/admin/merge',
      name: 'admin-merge',
      // Lazy load admin page
      component: () => import(/* webpackChunkName: "admin" */ '../pages/AdminMergeView.vue'),
      meta: {
        requiresAuth: true,
        roles: ['admin'],
        permissions: ['manage_users']
      }
    },
    {
      path: '/admin/users',
      name: 'admin-users',
      // Lazy load admin users page
      component: () => import(/* webpackChunkName: "admin" */ '../pages/AdminUsersView.vue'),
      meta: {
        requiresAuth: true,
        roles: ['admin'],
        permissions: ['manage_users']
      }
    },
    {
      path: '/admin/roles',
      name: 'admin-roles',
      // Lazy load admin roles page
      component: () => import(/* webpackChunkName: "admin" */ '../pages/AdminRolesView.vue'),
      meta: {
        requiresAuth: true,
        roles: ['admin'],
        permissions: ['manage_roles']
      }
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import(/* webpackChunkName: "not-found" */ '../pages/NotFoundView.vue'),
      meta: {
        requiresAuth: false
      }
    }
  ]
})

// Navigation guard
router.beforeEach(async (to, _, next) => {
  // Get auth store
  const authStore = useAuthStore()
  
  // Check if route requires authentication
  if (to.meta.requiresAuth) {
    // Check if user is authenticated
    if (!authStore.isAuthenticated) {
      // If user is not authenticated, redirect to login page
      return next({
        name: 'login',
        query: { redirect: to.fullPath }
      })
    }
    
    // If user is authenticated but doesn't have user info, fetch it
    if (!authStore.user) {
      try {
        await authStore.fetchCurrentUser()
      } catch (error) {
        // If fetching user fails, logout and redirect to login
        authStore.logout()
        return next({
          name: 'login',
          query: { redirect: to.fullPath }
        })
      }
    }
    
    // Check if user has required roles
    if (to.meta.roles && to.meta.roles.length > 0) {
      const hasRole = to.meta.roles.includes(authStore.userRole!)
      if (!hasRole) {
        // If user doesn't have required role, redirect to home page
        return next({
          name: 'home'
        })
      }
    }
    
    // Check if user has required permissions
    if (to.meta.permissions && to.meta.permissions.length > 0) {
      const hasPermission = to.meta.permissions.some(perm => authStore.hasPermission(perm))
      if (!hasPermission) {
        // If user doesn't have required permission, redirect to home page
        return next({
          name: 'home'
        })
      }
    }
    
    // User has required authentication, roles, and permissions
    return next()
  }
  
  // If route doesn't require authentication
  if (to.name === 'login' && authStore.isAuthenticated) {
    // If user is authenticated and trying to access login page, redirect to home page
    return next({
      name: 'home'
    })
  }
  
  // Otherwise, allow access
  return next()
})

// Optional: Add navigation guards for performance monitoring
router.beforeEach((_to, _from, next) => {
  // You can add performance tracking here if needed
  next()
})

export default router
