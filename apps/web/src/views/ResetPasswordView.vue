<script setup lang="ts">
import { PASSWORD_MIN_LENGTH, resetPasswordInputSchema } from '@encheres/shared'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Password from 'primevue/password'
import { computed, reactive, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { errorCodeOf } from '../api/errors'
import { trpc } from '../api/trpc'
import AuthCard from '../components/AuthCard.vue'
import FormField from '../components/FormField.vue'
import { validateForm, type FieldErrors } from '../forms/validate'
import { errorMessage } from '../i18n/errors'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''))
const form = reactive({ password: '' })
const errors = ref<FieldErrors>({})
const serverError = ref<string | null>(null)
const pending = ref(false)
// Un lien sans token, ou refusé par le serveur : il faut en demander un nouveau.
const linkInvalid = ref(token.value === '')

async function submit() {
  serverError.value = null
  const result = validateForm(
    resetPasswordInputSchema,
    { token: token.value, password: form.password },
    {
      token: 'Ce lien est invalide.',
      password: `Le mot de passe doit faire de ${PASSWORD_MIN_LENGTH} à 128 caractères.`,
    },
  )
  if ('errors' in result) {
    errors.value = result.errors
    return
  }
  errors.value = {}

  pending.value = true
  try {
    await trpc.auth.resetPassword.mutate(result.data)
    // Toutes les sessions sont fermées par le serveur, y compris celle de cet onglet.
    auth.clear()
    await router.push({ name: 'login', query: { reset: '1' } })
  } catch (error) {
    if (errorCodeOf(error) === 'TOKEN_INVALID') linkInvalid.value = true
    else serverError.value = errorMessage(error)
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <AuthCard title="Nouveau mot de passe">
    <template v-if="linkInvalid">
      <Message severity="error" data-testid="reset-invalid">
        Ce lien est invalide, expiré ou déjà utilisé.
      </Message>
      <p class="text-sm">
        <RouterLink to="/forgot-password" class="underline">Demander un nouveau lien</RouterLink>
      </p>
    </template>

    <form v-else class="space-y-4" novalidate @submit.prevent="submit">
      <Message v-if="serverError" severity="error" data-testid="reset-error">
        {{ serverError }}
      </Message>

      <FormField id="reset-password" label="Nouveau mot de passe" :error="errors.password">
        <Password
          v-model="form.password"
          input-id="reset-password"
          autocomplete="new-password"
          :feedback="false"
          toggle-mask
          fluid
          :invalid="Boolean(errors.password)"
        />
        <p class="text-sm text-slate-600" aria-live="polite">
          {{ form.password.length }} / {{ PASSWORD_MIN_LENGTH }} caractères minimum
        </p>
      </FormField>

      <Button type="submit" label="Changer le mot de passe" class="w-full" :loading="pending" />
    </form>
  </AuthCard>
</template>
