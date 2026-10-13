<script setup lang="ts">
import { updateProfileInputSchema } from '@encheres/shared'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import { ref } from 'vue'
import { trpc } from '../../api/trpc'
import { validateForm, type FieldErrors } from '../../forms/validate'
import { errorMessage } from '../../i18n/errors'
import { useAuthStore } from '../../stores/auth'
import FormField from '../FormField.vue'

const auth = useAuthStore()

const name = ref(auth.user?.name ?? '')
const errors = ref<FieldErrors>({})
const serverError = ref<string | null>(null)
const saved = ref(false)
const pending = ref(false)

async function submit() {
  serverError.value = null
  saved.value = false
  const result = validateForm(
    updateProfileInputSchema,
    { name: name.value },
    { name: 'Le nom d’affichage doit faire de 2 à 30 caractères.' },
  )
  if ('errors' in result) {
    errors.value = result.errors
    return
  }
  errors.value = {}

  pending.value = true
  try {
    const { user } = await trpc.profile.update.mutate(result.data)
    auth.setUser(user)
    name.value = user.name
    saved.value = true
  } catch (error) {
    serverError.value = errorMessage(error)
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <form class="space-y-3" novalidate @submit.prevent="submit">
    <h2 class="text-lg font-semibold">Nom d’affichage</h2>
    <Message v-if="serverError" severity="error">{{ serverError }}</Message>
    <Message v-if="saved" severity="success" data-testid="name-saved">Nom enregistré.</Message>

    <FormField id="profile-name" label="Nom visible des autres utilisateurs" :error="errors.name">
      <InputText
        id="profile-name"
        v-model="name"
        autocomplete="nickname"
        class="w-full"
        :invalid="Boolean(errors.name)"
      />
    </FormField>
    <Button type="submit" label="Enregistrer" :loading="pending" />
  </form>
</template>
