<script setup lang="ts">
import type { AuctionRules, ManagedAuction } from '@encheres/shared'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { errorCodeOf } from '../../api/errors'
import { trpc } from '../../api/trpc'
import type { AuctionPayload } from '../../components/auction-payload'
import AuctionForm from '../../components/AuctionForm.vue'
import { errorMessage } from '../../i18n/errors'

const route = useRoute()
const router = useRouter()

/** Absent de l'adresse : création ; présent : modification de cette enchère. */
const id = computed(() => (typeof route.params.id === 'string' ? route.params.id : null))

const state = ref<
  | { kind: 'loading' }
  | { kind: 'notFound' }
  | { kind: 'locked' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; rules: AuctionRules; auction?: ManagedAuction }
>({ kind: 'loading' })

async function load() {
  state.value = { kind: 'loading' }
  try {
    const [rules, auction] = await Promise.all([
      trpc.auction.rules.query(),
      id.value === null ? Promise.resolve(undefined) : trpc.auction.getMine.query({ id: id.value }),
    ])
    if (auction !== undefined && !['draft', 'scheduled'].includes(auction.status)) {
      state.value = { kind: 'locked' }
    } else {
      state.value =
        auction === undefined ? { kind: 'ready', rules } : { kind: 'ready', rules, auction }
    }
  } catch (error) {
    const code = errorCodeOf(error)
    state.value =
      code === 'AUCTION_NOT_FOUND' || code === 'BAD_REQUEST'
        ? { kind: 'notFound' }
        : { kind: 'error', message: errorMessage(error) }
  }
}

async function save(values: AuctionPayload) {
  if (id.value === null) await trpc.auction.create.mutate(values)
  else await trpc.auction.update.mutate({ id: id.value, ...values })
  await router.push({ path: '/seller/auctions', query: { saved: '1' } })
}

onMounted(load)
</script>

<template>
  <div class="mx-auto w-full max-w-3xl space-y-4">
    <RouterLink to="/seller/auctions" class="text-sm underline">← Mes enchères</RouterLink>
    <h1 class="text-2xl font-bold">
      {{ id === null ? 'Nouvelle enchère' : 'Modifier l’enchère' }}
    </h1>

    <Skeleton v-if="state.kind === 'loading'" height="20rem" data-testid="skeleton" />

    <p v-else-if="state.kind === 'notFound'" data-testid="not-found">Enchère introuvable.</p>

    <Message v-else-if="state.kind === 'locked'" severity="warn" data-testid="locked">
      Cette enchère ne peut plus être modifiée.
    </Message>

    <div v-else-if="state.kind === 'error'" class="space-y-2">
      <Message severity="error" data-testid="load-error">{{ state.message }}</Message>
      <Button label="Réessayer" severity="secondary" @click="load" />
    </div>

    <template v-else>
      <Message v-if="state.auction?.cancelReason" severity="info" data-testid="previous-reason">
        Motif du refus précédent : {{ state.auction.cancelReason }}
      </Message>
      <AuctionForm :rules="state.rules" :auction="state.auction" :save="save" />
      <p class="text-sm text-slate-600">
        L’enchère est enregistrée en attente de validation : elle devient publique une fois validée
        par l’administrateur.
      </p>
    </template>
  </div>
</template>
