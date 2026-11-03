<script setup lang="ts">
import type { MyWin, Page } from '@encheres/shared'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import { onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { trpc } from '../api/trpc'
import { formatDateTime, formatPrice } from '../format'
import { errorMessage } from '../i18n/errors'

const PAGE_SIZE = 20

const page = ref(1)
const state = ref<
  { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; data: Page<MyWin> }
>({ kind: 'loading' })

async function load() {
  state.value = { kind: 'loading' }
  try {
    state.value = {
      kind: 'ready',
      data: await trpc.profile.myWins.query({ page: page.value, limit: PAGE_SIZE }),
    }
  } catch (error) {
    state.value = { kind: 'error', message: errorMessage(error) }
  }
}

/** Libellé du statut de paiement (le paiement en ligne arrive à l'étape 6). */
function paymentLabel(win: MyWin): string {
  switch (win.auction.status) {
    case 'paid':
      return 'Payée'
    case 'unpaid':
      return 'Délai de paiement dépassé'
    default:
      return win.paymentDeadline
        ? `À payer avant le ${formatDateTime(win.paymentDeadline)}`
        : 'À payer'
  }
}

watch(page, load)
onMounted(load)
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold">Mes enchères gagnées</h1>

    <Skeleton v-if="state.kind === 'loading'" height="10rem" data-testid="skeleton" />

    <div v-else-if="state.kind === 'error'" class="space-y-2">
      <Message severity="error" data-testid="list-error">{{ state.message }}</Message>
      <Button label="Réessayer" severity="secondary" @click="load" />
    </div>

    <template v-else>
      <p v-if="state.data.items.length === 0" data-testid="list-empty">
        Vous n’avez encore remporté aucune enchère.
      </p>
      <ul v-else class="space-y-3">
        <li
          v-for="win in state.data.items"
          :key="win.auction.id"
          class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4"
          data-testid="my-win"
        >
          <div class="space-y-1">
            <RouterLink :to="`/auctions/${win.auction.id}`" class="text-lg font-semibold underline">
              {{ win.auction.title }}
            </RouterLink>
            <p class="text-sm text-slate-600">
              Prix final :
              <strong data-testid="final-price">{{ formatPrice(win.finalPrice) }}</strong>
            </p>
          </div>
          <p class="text-sm font-semibold" data-testid="payment-status">{{ paymentLabel(win) }}</p>
        </li>
      </ul>
      <p
        v-if="state.data.items.some((win) => win.auction.status === 'ended')"
        class="text-sm text-slate-600"
      >
        Le paiement en ligne sera disponible prochainement.
      </p>

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
