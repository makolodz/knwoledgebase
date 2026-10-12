<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <header class="border-b border-slate-200 bg-white">
    <div class="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
      <RouterLink to="/" class="text-xl font-bold tracking-tight">Enchères</RouterLink>
      <!-- Recherche (étape 3), connexion et inscription (étape 2) : ajoutées avec leurs pages. -->
      <nav aria-label="Navigation principale" />
    </div>
  </header>
</template>
