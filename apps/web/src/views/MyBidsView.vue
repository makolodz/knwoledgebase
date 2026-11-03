<script setup lang="ts">
import type { BidStanding, MyBid, Page } from '@encheres/shared'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import { onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { trpc } from '../api/trpc'
import AuctionStatusBadge from '../components/AuctionStatusBadge.vue'
import { formatDateTime, formatPrice } from '../format'
import { errorMessage } from '../i18n/errors'

const STANDINGS: Record<BidStanding, { label: string; class: string }> = {
  leading: { label: 'En tête', class: 'text-emerald-700' },
  outbid: { label: 'Dépassé', class: 'text-amber-700' },
  won: { label: 'Gagnée', class: 'text-emerald-700' },
  lost: { label: 'Perdue', class: 'text-slate-600' },
  cancelled: { label: 'Annulée', class: 'text-slate-600' },
}

const PAGE_SIZE = 20

const page = ref(1)
const state = ref<
  { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; data: Page<MyBid> }
>({ kind: 'loading' })

async function load() {
  state.value = { kind: 'loading' }
  try {
    state.value = {
      kind: 'ready',
      data: await trpc.profile.myBids.query({ page: page.value, limit: PAGE_SIZE }),
    }
  } catch (error) {
    state.value = { kind: 'error', message: errorMessage(error) }
  }
}

watch(page, load)
onMounted(load)
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold">Mes offres</h1>

    <Skeleton v-if="state.kind === 'loading'" height="10rem" data-testid="skeleton" />

    <div v-else-if="state.kind === 'error'" class="space-y-2">
      <Message severity="error" data-testid="list-error">{{ state.message }}</Message>
      <Button label="Réessayer" severity="secondary" @click="load" />
    </div>

    <template v-else>
      <p v-if="state.data.items.length === 0" data-testid="list-empty">
        Vous n’avez pas encore enchéri.
        <RouterLink to="/" class="underline">Voir les enchères en cours</RouterLink>
      </p>
      <ul v-else class="space-y-3">
        <li
          v-for="item in state.data.items"
          :key="item.auction.id"
          class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4"
          data-testid="my-bid"
        >
          <div class="space-y-1">
            <RouterLink
              :to="`/auctions/${item.auction.id}`"
              class="text-lg font-semibold underline"
            >
              {{ item.auction.title }}
            </RouterLink>
            <p class="text-sm text-slate-600">
              Ma meilleure offre : <strong>{{ formatPrice(item.myBestBid) }}</strong> · Prix actuel
              :
              {{ formatPrice(item.auction.currentPrice ?? item.auction.startingPrice) }}
            </p>
            <p class="text-sm text-slate-600">Fin : {{ formatDateTime(item.auction.endsAt) }}</p>
          </div>
          <div class="flex flex-col items-end gap-1">
            <span
              class="font-semibold"
              :class="STANDINGS[item.standing].class"
              data-testid="standing"
            >
              {{ STANDINGS[item.standing].label }}
            </span>
            <AuctionStatusBadge :status="item.auction.status" />
          </div>
        </li>
      </ul>

      <nav
        v-if="state.data.total > state.data.limit"
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
        <Button
          label="Suivant"
          severity="secondary"
          size="small"
          :disabled="page * state.data.limit >= state.data.total"
          @click="page += 1"
        />
      </nav>
    </template>
  </div>
</template>
