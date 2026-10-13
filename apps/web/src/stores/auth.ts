import type { CurrentUser, LoginInput } from '@encheres/shared'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { onSessionLost, trpc } from '../api/trpc'

/** Utilisateur connecté et actions de session (docs/technical/screens.md, « Utilisateur connecté »). */
export const useAuthStore = defineStore('auth', () => {
  const user = ref<CurrentUser | null>(null)
  /** Vrai une fois la session restaurée (ou reconnue absente) au démarrage. */
  const ready = ref(false)

  let loading: Promise<void> | null = null

  /**
   * Restaure la session au démarrage : `auth.me`, avec un renouvellement automatique du token
   * si besoin. Un seul appel, même si plusieurs routes le demandent.
   */
  function load(): Promise<void> {
    loading ??= (async () => {
      try {
        user.value = (await trpc.auth.me.query()).user
      } catch {
        // Pas de session valide, ou serveur injoignable : on se comporte comme un visiteur.
        user.value = null
      } finally {
        ready.value = true
      }
    })()
    return loading
  }

  async function login(input: LoginInput): Promise<void> {
    user.value = (await trpc.auth.login.mutate(input)).user
  }

  /** Ne connecte personne : le serveur répond pareil que l'adresse existe ou non (ADR-014). */
  async function register(input: Parameters<typeof trpc.auth.register.mutate>[0]): Promise<void> {
    await trpc.auth.register.mutate(input)
  }

  /** Quoi qu'il arrive côté serveur, l'utilisateur est déconnecté de l'interface. */
  async function logout(): Promise<void> {
    try {
      await trpc.auth.logout.mutate()
    } finally {
      user.value = null
    }
  }

  function setUser(next: CurrentUser): void {
    user.value = next
  }

  function clear(): void {
    user.value = null
  }

  // La session ne peut plus être renouvelée : l'interface repasse en mode visiteur.
  onSessionLost(clear)

  return { user, ready, load, login, register, logout, setUser, clear }
})
