<template>
  <div
    ref="rootStrip"
    :class="['root-strip', { 'is-dragging': isDragging }]"
    aria-label="根图切换条"
    @pointerdown="handlePointerDown"
    @dragstart.prevent
  >
    <button
      v-for="family in familyViews"
      :key="family.rootId"
      type="button"
      :class="['root-chip', { active: family.rootId === activeRootId }]"
      :data-genealogy-root-id="family.rootId"
      @click="activateFamily(family.rootId)"
    >
      <img v-if="family.coverUrl" :src="family.coverUrl" alt="" loading="lazy" decoding="async" draggable="false">
      <span v-else class="root-chip-empty"></span>
      <span class="root-chip-copy">
        <span>{{ family.title }}</span>
        <small>{{ family.metaLabel }}</small>
      </span>
    </button>
    <div v-if="!families.length" class="root-strip-empty">还没有可切换的族谱</div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { GenealogyFamily } from "../../stores/genealogy";
import { createGenealogyRootTabViewModel } from "./genealogyFamilyViewModel";
import { useHorizontalDragScroll } from "./useHorizontalDragScroll";

const props = defineProps<{
  families: GenealogyFamily[];
  activeRootId: string;
}>();

const emit = defineEmits<{
  activate: [rootId: string];
}>();

const rootStrip = ref<HTMLElement | null>(null);
const {
  isDragging,
  handlePointerDown,
  shouldSuppressClick,
} = useHorizontalDragScroll({ container: rootStrip });

function activateFamily(rootId: string) {
  if (shouldSuppressClick()) return;
  emit("activate", rootId);
}

const familyViews = computed(() => props.families.map(createGenealogyRootTabViewModel));
</script>

<style scoped src="../../styles/parts/genealogy-root-tabs.css"></style>
