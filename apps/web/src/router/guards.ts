import type { UserRole } from '@encheres/shared'
import type { RouteLocationNormalized, RouteLocationRaw } from 'vue-router'
import { useAuthStore } from '../stores/auth'

declare module 'vue-router' {
  interface RouteMeta {
    /** Réservé aux utilisateurs connectés : sinon redirection vers `/login?redirect=…`. */
    requiresAuth?: boolean
    /** Réservé aux visiteurs (connexion, inscription) : un utilisateur connecté va à l'accueil. */
    guestOnly?: boolean
    /** Rôles autorisés : un autre rôle voit la page 404 (docs/technical/screens.md). */
    roles?: readonly UserRole[]
  }
}

/**
 * Destination après une connexion. Le paramètre `redirect` vient de l'URL, donc de n'importe qui :
 * seul un chemin interne est accepté, jamais une adresse complète (redirection ouverte).
 */
export function safeRedirect(value: unknown): string {
  if (typeof value !== 'string') return '/'
  const isInternalPath =
    value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\')
  // Pas de saut de ligne ni de caractère de contrôle, que certains navigateurs retirent
  // (`/\t/evil.com` deviendrait `//evil.com`).
  // eslint-disable-next-line no-control-regex
  return isInternalPath && !/[\u0000-\u001f\u007f]/.test(value) ? value : '/'
}

/** Garde de navigation : restaure la session, puis applique `requiresAuth`, `guestOnly` et `roles`. */
export async function authGuard(to: RouteLocationNormalized): Promise<true | RouteLocationRaw> {
  const auth = useAuthStore()
  await auth.load()

  if (to.meta.requiresAuth && auth.user === null) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.meta.guestOnly && auth.user !== null) return { path: '/' }
  if (
    to.meta.roles !== undefined &&
    auth.user !== null &&
    !to.meta.roles.includes(auth.user.role)
  ) {
    // 404 plutôt que 403 : on ne révèle pas l'existence d'une page réservée.
    return { name: 'not-found', params: { pathMatch: to.path.split('/').slice(1) } }
  }
  return true
}
