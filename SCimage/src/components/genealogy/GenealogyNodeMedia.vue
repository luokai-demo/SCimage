<template>
  <div class="genealogy-node-media">
    <img
      v-if="imageUrl"
      :src="imageUrl"
      :alt="altText"
      :loading="loadingMode"
      decoding="async"
      draggable="false"
      @dragstart.prevent
    >
    <div v-else-if="pending" class="genealogy-node-placeholder is-pending">
      <LoaderCircle aria-hidden="true" />
      <span>预定位置</span>
    </div>
    <div v-else class="genealogy-node-placeholder">无预览</div>
    <span class="node-badge">{{ badgeText }}</span>
    <span v-if="multiSource" class="node-multi-badge"><Combine aria-hidden="true" />多参考</span>
  </div>
</template>

<script setup lang="ts">
import { Combine, LoaderCircle } from "lucide-vue-next";

defineProps<{
  altText: string;
  badgeText: string;
  imageUrl: string;
  loadingMode?: "lazy" | "eager";
  multiSource: boolean;
  pending: boolean;
}>();
</script>

<style scoped>
.genealogy-node-media {
  position: relative;
  height: 96px;
  overflow: hidden;
  background: rgba(255,255,255,.06);
}
.genealogy-node-media::after {
  content: "";
  position: absolute;
  inset: auto 0 0;
  height: 56px;
  background: linear-gradient(180deg, transparent, rgba(0,0,0,.62));
  pointer-events: none;
}
.genealogy-node-media img,
.genealogy-node-placeholder {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  background: rgba(255,255,255,.06);
}
.genealogy-node-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--text-tertiary);
  font-size: 12px;
}
.genealogy-node-placeholder.is-pending {
  flex-direction: column;
  color: #cfe6ff;
  background:
    linear-gradient(135deg, rgba(143,200,255,.08), rgba(255,255,255,.025)),
    rgba(255,255,255,.04);
}
.genealogy-node-placeholder.is-pending svg {
  width: 18px;
  height: 18px;
  stroke-width: 1.8;
}
.node-badge,
.node-multi-badge {
  position: absolute;
  z-index: 2;
  min-height: 21px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 7px;
  border: 1px solid rgba(255,255,255,.14);
  border-radius: 999px;
  background: rgba(0,0,0,.5);
  color: rgba(255,255,255,.84);
  font-size: 10px;
  backdrop-filter: blur(8px);
}
.node-badge {
  left: 8px;
  bottom: 8px;
}
.node-multi-badge {
  right: 8px;
  bottom: 8px;
  color: #ffe9a3;
}
.node-multi-badge svg {
  width: 11px;
  height: 11px;
}
@media (prefers-reduced-motion: no-preference) {
  .genealogy-node-placeholder.is-pending svg {
    animation: pending-node-spin 900ms linear infinite;
  }
}
@keyframes pending-node-spin {
  to { transform: rotate(360deg); }
}
</style>
