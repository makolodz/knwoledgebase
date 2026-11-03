<script setup lang="ts">
import type { AuctionRules, ManagedAuction } from '@encheres/shared'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import { onMounted, reactive, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { errorCodeOf } from '../../api/errors'
import { trpc } from '../../api/trpc'
import FormField from '../../components/FormField.vue'
import { fromLocalInput, toLocalInput } from '../../format'
import type { FieldErrors } from '../../forms/validate'
import { errorMessage } from '../../i18n/errors'

const route = useRoute()
const router = useRouter()
const id = String(route.params.id)

const state = ref<
  | { kind: 'loading' }
  | { kind: 'notFound' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; auction: ManagedAuction; rules: AuctionRules }
>({ kind: 'loading' })

const form = reactive({ startsAt: '', endsAt: '' })
const errors = ref<FieldErrors>({})
const serverError = ref<string | null>(null)
const pending = ref(false)

const HOUR_MS = 3_600_000

/** Début dans une heure, même durée que l'enchère d'origine (ramenée dans les bornes autorisées). */
function suggestDates(auction: ManagedAuction, rules: AuctionRules) {
  const original = new Date(auction.endsAt).getTime() - new Date(auction.startsAt).getTime()
  const duration = Math.min(Math.max(original, rules.minDurationMs), rules.maxDurationMs)
  const start = Date.now() + HOUR_MS
  form.startsAt = toLocalInput(new Date(start).toISOString())
  form.endsAt = toLocalInput(new Date(start + duration).toISOString())
}

async function load() {
  state.value = { kind: 'loading' }
  try {
    const [auction, rules] = await Promise.all([
      trpc.auction.getMine.query({ id }),
      trpc.auction.rules.query(),
    ])
    suggestDates(auction, rules)
    state.value = { kind: 'ready', auction, rules }
  } catch (error) {
    const code = errorCodeOf(error)
    state.value =
      code === 'AUCTION_NOT_FOUND' || code === 'BAD_REQUEST'
        ? { kind: 'notFound' }
        : { kind: 'error', message: errorMessage(error) }
  }
}

async function submit() {
  if (state.value.kind !== 'ready') return
  serverError.value = null
  const { rules } = state.value
  const startsAt = fromLocalInput(form.startsAt)
  const endsAt = fromLocalInput(form.endsAt)

  const problems: FieldErrors = {}
  if (startsAt === null) problems.startsAt = 'Indiquez la date de début.'
  if (endsAt === null) problems.endsAt = 'Indiquez la date de fin.'
  if (startsAt !== null && endsAt !== null) {
    const duration = new Date(endsAt).getTime() - new Date(startsAt).getTime()
    if (new Date(startsAt).getTime() <= Date.now())
      problems.startsAt = 'Le début doit être dans le futur.'
    if (duration < rules.minDurationMs || duration > rules.maxDurationMs) {
      problems.endsAt = `La durée doit être comprise entre ${rules.minDurationMs / HOUR_MS} h et ${rules.maxDurationMs / (24 * HOUR_MS)} j.`
    }
  }
  errors.value = problems
  if (startsAt === null || endsAt === null || Object.keys(problems).length > 0) return

  pending.value = true
  try {
    await trpc.auction.relist.mutate({ id, startsAt, endsAt })
    await router.push({ path: '/seller/auctions', query: { saved: '1' } })
  } catch (error) {
    serverError.value = errorMessage(error)
  } finally {
    pending.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="mx-auto w-full max-w-xl space-y-4">
    <RouterLink to="/seller/auctions" class="text-sm underline">← Mes enchères</RouterLink>
    <h1 class="text-2xl font-bold">Remettre en vente</h1>

    <Skeleton v-if="state.kind === 'loading'" height="12rem" data-testid="skeleton" />
    <p v-else-if="state.kind === 'notFound'" data-testid="not-found">Enchère introuvable.</p>
    <div v-else-if="state.kind === 'error'" class="space-y-2">
      <Message severity="error" data-testid="load-error">{{ state.message }}</Message>
      <Button label="Réessayer" severity="secondary" @click="load" />
    </div>

    <form v-else class="space-y-4" novalidate @submit.prevent="submit">
      <p>
        Une copie de <strong>{{ state.auction.title }}</strong> sera créée, sans offres, avec les
        mêmes photos et les mêmes prix. L’enchère d’origine reste inchangée.
      </p>
      <Message severity="info">La copie devra être validée par l’administrateur.</Message>
      <Message v-if="serverError" severity="error" data-testid="form-error">{{
        serverError
      }}</Message>

      <FormField id="relist-starts-at" label="Nouveau début" :error="errors.startsAt">
        <input
          id="relist-starts-at"
          v-model="form.startsAt"
          type="datetime-local"
          class="w-full rounded border border-slate-300 px-3 py-2"
        />
      </FormField>
      <FormField id="relist-ends-at" label="Nouvelle fin" :error="errors.endsAt">
        <input
          id="relist-ends-at"
          v-model="form.endsAt"
          type="datetime-local"
          class="w-full rounded border border-slate-300 px-3 py-2"
        />
      </FormField>
      <Button
        type="submit"
        label="Remettre en vente"
        :loading="pending"
        data-testid="relist-submit"
      />
    </form>
  </div>
</template>
