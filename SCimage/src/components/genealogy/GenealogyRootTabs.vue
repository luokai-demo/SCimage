<template>
  <div class="root-strip" aria-label="根图切换条">
    <button
      v-for="family in families"
      :key="family.root_id"
      type="button"
      :class="['root-chip', { active: family.root_id === activeRootId }]"
      @click="emit('activate', family.root_id)"
    >
      <img v-if="family.cover_url" :src="family.cover_url" alt="" loading="lazy" decoding="async">
      <span v-else class="root-chip-empty"></span>
      <span class="root-chip-copy">
          <span>{{ shortGenealogyText(family.title, 24) }}</span>
        <small>{{ family.generation_count }} 代 · {{ family.image_count }} 图</small>
      </span>
    </button>
    <div v-if="!families.length" class="root-strip-empty">还没有可切换的族谱</div>
  </div>
</template>

<script setup lang="ts">
import type { GenealogyFamily } from "../../stores/genealogy";
import { shortGenealogyText } from "../../utils/genealogyFormat";

defineProps<{
  families: GenealogyFamily[];
  activeRootId: string;
}>();

const emit = defineEmits<{
  activate: [rootId: string];
}>();

</script>

<style scoped>
.root-strip {
  flex-shrink: 0;
  display: flex;
  gap: 8px;
  min-height: 74px;
  padding: 2px 0 12px;
  overflow-x: auto;
  scrollbar-width: thin;
}
.root-chip {
  flex: 0 0 176px;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  align-items: center;
  gap: 9px;
  min-width: 0;
  padding: 8px;
  border: 1px solid rgba(255,255,255,.085);
  border-radius: 7px;
  background: rgba(255,255,255,.025);
  color: var(--text-secondary);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color var(--transition), background var(--transition), color var(--transition), transform var(--transition);
}
.root-chip:hover {
  transform: translateY(-1px);
  border-color: rgba(255,255,255,.18);
}
.root-chip.active {
  border-color: rgba(255,255,255,.42);
  background: rgba(255,255,255,.075);
  color: var(--text-primary);
}
.root-chip img,
.root-chip-empty {
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  border-radius: 5px;
  object-fit: cover;
  background: rgba(255,255,255,.08);
}
.root-chip-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.root-chip-copy span,
.root-chip-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.root-chip-copy span {
  font-size: 12px;
  font-weight: 600;
}
.root-chip-copy small {
  color: var(--text-tertiary);
  font-size: 10px;
}
.root-strip-empty {
  display: flex;
  align-items: center;
  color: var(--text-tertiary);
  font-size: 12px;
}
</style>
