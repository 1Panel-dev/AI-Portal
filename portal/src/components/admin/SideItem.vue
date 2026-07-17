<template>
  <router-link
    :to="to"
    :title="collapsed ? title : undefined"
    class="side-item group flex items-center rounded-[10px] no-underline transition-all duration-200 select-none relative"
    :class="[
      collapsed ? 'justify-center w-10 h-10 mx-auto' : 'gap-3 px-3 h-[42px]',
      active
        ? 'bg-[rgba(0,94,235,0.05)] text-accent'
        : 'text-text-secondary hover:bg-[rgba(0,0,0,0.03)] hover:text-text'
    ]"
  >
    <!-- Active indicator dot (collapsed) / bar (expanded) -->
    <span
      v-if="active && collapsed"
      class="absolute right-1.5 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-accent"
    ></span>
    <span
      v-if="active && !collapsed"
      class="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-accent"
    ></span>

    <!-- Icon -->
    <span
      class="inline-flex items-center justify-center flex-shrink-0 transition-colors duration-200"
      :class="active ? 'text-accent' : 'text-text-tertiary group-hover:text-text-secondary'"
    >
      <slot />
    </span>

    <!-- Label -->
    <span
      v-if="!collapsed"
      class="truncate text-[14px] leading-tight transition-all duration-200"
      :class="active ? 'font-semibold tracking-[-0.01em]' : 'font-normal'"
    >
      <slot name="label" />
    </span>
  </router-link>
</template>

<script setup>
defineProps({
  to: { type: [String, Object], required: true },
  active: { type: Boolean, default: false },
  collapsed: { type: Boolean, default: false },
  title: { type: String, default: '' },
})
</script>
