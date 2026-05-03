<template>
  <main class="family-overview" aria-label="族谱总览">
    <button
      v-for="family in families"
      :key="family.root_id"
      type="button"
      class="family-card"
      @click="emit('activate', family.root_id)"
    >
      <span class="family-cover">
        <img v-if="family.cover_url" :src="family.cover_url" alt="" loading="lazy" decoding="async">
        <span class="family-cover-badge">{{ family.root_type === 'source' ? '外部根图' : '图库根图' }}</span>
      </span>
      <span class="family-card-body">
        <span class="family-card-title">{{ family.title || "未命名族谱" }}</span>
        <span class="family-lineage" aria-hidden="true">
          <span
            v-for="step in familyLineageSteps(family.generation_count)"
            :key="step"
            :class="['family-lineage-dot', { active: step <= family.generation_count }]"
          ></span>
        </span>
        <span class="family-card-meta">
          <span><GitBranch aria-hidden="true" />{{ family.generation_count }} 代</span>
          <span><Images aria-hidden="true" />{{ family.image_count }} 张</span>
          <span><Clock3 aria-hidden="true" />{{ formatGenealogyTime(family.latest_updated_at) }}</span>
        </span>
        <span class="family-card-tags">
          <span v-if="family.has_multi_source"><Combine aria-hidden="true" />多参考</span>
          <span><ImageIcon aria-hidden="true" />{{ family.root_type === 'source' ? '外部根图' : '图库根图' }}</span>
        </span>
      </span>
    </button>
    <div v-if="!families.length" class="genealogy-empty">
      <ImagePlus aria-hidden="true" />
      <span>从普通图库点“参考”，或在左侧上传参考图并完成一次图生图后，这里会出现族谱。</span>
    </div>
  </main>
</template>

<script setup lang="ts">
import {
  Clock3,
  Combine,
  GitBranch,
  ImageIcon,
  ImagePlus,
  Images,
} from "lucide-vue-next";
import type { GenealogyFamily } from "../../stores/genealogy";
import { formatGenealogyTime } from "../../utils/genealogyGraph";

defineProps<{
  families: GenealogyFamily[];
}>();

const emit = defineEmits<{
  activate: [rootId: string];
}>();

function familyLineageSteps(generationCount: number) {
  return Array.from({ length: Math.max(3, Math.min(generationCount, 5)) }, (_, index) => index + 1);
}
</script>

<style scoped>
.family-overview {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  align-content: start;
  gap: 12px;
  padding: 4px 4px 24px;
}
.family-card {
  position: relative;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,.085);
  border-radius: 8px;
  background: rgba(255,255,255,.03);
  color: inherit;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  content-visibility: auto;
  contain-intrinsic-size: auto 246px;
  transition: transform var(--transition), border-color var(--transition), background var(--transition), box-shadow var(--transition);
}
.family-card:hover {
  transform: translateY(-2px);
  border-color: rgba(255,255,255,.18);
  background: rgba(255,255,255,.055);
  box-shadow: 0 18px 42px rgba(0,0,0,.28);
}
.family-cover {
  position: relative;
  display: block;
  overflow: hidden;
  aspect-ratio: 16 / 10;
  background: rgba(255,255,255,.06);
}
.family-cover::before,
.family-cover::after {
  content: "";
  position: absolute;
  inset: 10px;
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 6px;
  opacity: .55;
  pointer-events: none;
}
.family-cover::before {
  transform: translate3d(8px, 7px, 0);
}
.family-cover::after {
  transform: translate3d(15px, 13px, 0);
  opacity: .32;
}
.family-cover img {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}
.family-cover-badge {
  position: absolute;
  left: 8px;
  bottom: 8px;
  z-index: 2;
  min-height: 22px;
  display: inline-flex;
  align-items: center;
  padding: 0 8px;
  border: 1px solid rgba(255,255,255,.16);
  border-radius: 999px;
  background: rgba(0,0,0,.52);
  color: rgba(255,255,255,.82);
  font-size: 10px;
  backdrop-filter: blur(8px);
}
.family-card-body {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 10px;
}
.family-card-title {
  min-height: 34px;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 650;
  line-height: 1.35;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.family-lineage {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 4px;
  height: 5px;
}
.family-lineage-dot {
  border-radius: 999px;
  background: rgba(255,255,255,.07);
}
.family-lineage-dot.active {
  background: rgba(212,216,224,.72);
}
.family-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  color: var(--text-tertiary);
  font-size: 11px;
}
.family-card-meta span,
.family-card-tags span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.family-card-meta svg,
.family-card-tags svg {
  width: 12px;
  height: 12px;
  flex: 0 0 auto;
  stroke-width: 1.8;
}
.family-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.family-card-tags span {
  min-height: 20px;
  padding: 0 7px;
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 999px;
  color: var(--text-secondary);
  font-size: 10px;
  background: rgba(255,255,255,.035);
}
.family-card-tags span:first-child svg {
  color: #e9d27a;
  fill: currentColor;
}
.genealogy-empty {
  grid-column: 1 / -1;
  min-height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  border: 1px dashed rgba(255,255,255,.12);
  border-radius: 10px;
  color: var(--text-tertiary);
  font-size: 12px;
}
.genealogy-empty svg {
  width: 18px;
  height: 18px;
}
</style>
