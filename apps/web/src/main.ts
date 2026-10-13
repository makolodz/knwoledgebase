import Aura from '@primeuix/themes/aura'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import { createApp } from 'vue'
import App from './App.vue'
import { socket } from './api/socket'
import { createAppRouter } from './router'
import { useRealtimeStore } from './stores/realtime'
import './style.css'

const app = createApp(App)

app.use(createPinia())
app.use(createAppRouter())
app.use(PrimeVue, {
  theme: {
    preset: Aura,
    options: {
      // Thème clair uniquement : ce sélecteur n'est jamais appliqué.
      darkModeSelector: '.app-dark',
      cssLayer: { name: 'primevue', order: 'theme, base, primevue' },
    },
  },
})

useRealtimeStore().attach(socket)

app.mount('#app')
