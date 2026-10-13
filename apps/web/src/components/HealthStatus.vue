<script setup lang="ts">
import type { HealthResponse } from '@encheres/shared'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import { onMounted, ref } from 'vue'
import { trpc } from '../api/trpc'

const props = withDefaults(
  defineProps<{
    /** Appel de la procédure `health` ; remplaçable dans les tests. */
    fetchHealth?: () => Promise<HealthResponse>
  }>(),
  { fetchHealth: () => trpc.health.query() },
)

type State = { kind: 'loading' } | { kind: 'success'; health: HealthResponse } | { kind: 'error' }

const state = ref<State>({ kind: 'loading' })

// Dates affichées dans le fuseau du navigateur (docs/technical/screens.md).
const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'medium' })

async function load() {
  state.value = { kind: 'loading' }
  try {
    state.value = { kind: 'success', health: await props.fetchHealth() }
  } catch {
    state.value = { kind: 'error' }
  }
}

onMounted(load)
</script>

<template>
  <section class="rounded-lg border border-slate-200 p-4" aria-labelledby="health-title">
    <h2 id="health-title" class="mb-3 text-lg font-semibold">État du serveur</h2>

    <div aria-live="polite">
      <div v-if="state.kind === 'loading'" data-testid="health-loading" class="space-y-2">
        <Skeleton width="8rem" height="1.25rem" />
        <Skeleton width="14rem" height="1rem" />
      </div>

      <div v-else-if="state.kind === 'success'" data-testid="health-success">
        <p>
          API : <strong data-testid="health-status">{{ state.health.status }}</strong>
        </p>
        <p class="text-sm text-slate-600">
          Heure du serveur :
          <time :datetime="state.health.time">{{
            dateFormat.format(new Date(state.health.time))
          }}</time>
        </p>
      </div>

      <div v-else data-testid="health-error" class="space-y-3">
        <Message severity="error">Impossible de joindre le serveur.</Message>
        <Button label="Réessayer" severity="secondary" @click="load" />
      </div>
    </div>
  </section>
</template>
