<template>
  <section class="right-workspace" aria-labelledby="rightWorkspaceTitle">
    <div class="right-workspace-header">
      <div class="right-workspace-title-copy">
        <div class="workspace-eyebrow">右侧工作区</div>
        <h2 id="rightWorkspaceTitle" class="right-workspace-title">{{ title }}</h2>
      </div>
      <span class="workspace-chip is-live">{{ summary }}</span>
    </div>

    <div class="right-workspace-body">
      <GalleryPanel v-if="workspaceStore.activeWorkflow === 'generate'" />
      <GenealogyGalleryPanel v-else />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useScimageRuntime } from "../composables/useScimageRuntime";
import GalleryPanel from "./GalleryPanel.vue";
import GenealogyGalleryPanel from "./genealogy/GenealogyGalleryPanel.vue";

const runtime = useScimageRuntime();
const workspaceStore = runtime.workspaceStore;
const title = computed(() => (workspaceStore.activeWorkflow === "image-to-image" ? "族谱工作区" : "图库工作区"));
const summary = computed(() => (workspaceStore.activeWorkflow === "image-to-image" ? "图生图结果" : "文生图结果"));
</script>
