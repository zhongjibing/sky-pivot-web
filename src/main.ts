import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import App from './App.vue'
import router from './router'
import './styles/global.css'

if (typeof window !== 'undefined' && window.trustedTypes && window.trustedTypes.createPolicy) {
  try {
    window.trustedTypes.createPolicy('default', {
      createHTML: (input: string) => input,
      createScriptURL: (input: string) => input,
    })
  } catch {
    // policy 'default' already exists — re-registration from HMR
  }
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {
    // Service Worker registration failed — non-critical
  })
}

const app = createApp(App)
const pinia = createPinia()

for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.use(pinia)
app.use(router)
app.use(ElementPlus, { size: 'default' })
app.mount('#app')
