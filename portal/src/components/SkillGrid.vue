<template>
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
    <SkillCard
      v-for="(skill, index) in skills"
      :key="skill.id"
      :skill="skill"
      :index="index"
      class="animate-fade-up"
      :style="{ animationDelay: `${Math.min(index, 8) * 0.05}s` }"
      @click="$emit('select', skill)"
      @download="$emit('download', $event)"
    />
  </div>
  <div
    v-if="skills.length === 0 && !loading"
    class="text-center py-16 text-text-secondary text-[15px]"
  >
    暂无匹配技能
  </div>
  <!-- Loading skeleton -->
  <div v-if="loading" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
    <div
      v-for="i in 8"
      :key="i"
      class="bg-white rounded-card border border-[rgba(0,0,0,0.04)] overflow-hidden h-[200px] animate-pulse"
    >
      <div class="p-5 space-y-3">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-surface-secondary rounded-icon"></div>
          <div class="flex-1 space-y-2">
            <div class="h-4 bg-surface-secondary rounded w-3/4"></div>
            <div class="h-3 bg-surface-secondary rounded w-1/2"></div>
          </div>
        </div>
        <div class="h-3 bg-surface-secondary rounded w-full"></div>
        <div class="h-3 bg-surface-secondary rounded w-2/3"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import SkillCard from './SkillCard.vue'

const props = defineProps({
  skills: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
})

defineEmits(['select', 'download'])
</script>
