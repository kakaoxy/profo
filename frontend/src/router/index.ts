import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      // Lazy load with prefetch for better performance
      component: () => import(/* webpackChunkName: "home" */ '../pages/HomeView.vue')
    },
    {
      path: '/upload',
      name: 'upload',
      // Lazy load upload page
      component: () => import(/* webpackChunkName: "upload" */ '../pages/UploadView.vue')
    },
    {
      path: '/admin/merge',
      name: 'admin-merge',
      // Lazy load admin page
      component: () => import(/* webpackChunkName: "admin" */ '../pages/AdminMergeView.vue')
    }
  ]
})

// Optional: Add navigation guards for performance monitoring
router.beforeEach((_to, _from, next) => {
  // You can add performance tracking here if needed
  next()
})

export default router
