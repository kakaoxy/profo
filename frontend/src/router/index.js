import { createRouter, createWebHistory } from 'vue-router'
import { isAuthenticated } from '@/stores/auth'

// 路由组件懒加载
const Login = () => import('@/views/auth/Login.vue')
const Register = () => import('@/views/auth/Register.vue')
const Dashboard = () => import('@/views/Dashboard.vue')
const Properties = () => import('@/views/properties/Properties.vue')
const PropertyDetail = () => import('@/views/properties/PropertyDetail.vue')
const PropertyForm = () => import('@/views/properties/PropertyForm.vue')
const MyViewings = () => import('@/views/viewings/MyViewings.vue')
const ViewingForm = () => import('@/views/viewings/ViewingForm.vue')
const DataImport = () => import('@/views/DataImport.vue')
const Communities = () => import('@/views/communities/Communities.vue')
const CommunityDetail = () => import('@/views/communities/CommunityDetail.vue')
const Admin = () => import('@/views/admin/Admin.vue')
const Layout = () => import('@/components/Layout.vue')

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: Login,
    meta: { requiresAuth: false }
  },
  {
    path: '/register',
    name: 'Register',
    component: Register,
    meta: { requiresAuth: false }
  },
  {
    path: '/',
    component: Layout,
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'Dashboard',
        component: Dashboard
      },
      {
        path: 'properties',
        name: 'Properties',
        component: Properties
      },
      {
        path: 'properties/new',
        name: 'PropertyCreate',
        component: PropertyForm
      },
      {
        path: 'properties/:id',
        name: 'PropertyDetail',
        component: PropertyDetail,
        props: true
      },
      {
        path: 'properties/:id/edit',
        name: 'PropertyEdit',
        component: PropertyForm,
        props: true
      },
      {
        path: 'my-viewings',
        name: 'MyViewings',
        component: MyViewings
      },
      {
        path: 'my-viewings/new',
        name: 'ViewingCreate',
        component: ViewingForm
      },
      {
        path: 'my-viewings/:id/edit',
        name: 'ViewingEdit',
        component: ViewingForm,
        props: true
      },
      {
        path: 'data-import',
        name: 'DataImport',
        component: DataImport
      },
      {
        path: 'communities',
        name: 'Communities',
        component: Communities
      },
      {
        path: 'communities/:id',
        name: 'CommunityDetail',
        component: CommunityDetail,
        props: true
      },
      {
        path: 'admin',
        name: 'Admin',
        component: Admin
      }
    ]
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 路由守卫
router.beforeEach((to, from, next) => {
  const requiresAuth = to.matched.some(record => record.meta.requiresAuth !== false)
  
  if (requiresAuth && !isAuthenticated.value) {
    next('/login')
  } else if (!requiresAuth && isAuthenticated.value && (to.name === 'Login' || to.name === 'Register')) {
    next('/')
  } else {
    next()
  }
})

export default router
