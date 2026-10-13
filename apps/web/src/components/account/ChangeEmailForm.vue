<script setup lang="ts">
import { changeEmailInputSchema } from '@encheres/shared'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Password from 'primevue/password'
import { reactive, ref } from 'vue'
import { errorCodeOf } from '../../api/errors'
import { trpc } from '../../api/trpc'
import { validateForm, type FieldErrors } from '../../forms/validate'
import { errorMessage } from '../../i18n/errors'
import FormField from '../FormField.vue'

const form = reactive({ currentPassword: '', newEmail: '' })
const errors = ref<FieldErrors>({})
const serverError = ref<string | null>(null)
const requested = ref(false)
const pending = ref(false)

async function submit() {
  serverError.value = null
  requested.value = false
  const result = validateForm(changeEmailInputSchema, form, {
    currentPassword: 'Saisissez votre mot de passe actuel.',
    newEmail: 'Saisissez une adresse email valide.',
  })
  if ('errors' in result) {
    errors.value = result.errors
    return
  }
  errors.value = {}

  pending.value = true
  try {
    await trpc.profile.changeEmail.mutate(result.data)
    form.currentPassword = ''
    form.newEmail = ''
    requested.value = true
  } catch (error) {
    if (errorCodeOf(error) === 'INVALID_CREDENTIALS') {
      errors.value = { currentPassword: 'Mot de passe actuel incorrect.' }
    } else {
      serverError.value = errorMessage(error)
    }
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <form class="space-y-3" novalidate @submit.prevent="submit">
    <h2 class="text-lg font-semibold">Adresse email</h2>
    <Message v-if="serverError" severity="error">{{ serverError }}</Message>
    <!-- Même message que la nouvelle adresse soit libre ou non (docs/domain/workflows/account.md). -->
    <Message v-if="requested" severity="success" data-testid="email-change-requested">
      Si cette adresse est disponible, un lien de confirmation vient d’y être envoyé. Votre adresse
      actuelle ne change qu’après le clic sur ce lien.
    </Message>

    <FormField id="change-email-new" label="Nouvelle adresse email" :error="errors.newEmail">
      <InputText
        id="change-email-new"
        v-model="form.newEmail"
        type="email"
        autocomplete="email"
        class="w-full"
        :invalid="Boolean(errors.newEmail)"
      />
    </FormField>

    <FormField
      id="change-email-password"
      label="Mot de passe actuel"
      :error="errors.currentPassword"
    >
      <Password
        v-model="form.currentPassword"
        input-id="change-email-password"
        autocomplete="current-password"
        :feedback="false"
        toggle-mask
        fluid
        :invalid="Boolean(errors.currentPassword)"
      />
    </FormField>
    <Button type="submit" label="Changer d’adresse" :loading="pending" />
  </form>
</template>
