<script setup lang="ts">
import Button from 'primevue/button'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import { computed, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { imageSrc } from '../api/images'
import AuctionStatusBadge from '../components/AuctionStatusBadge.vue'
import BidForm from '../components/BidForm.vue'
import BidHistory from '../components/BidHistory.vue'
import RealtimeIndicator from '../components/RealtimeIndicator.vue'
import { useAuctionSocket } from '../composables/useAuctionSocket'
import { useCountdown } from '../composables/useCountdown'
import { formatDateTime, formatPrice, formatRemaining } from '../format'
import { useAuthStore } from '../stores/auth'
import { useNow } from '../composables/now'

const route = useRoute()
const auth = useAuthStore()

const auctionId = computed(() => String(route.params.id))
const { state, auction, bids, connected, extended, placeBid, reload } = useAuctionSocket(auctionId)

const selected = ref(0)

const price = computed(() => auction.value?.currentPrice ?? auction.value?.startingPrice ?? 0)
const mainImage = computed(() => auction.value?.images[selected.value])
const endsAt = computed(() => auction.value?.endsAt)
const countdown = useCountdown(endsAt)
const now = useNow()
const untilStart = computed(() =>
  auction.value ? formatRemaining(new Date(auction.value.startsAt).getTime() - now.value) : '',
)

const isLive = computed(() => auction.value?.status === 'live')
const me = computed(() => auth.user)
const isSeller = computed(() => me.value !== null && me.value.id === auction.value?.sellerId)

/** Le meilleur enchérisseur est l'auteur de l'offre la plus récente de l'historique. */
const isHighest = computed(() => me.value !== null && bids.value[0]?.bidder.id === me.value.id)
const wasOutbid = computed(
  () =>
    me.value !== null &&
    !isHighest.value &&
    bids.value.some((bid) => bid.bidder.id === me.value?.id),
)

/** Raison pour laquelle le formulaire n'est pas proposé, ou `null` s'il l'est. */
const bidBlocker = computed<'login' | 'seller' | 'admin' | 'unverified' | null>(() => {
  if (me.value === null) return 'login'
  if (isSeller.value) return 'seller'
  if (me.value.role === 'admin') return 'admin'
  if (!me.value.emailVerified) return 'unverified'
  return null
})

const formDisabled = computed(() => !connected.value || countdown.finished.value)
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
      <Button label="Réessayer" severity="secondary" @click="reload" />
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
        <div class="flex flex-wrap items-center justify-between gap-2">
          <AuctionStatusBadge :status="auction.status" />
          <RealtimeIndicator />
        </div>
        <h1 class="text-2xl font-bold">{{ auction.title }}</h1>
        <p class="text-sm text-slate-600" data-testid="seller">
          Vendu par {{ auction.sellerName }}
        </p>

        <Message v-if="isLive && !connected" severity="warn" data-testid="reconnecting">
          Reconnexion en cours… Les offres sont suspendues jusqu’au retour de la connexion.
        </Message>

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
          <dd data-testid="bid-count">{{ auction.bidCount }}</dd>
          <template v-if="auction.status === 'scheduled'">
            <dt class="text-slate-600">Début</dt>
            <dd data-testid="starts-at">
              {{ formatDateTime(auction.startsAt) }}
              (dans <span class="font-mono">{{ untilStart }}</span
              >)
            </dd>
          </template>
          <template v-if="isLive">
            <dt class="text-slate-600">Fin dans</dt>
            <dd class="font-mono" aria-live="polite" data-testid="countdown">
              {{ countdown.text.value }}
            </dd>
          </template>
          <dt class="text-slate-600">Fin prévue</dt>
          <dd data-testid="ends-at">{{ formatDateTime(auction.endsAt) }}</dd>
        </dl>

        <Message v-if="extended" severity="info" data-testid="extended-notice">
          Enchère prolongée : une offre est arrivée en fin de course. Nouvelle fin à
          {{ formatDateTime(auction.endsAt) }}.
        </Message>

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

        <section
          v-if="['ended', 'paid', 'unpaid'].includes(auction.status)"
          class="space-y-2"
          data-testid="winner-note"
        >
          <p v-if="auction.winner === null">Terminée sans offre.</p>
          <p v-else-if="me !== null && auction.winner.id === me.id" class="font-semibold">
            Vous avez remporté cette enchère pour {{ formatPrice(price) }}.
            <RouterLink to="/account/wins" class="underline">Voir mes enchères gagnées</RouterLink>
          </p>
          <p v-else>
            Remportée par <strong>{{ auction.winner.name }}</strong> pour {{ formatPrice(price) }}.
          </p>
        </section>

        <template v-if="isLive">
          <Message v-if="isHighest" severity="success" data-testid="highest-note">
            Vous êtes le meilleur enchérisseur.
          </Message>
          <Message v-else-if="wasOutbid" severity="warn" data-testid="outbid-note">
            Vous avez été dépassé.
          </Message>
          <Message v-if="countdown.finished.value" severity="secondary" data-testid="time-up">
            Le compte à rebours est terminé : l’enchère va se clôturer.
          </Message>

          <p v-if="bidBlocker === 'login'" data-testid="login-to-bid">
            <RouterLink :to="{ name: 'login', query: { redirect: route.fullPath } }">
              <Button as="span" label="Se connecter pour enchérir" />
            </RouterLink>
          </p>
          <Message
            v-else-if="bidBlocker === 'seller'"
            severity="secondary"
            data-testid="seller-note"
          >
            Vous êtes le vendeur de cette enchère : vous ne pouvez pas y enchérir.
          </Message>
          <Message v-else-if="bidBlocker === 'admin'" severity="secondary" data-testid="admin-note">
            Les administrateurs n’enchérissent pas.
          </Message>
          <Message
            v-else-if="bidBlocker === 'unverified'"
            severity="warn"
            data-testid="unverified-note"
          >
            Vérifiez votre adresse email pour enchérir.
            <RouterLink to="/account" class="underline"
              >Renvoyer l’email de vérification</RouterLink
            >
          </Message>
          <BidForm v-else :auction="auction" :disabled="formDisabled" :place="placeBid" />
        </template>

        <section aria-labelledby="description-title" class="space-y-1">
          <h2 id="description-title" class="text-lg font-semibold">Description</h2>
          <!-- Texte brut : les retours à la ligne sont conservés, aucun HTML n'est interprété. -->
          <p class="whitespace-pre-line" data-testid="description">{{ auction.description }}</p>
        </section>

        <BidHistory :bids="bids" :current-user-id="me?.id" />
      </div>
    </article>
  </div>
</template>
