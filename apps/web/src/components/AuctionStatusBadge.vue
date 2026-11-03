<script setup lang="ts">
import type { AuctionStatus } from '@encheres/shared'
import Tag from 'primevue/tag'
import { computed } from 'vue'

const props = defineProps<{ status: AuctionStatus }>()

const LABELS: Record<AuctionStatus, { label: string; severity: string }> = {
  draft: { label: 'En attente de validation', severity: 'warn' },
  scheduled: { label: 'À venir', severity: 'info' },
  live: { label: 'En direct', severity: 'success' },
  ended: { label: 'Terminée', severity: 'secondary' },
  paid: { label: 'Payée', severity: 'secondary' },
  unpaid: { label: 'Non payée', severity: 'secondary' },
  cancelled: { label: 'Annulée', severity: 'danger' },
}

const display = computed(() => LABELS[props.status])
</script>

<template>
  <Tag :value="display.label" :severity="display.severity" data-testid="status-badge" />
</template>
