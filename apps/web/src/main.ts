import Aura from '@primeuix/themes/aura'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import { createApp, watch } from 'vue'
import App from './App.vue'
import { socket } from './api/socket'
import { reconnect, renewSessionOnAuthError } from './api/socket-session'
import { trpc } from './api/trpc'
import { createAppRouter } from './router'
import { useAuthStore } from './stores/auth'
import { useRealtimeStore } from './stores/realtime'
import './style.css'

const app = createApp(App)

app.use(createPinia())
app.use(createAppRouter())
app.use(PrimeVue, {
  // Textes de PrimeVue lus par les lecteurs d'écran : en français, comme le reste de l'interface.
  locale: {
    passwordPrompt: 'Saisissez un mot de passe',
    weak: 'Faible',
    medium: 'Moyen',
    strong: 'Fort',
    aria: { close: 'Fermer' },
  },
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

// Le socket s'identifie au handshake avec le cookie de session : il se reconnecte quand
// l'utilisateur change (connexion, déconnexion, restauration de la session au démarrage).
watch(
  () => useAuthStore().user?.id,
  () => reconnect(socket),
)
renewSessionOnAuthError(socket, async () => {
  await trpc.auth.me.query()
})

app.mount('#app')
