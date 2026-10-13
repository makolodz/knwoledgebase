<script setup lang="ts">
import Button from 'primevue/button'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import { onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { errorCodeOf } from '../api/errors'
import { trpc } from '../api/trpc'
import AuthCard from '../components/AuthCard.vue'
import { errorMessage } from '../i18n/errors'
import { useAuthStore } from '../stores/auth'

type State =
  | { kind: 'loading' }
  | { kind: 'success'; emailChange: boolean }
  | { kind: 'invalid' }
  | { kind: 'error'; message: string }

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const state = ref<State>({ kind: 'loading' })
const resend = ref<'idle' | 'pending' | 'sent' | { error: string }>('idle')

async function confirm() {
  const token = typeof route.query.token === 'string' ? route.query.token : ''
  // Le lien de changement d'adresse porte `kind=email-change` (docs/technical/screens.md).
  const emailChange = route.query.kind === 'email-change'
  if (token === '') {
    state.value = { kind: 'invalid' }
    return
  }

  await auth.load()
  if (emailChange && auth.user === null) {
    // Ce lien modifie le compte connecté : on revient ici après la connexion.
    await router.replace({ name: 'login', query: { redirect: route.fullPath } })
    return
  }

  try {
    if (emailChange) {
      auth.setUser((await trpc.profile.confirmEmailChange.mutate({ token })).user)
    } else {
      await trpc.auth.verifyEmail.mutate({ token })
      // Connecté dans cet onglet : on met à jour le statut « vérifié » affiché dans l'en-tête.
      if (auth.user !== null) auth.setUser((await trpc.auth.me.query()).user)
    }
    state.value = { kind: 'success', emailChange }
  } catch (error) {
    state.value =
      errorCodeOf(error) === 'TOKEN_INVALID'
        ? { kind: 'invalid' }
        : { kind: 'error', message: errorMessage(error) }
  }
}

async function resendLink() {
  resend.value = 'pending'
  try {
    await trpc.auth.resendVerification.mutate()
    resend.value = 'sent'
  } catch (error) {
    resend.value =
      errorCodeOf(error) === 'RATE_LIMITED'
        ? {
            error:
              'Un lien vient d’être envoyé. Patientez une minute avant d’en demander un autre.',
          }
        : { error: errorMessage(error) }
  }
}

onMounted(confirm)
</script>

<template>
  <AuthCard title="Vérification de l’adresse email">
    <div v-if="state.kind === 'loading'" data-testid="verify-loading" class="space-y-2">
      <Skeleton width="100%" height="1.25rem" />
      <Skeleton width="60%" height="1rem" />
    </div>

    <template v-else-if="state.kind === 'success'">
      <Message severity="success" data-testid="verify-success">
        {{
          state.emailChange
            ? 'Votre nouvelle adresse est confirmée : elle remplace l’ancienne.'
            : 'Votre adresse email est vérifiée. Vous pouvez désormais enchérir.'
        }}
      </Message>
      <p class="text-sm">
        <RouterLink :to="auth.user ? '/account' : '/login'" class="underline">
          {{ auth.user ? 'Aller à mon compte' : 'Se connecter' }}
        </RouterLink>
      </p>
    </template>

    <template v-else-if="state.kind === 'invalid'">
      <Message v-if="auth.user?.emailVerified" severity="info" data-testid="verify-already">
        Votre adresse email est déjà vérifiée.
      </Message>
      <template v-else>
        <Message severity="error" data-testid="verify-invalid">
          Ce lien est invalide, expiré ou déjà utilisé.
        </Message>
        <div v-if="auth.user" class="space-y-2">
          <Button
            label="Recevoir un nouveau lien"
            :loading="resend === 'pending'"
            @click="resendLink"
          />
          <Message v-if="resend === 'sent'" severity="success" data-testid="verify-resent">
            Un nouveau lien vient d’être envoyé.
          </Message>
          <Message v-else-if="typeof resend === 'object'" severity="error">
            {{ resend.error }}
          </Message>
        </div>
        <p v-else class="text-sm">
          <RouterLink to="/login" class="underline">
            Connectez-vous pour recevoir un nouveau lien.
          </RouterLink>
        </p>
      </template>
    </template>

    <template v-else>
      <Message severity="error" data-testid="verify-error">{{ state.message }}</Message>
      <Button label="Réessayer" severity="secondary" @click="confirm" />
    </template>
  </AuthCard>
</template>
