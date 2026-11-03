<script setup lang="ts">
import { bidAmountSchema, type BidErrorCode, type PublicAuction } from '@encheres/shared'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import { computed, ref, watch } from 'vue'
import { centsToInput, formatPrice, parseEuros } from '../format'
import { bidErrorMessage } from '../i18n/errors'
import FormField from './FormField.vue'

const props = defineProps<{
  auction: PublicAuction
  /** Connexion temps réel perdue ou compte à rebours terminé : on n'envoie rien. */
  disabled: boolean
  /** Envoie l'offre et renvoie la réponse du serveur. */
  place: (amount: number) => Promise<{ ok: true } | { ok: false; code: BidErrorCode }>
}>()

/** Au-delà de 10 fois le prix courant, on demande confirmation (docs/technical/screens.md). */
const CONFIRM_FACTOR = 10

const amount = ref(centsToInput(props.auction.nextMinBid))
const error = ref<string | null>(null)
const accepted = ref(false)
const pending = ref(false)
/** Le champ a été modifié à la main : on ne l'écrase plus quand le minimum change. */
const touched = ref(false)

const currentPrice = computed(() => props.auction.currentPrice ?? props.auction.startingPrice)

// Une nouvelle offre fait monter le minimum : le champ suit, sauf si l'utilisateur a saisi un
// montant plus haut.
watch(
  () => props.auction.nextMinBid,
  (min) => {
    const typed = parseEuros(amount.value)
    if (!touched.value || typed === null || typed < min) amount.value = centsToInput(min)
  },
)

function quick(steps: number) {
  touched.value = true
  amount.value = centsToInput(props.auction.nextMinBid + steps * props.auction.minIncrement)
}

async function submit() {
  error.value = null
  accepted.value = false
  const cents = parseEuros(amount.value)
  const parsed = bidAmountSchema.safeParse(cents)
  if (!parsed.success) {
    error.value = bidErrorMessage('INVALID_AMOUNT')
    return
  }
  if (parsed.data < props.auction.nextMinBid) {
    error.value = `Votre offre doit être d’au moins ${formatPrice(props.auction.nextMinBid)}.`
    return
  }
  if (
    parsed.data > currentPrice.value * CONFIRM_FACTOR &&
    !window.confirm(
      `Vous allez enchérir ${formatPrice(parsed.data)}, soit plus de ${CONFIRM_FACTOR} fois le prix actuel. Confirmer ?`,
    )
  ) {
    return
  }

  pending.value = true
  try {
    const result = await props.place(parsed.data)
    if (result.ok) {
      accepted.value = true
      touched.value = false
    } else {
      error.value = bidErrorMessage(result.code)
    }
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <form
    class="space-y-3 rounded-lg border border-slate-200 bg-white p-4"
    novalidate
    data-testid="bid-form"
    @submit.prevent="submit"
  >
    <FormField
      id="bid-amount"
      :label="`Votre offre (minimum ${formatPrice(auction.nextMinBid)})`"
      :error="error ?? undefined"
    >
      <InputText
        id="bid-amount"
        v-model="amount"
        inputmode="decimal"
        fluid
        :invalid="error !== null"
        :disabled="disabled"
        @input="touched = true"
      />
    </FormField>
    <div class="flex flex-wrap gap-2">
      <Button
        type="button"
        label="+1 pas"
        severity="secondary"
        size="small"
        :disabled="disabled"
        data-testid="quick-1"
        @click="quick(1)"
      />
      <Button
        type="button"
        label="+5 pas"
        severity="secondary"
        size="small"
        :disabled="disabled"
        data-testid="quick-5"
        @click="quick(5)"
      />
    </div>
    <Button
      type="submit"
      label="Enchérir"
      :loading="pending"
      :disabled="disabled"
      data-testid="bid-submit"
    />
    <Message v-if="accepted" severity="success" data-testid="bid-accepted">
      Votre offre est enregistrée.
    </Message>
  </form>
</template>
