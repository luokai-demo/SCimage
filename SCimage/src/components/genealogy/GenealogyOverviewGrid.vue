<template>
  <main class="family-overview" aria-label="族谱总览">
    <button
      v-for="family in familyViews"
      :key="family.rootId"
      type="button"
      class="family-card"
      @click="emit('activate', family.rootId)"
    >
      <span class="family-cover">
        <img v-if="family.coverUrl" :src="family.coverUrl" alt="" loading="lazy" decoding="async">
        <span class="family-cover-badge">{{ family.rootKindLabel }}</span>
      </span>
      <span class="family-card-body">
        <span class="family-card-title">{{ family.title }}</span>
        <span class="family-lineage" aria-hidden="true">
          <span
            v-for="step in family.lineageSteps"
            :key="step"
            :class="['family-lineage-dot', { active: step <= family.family.generation_count }]"
          ></span>
        </span>
        <span class="family-card-meta">
          <span><GitBranch aria-hidden="true" />{{ family.generationLabel }}</span>
          <span><Images aria-hidden="true" />{{ family.imageCountLabel }}</span>
          <span><Clock3 aria-hidden="true" />{{ family.timeLabel }}</span>
        </span>
        <span class="family-card-tags">
          <span v-if="family.hasMultiSource"><Combine aria-hidden="true" />多参考</span>
          <span><ImageIcon aria-hidden="true" />{{ family.rootKindLabel }}</span>
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
import { computed } from "vue";
import {
  Clock3,
  Combine,
  GitBranch,
  ImageIcon,
  ImagePlus,
  Images,
} from "lucide-vue-next";
import type { GenealogyFamily } from "../../stores/genealogy";
import { createGenealogyFamilyViewModel } from "./genealogyFamilyViewModel";

const props = defineProps<{
  families: GenealogyFamily[];
}>();

const emit = defineEmits<{
  activate: [rootId: string];
}>();

const familyViews = computed(() => props.families.map(createGenealogyFamilyViewModel));
</script>

<style scoped src="../../styles/parts/genealogy-overview-grid.css"></style>
