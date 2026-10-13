<script setup lang="ts">
import HealthStatus from '../components/HealthStatus.vue'
import RealtimeIndicator from '../components/RealtimeIndicator.vue'
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold">Enchères en direct</h1>
    <!-- Écran temporaire de l'étape 1 : la liste des enchères le remplace à l'étape 3. -->
    <div class="grid gap-4 sm:grid-cols-2">
      <HealthStatus />
      <section class="rounded-lg border border-slate-200 p-4" aria-labelledby="realtime-title">
        <h2 id="realtime-title" class="mb-3 text-lg font-semibold">Connexion temps réel</h2>
        <RealtimeIndicator />
      </section>
    </div>
  </div>
</template>
