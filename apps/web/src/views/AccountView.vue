<script setup lang="ts">
import Button from 'primevue/button'
import Message from 'primevue/message'
import { computed, ref } from 'vue'
import { errorCodeOf } from '../api/errors'
import { trpc } from '../api/trpc'
import ChangeEmailForm from '../components/account/ChangeEmailForm.vue'
import ChangePasswordForm from '../components/account/ChangePasswordForm.vue'
import ProfileNameForm from '../components/account/ProfileNameForm.vue'
import { errorMessage } from '../i18n/errors'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()

const ROLE_LABELS = {
  admin: 'Administrateur',
  seller: 'Vendeur',
  buyer: 'Acheteur',
} as const

const roleLabel = computed(() => (auth.user ? ROLE_LABELS[auth.user.role] : ''))

const resend = ref<'idle' | 'pending' | 'sent' | { error: string }>('idle')

async function resendVerification() {
  resend.value = 'pending'
  try {
    const { status } = await trpc.auth.resendVerification.mutate()
    if (status === 'already_verified') {
      // Vérifiée entre-temps (autre onglet) : on met le statut à jour.
      auth.setUser((await trpc.auth.me.query()).user)
      resend.value = 'idle'
    } else {
      resend.value = 'sent'
    }
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
</script>

<template>
  <div v-if="auth.user" class="mx-auto w-full max-w-2xl space-y-8">
    <h1 class="text-2xl font-bold">Mon compte</h1>

    <section
      class="space-y-3 rounded-lg border border-slate-200 bg-white p-4"
      aria-labelledby="identity-title"
    >
      <h2 id="identity-title" class="text-lg font-semibold">Informations</h2>
      <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt class="text-slate-600">Adresse email</dt>
        <dd data-testid="account-email">{{ auth.user.email }}</dd>
        <dt class="text-slate-600">Statut</dt>
        <dd data-testid="account-verified">
          {{ auth.user.emailVerified ? 'Adresse vérifiée' : 'Adresse non vérifiée' }}
        </dd>
        <dt class="text-slate-600">Rôle</dt>
        <dd data-testid="account-role">{{ roleLabel }}</dd>
      </dl>

      <div v-if="!auth.user.emailVerified" class="space-y-2">
        <Message severity="warn">
          Vérifiez votre adresse email pour pouvoir enchérir : un lien vous a été envoyé à
          l’inscription.
        </Message>
        <Button
          label="Renvoyer l’email de vérification"
          severity="secondary"
          :loading="resend === 'pending'"
          @click="resendVerification"
        />
        <Message v-if="resend === 'sent'" severity="success" data-testid="resend-sent">
          Un nouveau lien vient d’être envoyé.
        </Message>
        <Message v-else-if="typeof resend === 'object'" severity="error" data-testid="resend-error">
          {{ resend.error }}
        </Message>
      </div>
    </section>

    <section class="rounded-lg border border-slate-200 bg-white p-4"><ProfileNameForm /></section>
    <section class="rounded-lg border border-slate-200 bg-white p-4"><ChangeEmailForm /></section>
    <section class="rounded-lg border border-slate-200 bg-white p-4">
      <ChangePasswordForm />
    </section>
  </div>
</template>
