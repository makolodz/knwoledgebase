<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <div class="space-y-3">
    <h1 class="text-2xl font-bold">Page introuvable</h1>
    <p>Cette page n'existe pas ou a été déplacée.</p>
    <RouterLink to="/" class="underline">Retour à l'accueil</RouterLink>
  </div>
</template>
