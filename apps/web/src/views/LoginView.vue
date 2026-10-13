<script setup lang="ts">
import { loginInputSchema } from '@encheres/shared'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Password from 'primevue/password'
import { reactive, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AuthCard from '../components/AuthCard.vue'
import FormField from '../components/FormField.vue'
import { validateForm, type FieldErrors } from '../forms/validate'
import { errorMessage } from '../i18n/errors'
import { safeRedirect } from '../router/guards'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const form = reactive({ email: '', password: '' })
const errors = ref<FieldErrors>({})
const serverError = ref<string | null>(null)
const pending = ref(false)

// Messages venus des pages qui renvoient ici (inscription, réinitialisation du mot de passe).
const registered = route.query.registered !== undefined
const passwordReset = route.query.reset !== undefined

async function submit() {
  serverError.value = null
  const result = validateForm(loginInputSchema, form, {
    email: 'Saisissez une adresse email valide.',
    password: 'Saisissez votre mot de passe.',
  })
  if ('errors' in result) {
    errors.value = result.errors
    return
  }
  errors.value = {}

  pending.value = true
  try {
    await auth.login(result.data)
    await router.push(safeRedirect(route.query.redirect))
  } catch (error) {
    // Le message est le même pour un email inconnu et un mauvais mot de passe.
    serverError.value = errorMessage(error)
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <AuthCard title="Connexion">
    <Message v-if="registered" severity="success" data-testid="registered-notice">
      Compte créé : consultez votre boîte mail pour vérifier votre adresse, puis connectez-vous.
    </Message>
    <Message v-if="passwordReset" severity="success" data-testid="reset-notice">
      Mot de passe modifié. Connectez-vous avec le nouveau.
    </Message>

    <form class="space-y-4" novalidate @submit.prevent="submit">
      <Message v-if="serverError" severity="error" data-testid="login-error">
        {{ serverError }}
      </Message>

      <FormField id="login-email" label="Adresse email" :error="errors.email">
        <InputText
          id="login-email"
          v-model="form.email"
          type="email"
          autocomplete="email"
          class="w-full"
          :invalid="Boolean(errors.email)"
        />
      </FormField>

      <FormField id="login-password" label="Mot de passe" :error="errors.password">
        <Password
          v-model="form.password"
          input-id="login-password"
          autocomplete="current-password"
          :feedback="false"
          toggle-mask
          fluid
          :invalid="Boolean(errors.password)"
        />
      </FormField>

      <Button type="submit" label="Se connecter" class="w-full" :loading="pending" />
    </form>

    <p class="text-sm">
      <RouterLink to="/forgot-password" class="underline">Mot de passe oublié ?</RouterLink>
    </p>
    <p class="text-sm">
      Pas encore de compte ?
      <RouterLink to="/register" class="underline">Créer un compte</RouterLink>
    </p>
  </AuthCard>
</template>
