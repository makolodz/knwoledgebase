<script setup lang="ts">
import type { BidRecord } from '@encheres/shared'
import { formatPrice } from '../format'

defineProps<{
  bids: BidRecord[]
  /** Identifiant de l'utilisateur connecté, pour repérer ses propres offres. */
  currentUserId?: string | undefined
}>()

const time = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'medium' })
</script>

<template>
  <section aria-labelledby="history-title" class="space-y-2">
    <h2 id="history-title" class="text-lg font-semibold">Historique des offres</h2>
    <p v-if="bids.length === 0" class="text-sm text-slate-600" data-testid="no-bids">
      Aucune offre pour le moment.
    </p>
    <ol v-else class="divide-y divide-slate-200 text-sm" data-testid="bid-history">
      <li
        v-for="bid in bids"
        :key="bid.id"
        class="flex items-baseline justify-between gap-3 py-1.5"
        data-testid="bid-row"
      >
        <span>
          {{ bid.bidder.name }}
          <span v-if="bid.bidder.id === currentUserId" class="text-teal-700">(vous)</span>
        </span>
        <span class="font-semibold">{{ formatPrice(bid.amount) }}</span>
        <time class="text-slate-600" :datetime="bid.at">{{ time.format(new Date(bid.at)) }}</time>
      </li>
    </ol>
  </section>
</template>
