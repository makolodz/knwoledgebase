<script setup lang="ts">
import type {
  AUCTION_LIST_FILTERS,
  AUCTION_LIST_SORTS,
  Page,
  PublicAuction,
} from '@encheres/shared'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import { onMounted, ref, watch } from 'vue'
import { trpc } from '../api/trpc'
import AuctionCard from '../components/AuctionCard.vue'
import { errorMessage } from '../i18n/errors'

type Filter = (typeof AUCTION_LIST_FILTERS)[number]
type Sort = (typeof AUCTION_LIST_SORTS)[number]

const FILTERS: { value: Filter; label: string; empty: string }[] = [
  { value: 'live', label: 'En cours', empty: 'Aucune enchère en cours.' },
  { value: 'upcoming', label: 'À venir', empty: 'Aucune enchère à venir.' },
  { value: 'ended', label: 'Terminées', empty: 'Aucune enchère terminée.' },
]

const SORTS: { value: Sort; label: string }[] = [
  { value: 'endingSoon', label: 'Fin proche' },
  { value: 'priceAsc', label: 'Prix croissant' },
  { value: 'priceDesc', label: 'Prix décroissant' },
  { value: 'recent', label: 'Plus récentes' },
]

const PAGE_SIZE = 12

const filter = ref<Filter>('live')
const sort = ref<Sort>('endingSoon')
const page = ref(1)
const state = ref<
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: Page<PublicAuction> }
>({ kind: 'loading' })

// Une réponse tardive d'une ancienne requête ne doit pas écraser la dernière demandée.
let requestId = 0

async function load() {
  const current = ++requestId
  state.value = { kind: 'loading' }
  try {
    const data = await trpc.auction.list.query({
      filter: filter.value,
      sort: sort.value,
      page: page.value,
      limit: PAGE_SIZE,
    })
    if (current === requestId) state.value = { kind: 'ready', data }
  } catch (error) {
    if (current === requestId) state.value = { kind: 'error', message: errorMessage(error) }
  }
}

function pick(value: Filter) {
  filter.value = value
  // Le tri « fin proche » n'a pas de sens pour des enchères terminées.
  sort.value = value === 'ended' ? 'recent' : 'endingSoon'
}

// Changer de filtre ou de tri revient à la première page ; la page change ensuite le chargement.
watch([filter, sort], () => {
  if (page.value !== 1) page.value = 1
  else void load()
})
watch(page, load)
onMounted(load)

function pageCount(data: Page<PublicAuction>): number {
  return Math.max(1, Math.ceil(data.total / data.limit))
}
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold">Enchères en direct</h1>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <div role="group" aria-label="Filtrer les enchères" class="flex gap-2">
        <Button
          v-for="item in FILTERS"
          :key="item.value"
          :label="item.label"
          :severity="filter === item.value ? undefined : 'secondary'"
          :aria-pressed="filter === item.value"
          size="small"
          :data-testid="`filter-${item.value}`"
          @click="pick(item.value)"
        />
      </div>
      <label class="flex items-center gap-2 text-sm">
        Trier par
        <select
          v-model="sort"
          class="rounded border border-slate-300 bg-white px-2 py-1"
          data-testid="sort"
        >
          <option v-for="item in SORTS" :key="item.value" :value="item.value">
            {{ item.label }}
          </option>
        </select>
      </label>
    </div>

    <div v-if="state.kind === 'loading'" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Skeleton v-for="n in 6" :key="n" height="16rem" data-testid="skeleton" />
    </div>

    <div v-else-if="state.kind === 'error'" class="space-y-2">
      <Message severity="error" data-testid="list-error">{{ state.message }}</Message>
      <Button label="Réessayer" severity="secondary" @click="load" />
    </div>

    <template v-else>
      <p v-if="state.data.items.length === 0" data-testid="list-empty">
        {{ FILTERS.find((item) => item.value === filter)?.empty }}
      </p>
      <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <AuctionCard v-for="auction in state.data.items" :key="auction.id" :auction="auction" />
      </div>

      <nav
        v-if="pageCount(state.data) > 1"
        aria-label="Pagination"
        class="flex items-center justify-center gap-3"
      >
        <Button
          label="Précédent"
          severity="secondary"
          size="small"
          :disabled="page <= 1"
          @click="page -= 1"
        />
        <span class="text-sm" data-testid="page-indicator">
          Page {{ page }} sur {{ pageCount(state.data) }}
        </span>
        <Button
          label="Suivant"
          severity="secondary"
          size="small"
          :disabled="page >= pageCount(state.data)"
          @click="page += 1"
        />
      </nav>
    </template>
  </div>
</template>
