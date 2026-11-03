import { onScopeDispose, ref, type Ref } from 'vue'

/** Heure du navigateur, rafraîchie chaque seconde, pour les comptes à rebours. */
export function useNow(intervalMs = 1000): Ref<number> {
  const now = ref(Date.now())
  const timer = setInterval(() => {
    now.value = Date.now()
  }, intervalMs)
  onScopeDispose(() => clearInterval(timer))
  return now
}
