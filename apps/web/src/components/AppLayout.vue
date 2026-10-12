<script setup lang="ts">
import { RouterView } from 'vue-router'
import AppFooter from './AppFooter.vue'
import AppHeader from './AppHeader.vue'
</script>

<template>
  <div class="flex min-h-screen flex-col bg-slate-50 text-slate-900">
    <AppHeader />
    <main class="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
      <RouterView />
    </main>
    <AppFooter />
  </div>
</template>
