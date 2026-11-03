<script setup lang="ts">
import type { ManagedAuction, Page } from '@encheres/shared'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import Textarea from 'primevue/textarea'
import { onMounted, ref } from 'vue'
import { imageSrc } from '../../api/images'
import { trpc } from '../../api/trpc'
import { formatDateTime, formatPrice } from '../../format'
import { errorMessage } from '../../i18n/errors'

const state = ref<
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: Page<ManagedAuction> }
>({ kind: 'loading' })

/** Enchère dont on saisit le motif de refus, et le motif en cours de saisie. */
const rejecting = ref<string | null>(null)
const reason = ref('')
const busy = ref<string | null>(null)
const notice = ref<string | null>(null)
const actionError = ref<string | null>(null)

async function load() {
  state.value = { kind: 'loading' }
  try {
    state.value = {
      kind: 'ready',
      data: await trpc.admin.pendingAuctions.query({ page: 1, limit: 20 }),
    }
  } catch (error) {
    state.value = { kind: 'error', message: errorMessage(error) }
  }
}

async function run(auction: ManagedAuction, action: () => Promise<unknown>, done: string) {
  actionError.value = null
  notice.value = null
  busy.value = auction.id
  try {
    await action()
    notice.value = done
    rejecting.value = null
    reason.value = ''
    await load()
  } catch (error) {
    actionError.value = errorMessage(error)
  } finally {
    busy.value = null
  }
}

const validate = (auction: ManagedAuction) =>
  run(
    auction,
    () => trpc.admin.validate.mutate({ id: auction.id }),
    `« ${auction.title} » validée.`,
  )

function reject(auction: ManagedAuction) {
  if (reason.value.trim() === '') {
    actionError.value = 'Indiquez le motif du refus.'
    return
  }
  return run(
    auction,
    () => trpc.admin.reject.mutate({ id: auction.id, reason: reason.value }),
    `« ${auction.title} » refusée.`,
  )
}

function startRejecting(auction: ManagedAuction) {
  rejecting.value = auction.id
  reason.value = ''
  actionError.value = null
}

onMounted(load)
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold">Enchères à valider</h1>

    <Message v-if="notice" severity="success" data-testid="notice">{{ notice }}</Message>
    <Message v-if="actionError" severity="error" data-testid="action-error">
      {{ actionError }}
    </Message>

    <Skeleton v-if="state.kind === 'loading'" height="12rem" data-testid="skeleton" />

    <div v-else-if="state.kind === 'error'" class="space-y-2">
      <Message severity="error" data-testid="list-error">{{ state.message }}</Message>
      <Button label="Réessayer" severity="secondary" @click="load" />
    </div>

    <template v-else>
      <p v-if="state.data.items.length === 0" data-testid="list-empty">
        Aucune enchère en attente de validation.
      </p>
      <ul v-else class="space-y-6">
        <li
          v-for="auction in state.data.items"
          :key="auction.id"
          class="space-y-3 rounded-lg border border-slate-200 bg-white p-4"
          data-testid="pending-auction"
        >
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h2 class="text-lg font-semibold">{{ auction.title }}</h2>
            <p class="text-sm text-slate-600">Vendeur : {{ auction.sellerName }}</p>
          </div>

          <ul class="flex flex-wrap gap-2" aria-label="Photos">
            <li v-for="(image, index) in auction.images" :key="image.key">
              <a :href="imageSrc(image.url)" target="_blank" rel="noopener">
                <img
                  :src="imageSrc(image.thumbUrl)"
                  :alt="`Photo ${index + 1} de ${auction.title}`"
                  class="size-24 rounded border border-slate-200 object-cover"
                />
              </a>
            </li>
          </ul>

          <p class="whitespace-pre-line text-sm">{{ auction.description }}</p>

          <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt class="text-slate-600">Prix de départ</dt>
            <dd>{{ formatPrice(auction.startingPrice) }}</dd>
            <dt class="text-slate-600">Pas minimum</dt>
            <dd>{{ formatPrice(auction.minIncrement) }}</dd>
            <dt class="text-slate-600">Début</dt>
            <dd>{{ formatDateTime(auction.startsAt) }}</dd>
            <dt class="text-slate-600">Fin</dt>
            <dd>{{ formatDateTime(auction.endsAt) }}</dd>
          </dl>

          <div v-if="rejecting === auction.id" class="space-y-2">
            <label :for="`reason-${auction.id}`" class="block text-sm font-medium">
              Motif du refus (montré au vendeur)
            </label>
            <Textarea
              :id="`reason-${auction.id}`"
              v-model="reason"
              fluid
              rows="3"
              maxlength="500"
              data-testid="reason"
            />
            <div class="flex gap-2">
              <Button
                label="Confirmer le refus"
                severity="danger"
                :loading="busy === auction.id"
                data-testid="confirm-reject"
                @click="reject(auction)"
              />
              <Button label="Annuler" severity="secondary" text @click="rejecting = null" />
            </div>
          </div>
          <div v-else class="flex gap-2">
            <Button
              label="Valider"
              :loading="busy === auction.id"
              data-testid="validate"
              @click="validate(auction)"
            />
            <Button
              label="Refuser"
              severity="danger"
              outlined
              data-testid="reject"
              @click="startRejecting(auction)"
            />
          </div>
        </li>
      </ul>
    </template>
  </div>
</template>
