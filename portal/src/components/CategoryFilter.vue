<template>
  <div class="flex justify-center gap-2 flex-wrap mb-5 animate-fade-up" style="animation-delay: 0.1s;">
    <button
      v-for="cat in categories"
      :key="cat.id"
      @click="$emit('select', cat.id)"
      class="px-4 py-[7px] rounded-full border-none text-[13px] font-medium cursor-pointer transition-all duration-150"
      :class="currentCategory === cat.id
        ? 'bg-text text-white'
        : 'bg-surface-secondary text-text hover:bg-[#e8e8ed]'"
    >
      {{ cat.name }}
    </button>
  </div>
</template>

<script setup>
import { categories } from '../data/categories.js'

defineProps({
  currentCategory: { type: String, default: 'all' },
})

defineEmits(['select'])
</script>
