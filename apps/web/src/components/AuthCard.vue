<script setup lang="ts">
defineProps<{ title: string }>()
</script>

<template>
  <section
    class="mx-auto w-full max-w-md space-y-4 rounded-lg border border-slate-200 bg-white p-6"
  >
    <h1 class="text-2xl font-bold">{{ title }}</h1>
    <slot />
  </section>
</template>
