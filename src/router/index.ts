import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('@/views/Register.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/recover',
    name: 'Recover',
    component: () => import('@/views/Recover.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/setup',
    name: 'Setup',
    component: () => import('@/views/Setup.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/',
    component: () => import('@/components/Layout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'PasswordList',
        component: () => import('@/views/PasswordList.vue'),
      },
      {
        path: 'create',
        name: 'PasswordCreate',
        component: () => import('@/views/PasswordCreate.vue'),
      },
      {
        path: 'edit/:id',
        name: 'PasswordEdit',
        component: () => import('@/views/PasswordEdit.vue'),
      },
      {
        path: 'trash',
        name: 'Trash',
        component: () => import('@/views/Trash.vue'),
      },
      {
        path: 'health',
        name: 'Health',
        component: () => import('@/views/Health.vue'),
      },
      {
        path: 'devices',
        name: 'Devices',
        component: () => import('@/views/Devices.vue'),
      },
      {
        path: 'audit-log',
        name: 'AuditLog',
        component: () => import('@/views/AuditLog.vue'),
      },
      {
        path: 'settings',
        name: 'Settings',
        component: () => import('@/views/Settings.vue'),
      },
      {
        path: 'about',
        name: 'About',
        component: () => import('@/views/About.vue'),
      },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to, _from, next) => {
  const at = localStorage.getItem('at')
  const atExpires = localStorage.getItem('atExpiresAt')
  const hasValidAt = at && atExpires && Date.now() < new Date(atExpires).getTime()
  if (to.meta.requiresAuth !== false && !hasValidAt) {
    next('/login')
  } else if (to.path === '/login' && hasValidAt) {
    next('/')
  } else {
    next()
  }
})

export default router
