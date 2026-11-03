<script setup lang="ts">
import {
  MAX_IMAGES,
  createAuctionInputSchema,
  type AuctionImage,
  type AuctionRules,
  type ManagedAuction,
} from '@encheres/shared'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Textarea from 'primevue/textarea'
import { computed, reactive, ref } from 'vue'
import { imageSrc, uploadImage } from '../api/images'
import { centsToInput, formatPrice, fromLocalInput, parseEuros, toLocalInput } from '../format'
import { validateForm, type FieldErrors } from '../forms/validate'
import { errorMessage } from '../i18n/errors'
import type { AuctionPayload } from './auction-payload'
import FormField from './FormField.vue'

const props = defineProps<{
  rules: AuctionRules
  /** Enchère à modifier ; absent pour une création. */
  auction?: ManagedAuction
  /** Enregistrement : lève l'erreur de l'API, que le formulaire affiche. */
  save: (values: AuctionPayload) => Promise<void>
}>()

const form = reactive({
  title: props.auction?.title ?? '',
  description: props.auction?.description ?? '',
  startingPrice: props.auction ? centsToInput(props.auction.startingPrice) : '',
  minIncrement: centsToInput(props.auction?.minIncrement ?? props.rules.defaultMinIncrement),
  startsAt: props.auction ? toLocalInput(props.auction.startsAt) : '',
  endsAt: props.auction ? toLocalInput(props.auction.endsAt) : '',
})
const images = ref<AuctionImage[]>(props.auction ? [...props.auction.images] : [])
const errors = ref<FieldErrors>({})
const serverError = ref<string | null>(null)
const uploadErrors = ref<string[]>([])
const uploading = ref(0)
const pending = ref(false)

const editsScheduled = computed(() => props.auction?.status === 'scheduled')
const hoursRange = computed(
  () => `${props.rules.minDurationMs / 3_600_000} h à ${props.rules.maxDurationMs / 86_400_000} j`,
)

async function onFiles(event: Event) {
  const input = event.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  input.value = ''
  uploadErrors.value = []

  const room = MAX_IMAGES - images.value.length - uploading.value
  if (files.length > room) {
    uploadErrors.value.push(
      `Vous pouvez ajouter ${Math.max(room, 0)} photo(s) de plus (maximum ${MAX_IMAGES}).`,
    )
  }
  await Promise.all(
    files.slice(0, Math.max(room, 0)).map(async (file) => {
      uploading.value += 1
      try {
        images.value.push(await uploadImage(file))
      } catch (error) {
        uploadErrors.value.push(`${file.name} : ${errorMessage(error)}`)
      } finally {
        uploading.value -= 1
      }
    }),
  )
}

function remove(index: number) {
  images.value.splice(index, 1)
}

function move(index: number, by: -1 | 1) {
  const target = index + by
  const moved = images.value[index]
  const other = images.value[target]
  if (moved === undefined || other === undefined) return
  images.value[index] = other
  images.value[target] = moved
}

async function submit() {
  serverError.value = null
  const startingPrice = parseEuros(form.startingPrice)
  const minIncrement = parseEuros(form.minIncrement)
  const startsAt = fromLocalInput(form.startsAt)
  const endsAt = fromLocalInput(form.endsAt)

  const messages = {
    title: 'Le titre doit faire entre 3 et 120 caractères.',
    description: 'Décrivez l’objet (5 000 caractères maximum).',
    images: 'Ajoutez entre 1 et 5 photos.',
    startingPrice: 'Le prix de départ doit être d’au moins 1 €.',
    minIncrement: 'Le pas minimum doit être d’au moins 0,01 €.',
    startsAt: 'Indiquez la date de début.',
    endsAt: 'Indiquez la date de fin.',
  }
  const result = validateForm(
    createAuctionInputSchema,
    {
      title: form.title,
      description: form.description,
      images: images.value.map((image) => image.key),
      startingPrice,
      minIncrement,
      startsAt,
      endsAt,
    },
    messages,
  )
  if ('errors' in result) {
    errors.value = result.errors
    return
  }

  // Règles qui dépendent de l'heure et des paramètres ; le serveur les revérifie.
  const problems: FieldErrors = {}
  const duration = result.data.endsAt.getTime() - result.data.startsAt.getTime()
  if (result.data.startsAt.getTime() <= Date.now()) {
    problems.startsAt = 'Le début doit être dans le futur.'
  }
  if (duration < props.rules.minDurationMs || duration > props.rules.maxDurationMs) {
    problems.endsAt = `La durée doit être comprise entre ${hoursRange.value}.`
  }
  errors.value = problems
  if (Object.keys(problems).length > 0) return

  pending.value = true
  try {
    await props.save({
      title: result.data.title,
      description: result.data.description,
      images: result.data.images,
      startingPrice: result.data.startingPrice,
      minIncrement: result.data.minIncrement ?? props.rules.defaultMinIncrement,
      startsAt: result.data.startsAt.toISOString(),
      endsAt: result.data.endsAt.toISOString(),
    })
  } catch (error) {
    serverError.value = errorMessage(error)
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <form class="space-y-5" novalidate @submit.prevent="submit">
    <Message v-if="editsScheduled" severity="warn" data-testid="rescheduled-warning">
      La modification renverra l’enchère en validation : elle ne sera plus publique jusqu’à sa
      nouvelle validation par l’administrateur.
    </Message>
    <Message v-if="serverError" severity="error" data-testid="form-error">{{
      serverError
    }}</Message>

    <FormField id="auction-title" label="Titre" :error="errors.title">
      <InputText
        id="auction-title"
        v-model="form.title"
        fluid
        maxlength="120"
        :invalid="!!errors.title"
      />
    </FormField>

    <FormField id="auction-description" label="Description" :error="errors.description">
      <Textarea
        id="auction-description"
        v-model="form.description"
        fluid
        rows="5"
        maxlength="5000"
        :invalid="!!errors.description"
      />
    </FormField>

    <fieldset class="space-y-2">
      <legend class="text-sm font-medium">Photos ({{ images.length }} sur {{ MAX_IMAGES }})</legend>
      <ul class="flex flex-wrap gap-3" data-testid="photo-list">
        <li
          v-for="(image, index) in images"
          :key="image.key"
          class="w-28 space-y-1 text-center"
          data-testid="photo"
        >
          <img
            :src="imageSrc(image.thumbUrl)"
            :alt="`Photo ${index + 1}`"
            class="aspect-square w-full rounded border border-slate-200 object-cover"
          />
          <div class="flex justify-center gap-1">
            <Button
              icon="pi pi-arrow-left"
              size="small"
              severity="secondary"
              text
              :disabled="index === 0"
              :aria-label="`Déplacer la photo ${index + 1} vers le début`"
              @click="move(index, -1)"
            />
            <Button
              icon="pi pi-arrow-right"
              size="small"
              severity="secondary"
              text
              :disabled="index === images.length - 1"
              :aria-label="`Déplacer la photo ${index + 1} vers la fin`"
              @click="move(index, 1)"
            />
            <Button
              icon="pi pi-trash"
              size="small"
              severity="danger"
              text
              :aria-label="`Retirer la photo ${index + 1}`"
              @click="remove(index)"
            />
          </div>
        </li>
        <li v-if="uploading > 0" class="text-sm text-slate-600" role="status">Envoi en cours…</li>
      </ul>
      <div v-if="images.length + uploading < MAX_IMAGES">
        <label for="auction-photos" class="block text-sm text-slate-700">
          Ajouter des photos (JPEG, PNG ou WebP, 5 Mo maximum chacune)
        </label>
        <input
          id="auction-photos"
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          data-testid="photo-input"
          @change="onFiles"
        />
      </div>
      <p v-if="errors.images" role="alert" class="text-sm text-red-700">{{ errors.images }}</p>
      <p v-for="message in uploadErrors" :key="message" role="alert" class="text-sm text-red-700">
        {{ message }}
      </p>
    </fieldset>

    <div class="grid gap-4 sm:grid-cols-2">
      <FormField
        id="auction-starting-price"
        label="Prix de départ (€)"
        :error="errors.startingPrice"
        hint="Au moins 1 €."
      >
        <InputText
          id="auction-starting-price"
          v-model="form.startingPrice"
          inputmode="decimal"
          fluid
          :invalid="!!errors.startingPrice"
        />
      </FormField>
      <FormField
        id="auction-min-increment"
        label="Pas minimum (€)"
        :error="errors.minIncrement"
        :hint="`Écart minimum entre deux offres (par défaut ${formatPrice(rules.defaultMinIncrement)}).`"
      >
        <InputText
          id="auction-min-increment"
          v-model="form.minIncrement"
          inputmode="decimal"
          fluid
          :invalid="!!errors.minIncrement"
        />
      </FormField>
      <FormField id="auction-starts-at" label="Début" :error="errors.startsAt">
        <input
          id="auction-starts-at"
          v-model="form.startsAt"
          type="datetime-local"
          class="w-full rounded border border-slate-300 px-3 py-2"
        />
      </FormField>
      <FormField
        id="auction-ends-at"
        label="Fin"
        :error="errors.endsAt"
        :hint="`Durée de ${hoursRange}.`"
      >
        <input
          id="auction-ends-at"
          v-model="form.endsAt"
          type="datetime-local"
          class="w-full rounded border border-slate-300 px-3 py-2"
        />
      </FormField>
    </div>

    <Button
      type="submit"
      :label="auction ? 'Enregistrer les modifications' : 'Créer l’enchère'"
      :loading="pending"
      :disabled="uploading > 0"
    />
  </form>
</template>
