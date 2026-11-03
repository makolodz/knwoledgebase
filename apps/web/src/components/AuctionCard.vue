<script setup lang="ts">
import type { PublicAuction } from '@encheres/shared'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { imageSrc } from '../api/images'
import { useNow } from '../composables/now'
import { formatDateTime, formatPrice, formatRemaining } from '../format'
import AuctionStatusBadge from './AuctionStatusBadge.vue'

const props = defineProps<{ auction: PublicAuction }>()

const now = useNow()
const price = computed(() => props.auction.currentPrice ?? props.auction.startingPrice)
const cover = computed(() => props.auction.images[0])
const remaining = computed(() =>
  formatRemaining(new Date(props.auction.endsAt).getTime() - now.value),
)
</script>

<template>
  <article
    class="flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white"
    data-testid="auction-card"
  >
    <RouterLink :to="`/auctions/${auction.id}`" class="flex flex-1 flex-col">
      <img
        v-if="cover"
        :src="imageSrc(cover.thumbUrl)"
        :alt="`Photo de ${auction.title}`"
        loading="lazy"
        class="aspect-[4/3] w-full bg-slate-100 object-cover"
      />
      <div class="flex flex-1 flex-col gap-2 p-3">
        <AuctionStatusBadge :status="auction.status" class="self-start" />
        <h2 class="text-lg font-semibold leading-tight">{{ auction.title }}</h2>
        <p class="text-xl font-bold" data-testid="card-price">
          {{ formatPrice(price) }}
          <span v-if="auction.currentPrice === null" class="text-sm font-normal text-slate-600">
            (départ)
          </span>
        </p>
        <p v-if="auction.status === 'live'" class="text-sm" data-testid="card-countdown">
          Fin dans <span class="font-mono">{{ remaining }}</span>
        </p>
        <p v-else-if="auction.status === 'scheduled'" class="text-sm">
          Début le {{ formatDateTime(auction.startsAt) }}
        </p>
        <p v-else class="text-sm">Terminée le {{ formatDateTime(auction.endsAt) }}</p>
        <p class="mt-auto text-sm text-slate-600">
          {{ auction.bidCount }} {{ auction.bidCount > 1 ? 'offres' : 'offre' }}
        </p>
      </div>
    </RouterLink>
  </article>
</template>
