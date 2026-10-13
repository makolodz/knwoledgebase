<script setup lang="ts">
defineProps<{
  /** Identifiant du contrôle : le `<label>` y est rattaché. */
  id: string
  label: string
  error?: string | undefined
  hint?: string
}>()
</script>

<template>
  <div class="space-y-1">
    <label :for="id" class="block text-sm font-medium">{{ label }}</label>
    <slot />
    <p v-if="hint && !error" :id="`${id}-hint`" class="text-sm text-slate-600">{{ hint }}</p>
    <p v-if="error" :id="`${id}-error`" role="alert" class="text-sm text-red-700">{{ error }}</p>
  </div>
</template>
