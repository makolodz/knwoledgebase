<script setup lang="ts">
import { PASSWORD_MIN_LENGTH, registerInputSchema } from '@encheres/shared'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Password from 'primevue/password'
import { reactive, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import AuthCard from '../components/AuthCard.vue'
import FormField from '../components/FormField.vue'
import { validateForm, type FieldErrors } from '../forms/validate'
import { errorMessage } from '../i18n/errors'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()

const form = reactive({
  email: '',
  name: '',
  password: '',
  acceptTerms: false,
  confirmAdult: false,
})
const errors = ref<FieldErrors>({})
const serverError = ref<string | null>(null)
const pending = ref(false)

async function submit() {
  serverError.value = null
  const result = validateForm(registerInputSchema, form, {
    email: 'Saisissez une adresse email valide.',
    name: 'Le nom d’affichage doit faire de 2 à 30 caractères.',
    password: `Le mot de passe doit faire de ${PASSWORD_MIN_LENGTH} à 128 caractères.`,
    acceptTerms: 'Vous devez accepter les conditions générales d’utilisation.',
    confirmAdult: 'Vous devez confirmer que vous êtes majeur.',
  })
  if ('errors' in result) {
    errors.value = result.errors
    return
  }
  errors.value = {}

  pending.value = true
  try {
    await auth.register(result.data)
    // Même réponse que l'adresse soit déjà utilisée ou non : personne n'est connecté (ADR-014).
    await router.push({ name: 'login', query: { registered: '1' } })
  } catch (error) {
    serverError.value = errorMessage(error)
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <AuthCard title="Créer un compte">
    <form class="space-y-4" novalidate @submit.prevent="submit">
      <Message v-if="serverError" severity="error" data-testid="register-error">
        {{ serverError }}
      </Message>

      <FormField id="register-email" label="Adresse email" :error="errors.email">
        <InputText
          id="register-email"
          v-model="form.email"
          type="email"
          autocomplete="email"
          class="w-full"
          :invalid="Boolean(errors.email)"
        />
      </FormField>

      <FormField
        id="register-name"
        label="Nom d’affichage"
        hint="Il est visible des autres utilisateurs."
        :error="errors.name"
      >
        <InputText
          id="register-name"
          v-model="form.name"
          autocomplete="nickname"
          class="w-full"
          :invalid="Boolean(errors.name)"
        />
      </FormField>

      <FormField id="register-password" label="Mot de passe" :error="errors.password">
        <Password
          v-model="form.password"
          input-id="register-password"
          autocomplete="new-password"
          :feedback="false"
          toggle-mask
          fluid
          :invalid="Boolean(errors.password)"
        />
        <p class="text-sm text-slate-600" aria-live="polite" data-testid="password-length">
          {{ form.password.length }} / {{ PASSWORD_MIN_LENGTH }} caractères minimum
        </p>
      </FormField>

      <div class="space-y-3">
        <div>
          <div class="flex items-start gap-2">
            <Checkbox v-model="form.acceptTerms" input-id="register-terms" binary />
            <label for="register-terms" class="text-sm">
              J’accepte les
              <RouterLink to="/terms" class="underline" target="_blank">
                conditions générales d’utilisation
              </RouterLink>
            </label>
          </div>
          <p v-if="errors.acceptTerms" role="alert" class="mt-1 text-sm text-red-700">
            {{ errors.acceptTerms }}
          </p>
        </div>

        <div>
          <div class="flex items-start gap-2">
            <Checkbox v-model="form.confirmAdult" input-id="register-adult" binary />
            <label for="register-adult" class="text-sm">Je confirme que je suis majeur</label>
          </div>
          <p v-if="errors.confirmAdult" role="alert" class="mt-1 text-sm text-red-700">
            {{ errors.confirmAdult }}
          </p>
        </div>
      </div>

      <Button type="submit" label="Créer mon compte" class="w-full" :loading="pending" />
    </form>

    <p class="text-sm">
      Déjà un compte ?
      <RouterLink to="/login" class="underline">Se connecter</RouterLink>
    </p>
  </AuthCard>
</template>
