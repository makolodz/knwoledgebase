<script setup lang="ts">
import { forgotPasswordInputSchema } from '@encheres/shared'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import { reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { trpc } from '../api/trpc'
import AuthCard from '../components/AuthCard.vue'
import FormField from '../components/FormField.vue'
import { validateForm, type FieldErrors } from '../forms/validate'
import { errorMessage } from '../i18n/errors'

const form = reactive({ email: '' })
const errors = ref<FieldErrors>({})
const serverError = ref<string | null>(null)
const pending = ref(false)
const sent = ref(false)

async function submit() {
  serverError.value = null
  const result = validateForm(forgotPasswordInputSchema, form, {
    email: 'Saisissez une adresse email valide.',
  })
  if ('errors' in result) {
    errors.value = result.errors
    return
  }
  errors.value = {}

  pending.value = true
  try {
    await trpc.auth.forgotPassword.mutate(result.data)
    sent.value = true
  } catch (error) {
    serverError.value = errorMessage(error)
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <AuthCard title="Mot de passe oublié">
    <!-- Même message que l'adresse ait un compte ou non (docs/domain/workflows/account.md). -->
    <Message v-if="sent" severity="success" data-testid="forgot-sent">
      Si cette adresse correspond à un compte, un email contenant un lien de réinitialisation vient
      d’être envoyé. Le lien est valable 1 heure.
    </Message>

    <form v-else class="space-y-4" novalidate @submit.prevent="submit">
      <p class="text-sm text-slate-600">
        Saisissez l’adresse de votre compte : nous vous enverrons un lien pour choisir un nouveau
        mot de passe.
      </p>
      <Message v-if="serverError" severity="error" data-testid="forgot-error">
        {{ serverError }}
      </Message>

      <FormField id="forgot-email" label="Adresse email" :error="errors.email">
        <InputText
          id="forgot-email"
          v-model="form.email"
          type="email"
          autocomplete="email"
          class="w-full"
          :invalid="Boolean(errors.email)"
        />
      </FormField>

      <Button type="submit" label="Envoyer le lien" class="w-full" :loading="pending" />
    </form>

    <p class="text-sm">
      <RouterLink to="/login" class="underline">Retour à la connexion</RouterLink>
    </p>
  </AuthCard>
</template>
