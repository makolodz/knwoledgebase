<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <footer class="border-t border-slate-200 bg-white">
    <div
      class="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-sm text-slate-600"
    >
      <p>© Enchères</p>
      <nav aria-label="Informations légales">
        <RouterLink to="/terms" class="underline">Conditions générales d'utilisation</RouterLink>
      </nav>
    </div>
  </footer>
</template>
