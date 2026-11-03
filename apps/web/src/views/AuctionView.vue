<script setup lang="ts">
import type { PublicAuction } from '@encheres/shared'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { errorCodeOf } from '../api/errors'
import { imageSrc } from '../api/images'
import { trpc } from '../api/trpc'
import AuctionStatusBadge from '../components/AuctionStatusBadge.vue'
import { useNow } from '../composables/now'
import { formatDateTime, formatPrice, formatRemaining } from '../format'
import { errorMessage } from '../i18n/errors'

const route = useRoute()
const now = useNow()

const state = ref<
  | { kind: 'loading' }
  | { kind: 'notFound' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; auction: PublicAuction }
>({ kind: 'loading' })
const selected = ref(0)

async function load() {
  state.value = { kind: 'loading' }
  selected.value = 0
  try {
    const auction = await trpc.auction.get.query({ id: String(route.params.id) })
    state.value = { kind: 'ready', auction }
  } catch (error) {
    state.value =
      errorCodeOf(error) === 'AUCTION_NOT_FOUND' || errorCodeOf(error) === 'BAD_REQUEST'
        ? { kind: 'notFound' }
        : { kind: 'error', message: errorMessage(error) }
  }
}

onMounted(load)
watch(() => route.params.id, load)

const auction = computed(() => (state.value.kind === 'ready' ? state.value.auction : null))
const price = computed(() => auction.value?.currentPrice ?? auction.value?.startingPrice ?? 0)
const mainImage = computed(() => auction.value?.images[selected.value])
const untilStart = computed(() =>
  auction.value ? formatRemaining(new Date(auction.value.startsAt).getTime() - now.value) : '',
)
const untilEnd = computed(() =>
  auction.value ? formatRemaining(new Date(auction.value.endsAt).getTime() - now.value) : '',
)
</script>

<template>
  <div class="space-y-4">
    <RouterLink to="/" class="text-sm underline">← Retour aux enchères</RouterLink>

    <div v-if="state.kind === 'loading'" class="grid gap-6 md:grid-cols-2">
      <Skeleton height="20rem" data-testid="skeleton" />
      <Skeleton height="20rem" />
    </div>

    <div v-else-if="state.kind === 'notFound'" class="space-y-2" data-testid="not-found">
      <h1 class="text-2xl font-bold">Enchère introuvable</h1>
      <p>Cette enchère n’existe pas ou n’est pas encore publique.</p>
    </div>

    <div v-else-if="state.kind === 'error'" class="space-y-2">
      <Message severity="error" data-testid="detail-error">{{ state.message }}</Message>
      <Button label="Réessayer" severity="secondary" @click="load" />
    </div>

    <article v-else-if="auction" class="grid gap-6 md:grid-cols-2">
      <div class="space-y-2">
        <img
          v-if="mainImage"
          :src="imageSrc(mainImage.url)"
          :alt="`Photo ${selected + 1} de ${auction.title}`"
          class="aspect-[4/3] w-full rounded-lg bg-slate-100 object-contain"
          data-testid="main-image"
        />
        <ul v-if="auction.images.length > 1" class="flex flex-wrap gap-2" aria-label="Photos">
          <li v-for="(image, index) in auction.images" :key="image.key">
            <button
              type="button"
              class="rounded border-2"
              :class="index === selected ? 'border-teal-700' : 'border-transparent'"
              :aria-label="`Afficher la photo ${index + 1}`"
              :aria-current="index === selected"
              @click="selected = index"
            >
              <img :src="imageSrc(image.thumbUrl)" alt="" class="size-16 rounded object-cover" />
            </button>
          </li>
        </ul>
      </div>

      <div class="space-y-4">
        <AuctionStatusBadge :status="auction.status" />
        <h1 class="text-2xl font-bold">{{ auction.title }}</h1>
        <p class="text-sm text-slate-600" data-testid="seller">
          Vendu par {{ auction.sellerName }}
        </p>

        <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt class="text-slate-600">
            {{ auction.currentPrice === null ? 'Prix de départ' : 'Prix actuel' }}
          </dt>
          <dd class="text-xl font-bold" aria-live="polite" data-testid="price">
            {{ formatPrice(price) }}
          </dd>
          <dt class="text-slate-600">Offre minimale suivante</dt>
          <dd data-testid="next-min-bid">{{ formatPrice(auction.nextMinBid) }}</dd>
          <dt class="text-slate-600">Offres</dt>
          <dd>{{ auction.bidCount }}</dd>
          <template v-if="auction.status === 'scheduled'">
            <dt class="text-slate-600">Début</dt>
            <dd data-testid="starts-at">
              {{ formatDateTime(auction.startsAt) }}
              (dans <span class="font-mono">{{ untilStart }}</span
              >)
            </dd>
          </template>
          <template v-if="auction.status === 'live'">
            <dt class="text-slate-600">Fin dans</dt>
            <dd class="font-mono" aria-live="polite" data-testid="countdown">{{ untilEnd }}</dd>
          </template>
          <dt class="text-slate-600">Fin prévue</dt>
          <dd>{{ formatDateTime(auction.endsAt) }}</dd>
        </dl>

        <Message v-if="auction.status === 'scheduled'" severity="info" data-testid="scheduled-note">
          Cette enchère n’est pas encore ouverte aux offres.
        </Message>
        <Message
          v-else-if="['ended', 'paid', 'unpaid'].includes(auction.status)"
          severity="secondary"
          data-testid="ended-note"
        >
          Cette enchère est terminée.
        </Message>

        <section aria-labelledby="description-title" class="space-y-1">
          <h2 id="description-title" class="text-lg font-semibold">Description</h2>
          <!-- Texte brut : les retours à la ligne sont conservés, aucun HTML n'est interprété. -->
          <p class="whitespace-pre-line" data-testid="description">{{ auction.description }}</p>
        </section>
      </div>
    </article>
  </div>
</template>
