<script setup lang="ts">
import {
  AUCTION_STATUSES,
  type AuctionStatus,
  type ManagedAuction,
  type Page,
} from '@encheres/shared'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import { onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { trpc } from '../../api/trpc'
import AuctionStatusBadge from '../../components/AuctionStatusBadge.vue'
import { formatDateTime, formatPrice } from '../../format'
import { errorMessage } from '../../i18n/errors'

const STATUS_LABELS: Record<AuctionStatus, string> = {
  draft: 'En attente de validation',
  scheduled: 'À venir',
  live: 'En direct',
  ended: 'Terminée',
  paid: 'Payée',
  unpaid: 'Non payée',
  cancelled: 'Annulée',
}

const PAGE_SIZE = 20

// Renseigné par la page d'enregistrement après une création ou une modification.
const saved = useRoute().query.saved !== undefined

const status = ref<AuctionStatus | ''>('')
const page = ref(1)
const state = ref<
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: Page<ManagedAuction> }
>({ kind: 'loading' })
const actionError = ref<string | null>(null)
const cancelling = ref<string | null>(null)

async function load() {
  state.value = { kind: 'loading' }
  try {
    const data = await trpc.auction.mine.query({
      page: page.value,
      limit: PAGE_SIZE,
      ...(status.value === '' ? {} : { status: status.value }),
    })
    state.value = { kind: 'ready', data }
  } catch (error) {
    state.value = { kind: 'error', message: errorMessage(error) }
  }
}

async function cancel(auction: ManagedAuction) {
  if (!window.confirm(`Annuler l’enchère « ${auction.title} » ?`)) return
  actionError.value = null
  cancelling.value = auction.id
  try {
    await trpc.auction.cancel.mutate({ id: auction.id })
    await load()
  } catch (error) {
    actionError.value = errorMessage(error)
  } finally {
    cancelling.value = null
  }
}

const canEdit = (auction: ManagedAuction) => ['draft', 'scheduled'].includes(auction.status)

watch(status, () => {
  if (page.value !== 1) page.value = 1
  else void load()
})
watch(page, load)
onMounted(load)
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-bold">Mes enchères</h1>
      <RouterLink to="/seller/auctions/new" data-testid="new-auction">
        <Button label="Créer une enchère" as="span" />
      </RouterLink>
    </div>

    <Message v-if="saved" severity="success" data-testid="saved-notice">
      Enchère enregistrée. Elle est en attente de validation par l’administrateur.
    </Message>

    <label class="flex items-center gap-2 text-sm">
      Statut
      <select
        v-model="status"
        class="rounded border border-slate-300 bg-white px-2 py-1"
        data-testid="status-filter"
      >
        <option value="">Tous</option>
        <option v-for="value in AUCTION_STATUSES" :key="value" :value="value">
          {{ STATUS_LABELS[value] }}
        </option>
      </select>
    </label>

    <Message v-if="actionError" severity="error" data-testid="action-error">
      {{ actionError }}
    </Message>

    <Skeleton v-if="state.kind === 'loading'" height="10rem" data-testid="skeleton" />

    <div v-else-if="state.kind === 'error'" class="space-y-2">
      <Message severity="error" data-testid="list-error">{{ state.message }}</Message>
      <Button label="Réessayer" severity="secondary" @click="load" />
    </div>

    <template v-else>
      <p v-if="state.data.items.length === 0" data-testid="list-empty">
        Vous n’avez encore aucune enchère.
      </p>
      <div v-else class="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table class="w-full text-left text-sm">
          <thead class="bg-slate-100">
            <tr>
              <th scope="col" class="p-2">Titre</th>
              <th scope="col" class="p-2">Statut</th>
              <th scope="col" class="p-2">Prix</th>
              <th scope="col" class="p-2">Offres</th>
              <th scope="col" class="p-2">Dates</th>
              <th scope="col" class="p-2"><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="auction in state.data.items"
              :key="auction.id"
              class="border-t border-slate-200 align-top"
              data-testid="auction-row"
            >
              <td class="p-2 font-medium">{{ auction.title }}</td>
              <td class="space-y-1 p-2">
                <AuctionStatusBadge :status="auction.status" />
                <p
                  v-if="auction.status === 'cancelled' && auction.cancelReason"
                  class="max-w-xs text-red-700"
                  data-testid="cancel-reason"
                >
                  Motif : {{ auction.cancelReason }}
                </p>
              </td>
              <td class="p-2">{{ formatPrice(auction.currentPrice ?? auction.startingPrice) }}</td>
              <td class="p-2">{{ auction.bidCount }}</td>
              <td class="p-2">
                {{ formatDateTime(auction.startsAt) }}<br />
                {{ formatDateTime(auction.endsAt) }}
              </td>
              <td class="space-x-2 p-2 whitespace-nowrap">
                <RouterLink
                  v-if="auction.status !== 'draft' && auction.status !== 'cancelled'"
                  :to="`/auctions/${auction.id}`"
                  class="underline"
                >
                  Voir
                </RouterLink>
                <RouterLink
                  v-if="canEdit(auction)"
                  :to="`/seller/auctions/${auction.id}/edit`"
                  class="underline"
                  data-testid="edit"
                >
                  Modifier
                </RouterLink>
                <Button
                  v-if="canEdit(auction)"
                  label="Annuler"
                  severity="danger"
                  size="small"
                  text
                  :loading="cancelling === auction.id"
                  data-testid="cancel"
                  @click="cancel(auction)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

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
