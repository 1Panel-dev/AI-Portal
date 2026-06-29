<template>
  <div class="max-w-[1024px] mx-auto px-6 mb-6">
    <div class="bg-white border border-[rgba(0,0,0,0.06)] rounded-2xl px-5 h-12 flex items-center gap-3 flex-wrap shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <!-- 结果计数 -->
      <div class="text-[13px] text-text-secondary shrink-0">
        共 <span class="font-semibold text-text">{{ total }}</span> 个结果
      </div>

      <!-- 弹性间隔: 左对齐计数,右对齐过滤项 -->
      <div class="flex-1"></div>

      <!-- 过滤项: 分类 -> 来源 -> 排序 (右对齐) -->
      <div class="flex items-center gap-2 shrink-0 flex-wrap">
        <FilterItem
          label="分类"
          :options="categories"
          :model-value="currentCategory"
          @update:model-value="$emit('update:category', $event)"
        />
        <FilterItem
          v-if="sources.length > 1"
          label="来源"
          :options="sources"
          :model-value="currentSource"
          @update:model-value="$emit('update:source', $event)"
        />
        <FilterItem
          label="排序"
          :options="sorts"
          :model-value="sortBy"
          @update:model-value="$emit('update:sort', $event)"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import FilterItem from './FilterItem.vue'
import { categories, sources, sorts } from '../data/categories.js'

defineProps({
  total: { type: Number, default: 0 },
  currentCategory: { type: String, default: 'all' },
  currentSource: { type: String, default: 'all' },
  sortBy: { type: String, default: 'default' },
})

defineEmits(['update:category', 'update:source', 'update:sort'])
</script>
