<script setup lang="ts">
import { computed } from 'vue'
import { useRealtimeStore, type RealtimeStatus } from '../stores/realtime'

const store = useRealtimeStore()

const LABELS: Record<RealtimeStatus, string> = {
  connecting: 'connexion…',
  connected: 'connecté',
  disconnected: 'déconnecté',
  error: 'indisponible',
}
const DOT_CLASSES: Record<RealtimeStatus, string> = {
  connecting: 'bg-amber-500',
  connected: 'bg-emerald-500',
  disconnected: 'bg-slate-400',
  error: 'bg-red-500',
}

const label = computed(() => LABELS[store.status])
const dotClass = computed(() => DOT_CLASSES[store.status])
</script>

<template>
  <p class="flex items-center gap-2 text-sm" aria-live="polite">
    <span class="inline-block size-2.5 rounded-full" :class="dotClass" aria-hidden="true" />
    <span data-testid="realtime-status">Temps réel : {{ label }}</span>
  </p>
</template>
