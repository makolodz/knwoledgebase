import { computed, type Ref } from 'vue'
import { formatRemaining } from '../format'
import { useNow } from './now'

/**
 * Compte à rebours jusqu'à une date ISO. Il se base sur l'heure du navigateur : il est indicatif,
 * c'est le serveur qui décide de la fin (docs/technical/frontend.md, « Règles »). Il se recalcule
 * tout seul quand la date change (prolongation anti-sniping).
 */
export function useCountdown(target: Ref<string | null | undefined>) {
  const now = useNow()
  const remainingMs = computed(() =>
    target.value ? new Date(target.value).getTime() - now.value : 0,
  )
  return {
    remainingMs,
    text: computed(() => formatRemaining(remainingMs.value)),
    finished: computed(() => target.value != null && remainingMs.value <= 0),
  }
}
