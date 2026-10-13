<script setup lang="ts">
import Button from 'primevue/button'
import { RouterLink, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()

async function logout() {
  try {
    await auth.logout()
  } catch {
    // Serveur injoignable : le store a quand même retiré l'utilisateur, l'interface passe en
    // mode visiteur. La session côté serveur expirera d'elle-même.
  }
  await router.push('/')
}
</script>

<template>
  <header class="border-b border-slate-200 bg-white">
    <div class="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
      <RouterLink to="/" class="text-xl font-bold tracking-tight">Enchères</RouterLink>
      <!-- La recherche arrive avec l'étape 3. -->
      <nav aria-label="Navigation principale" class="flex items-center gap-3 text-sm">
        <template v-if="auth.user">
          <RouterLink to="/account" class="underline" data-testid="nav-account">
            {{ auth.user.name }}
          </RouterLink>
          <Button label="Déconnexion" severity="secondary" size="small" @click="logout" />
        </template>
        <template v-else-if="auth.ready">
          <RouterLink to="/login" class="underline">Connexion</RouterLink>
          <RouterLink to="/register" class="underline">S’inscrire</RouterLink>
        </template>
      </nav>
    </div>
  </header>
</template>
