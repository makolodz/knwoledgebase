<script setup lang="ts">
import { changePasswordInputSchema, PASSWORD_MIN_LENGTH } from '@encheres/shared'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Password from 'primevue/password'
import { reactive, ref } from 'vue'
import { errorCodeOf } from '../../api/errors'
import { trpc } from '../../api/trpc'
import { validateForm, type FieldErrors } from '../../forms/validate'
import { errorMessage } from '../../i18n/errors'
import FormField from '../FormField.vue'

const form = reactive({ currentPassword: '', newPassword: '' })
const errors = ref<FieldErrors>({})
const serverError = ref<string | null>(null)
const changed = ref(false)
const pending = ref(false)

async function submit() {
  serverError.value = null
  changed.value = false
  const result = validateForm(changePasswordInputSchema, form, {
    currentPassword: 'Saisissez votre mot de passe actuel.',
    newPassword: `Le nouveau mot de passe doit faire de ${PASSWORD_MIN_LENGTH} à 128 caractères.`,
  })
  if ('errors' in result) {
    errors.value = result.errors
    return
  }
  errors.value = {}

  pending.value = true
  try {
    await trpc.profile.changePassword.mutate(result.data)
    form.currentPassword = ''
    form.newPassword = ''
    changed.value = true
  } catch (error) {
    // Ici, `INVALID_CREDENTIALS` veut dire « mot de passe actuel incorrect ».
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
    <h2 class="text-lg font-semibold">Mot de passe</h2>
    <Message v-if="serverError" severity="error">{{ serverError }}</Message>
    <Message v-if="changed" severity="success" data-testid="password-changed">
      Mot de passe modifié. Vos autres sessions ont été fermées.
    </Message>

    <FormField id="current-password" label="Mot de passe actuel" :error="errors.currentPassword">
      <Password
        v-model="form.currentPassword"
        input-id="current-password"
        autocomplete="current-password"
        :feedback="false"
        toggle-mask
        fluid
        :invalid="Boolean(errors.currentPassword)"
      />
    </FormField>

    <FormField id="new-password" label="Nouveau mot de passe" :error="errors.newPassword">
      <Password
        v-model="form.newPassword"
        input-id="new-password"
        autocomplete="new-password"
        :feedback="false"
        toggle-mask
        fluid
        :invalid="Boolean(errors.newPassword)"
      />
    </FormField>
    <Button type="submit" label="Changer le mot de passe" :loading="pending" />
  </form>
</template>
