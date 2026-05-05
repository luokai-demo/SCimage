<template>
  <TooltipProvider>
    <div class="app">
      <WorkspacePanel />
      <GalleryPanel v-if="workspaceStore.activeWorkflow === 'generate'" />
      <GenealogyGalleryPanel v-else />
      <TaskDock />
    </div>
    <FeedbackOverlays />
    <PromptLibraryDialog />
    <ConfirmDialog />
  </TooltipProvider>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { TooltipProvider } from "reka-ui";
import { useUiStore } from "../stores/ui";
import { useScimageRuntime } from "../composables/useScimageRuntime";
import WorkspacePanel from "./WorkspacePanel.vue";
import GalleryPanel from "./GalleryPanel.vue";
import GenealogyGalleryPanel from "./genealogy/GenealogyGalleryPanel.vue";
import TaskDock from "./jobs/TaskDock.vue";
import FeedbackOverlays from "./FeedbackOverlays.vue";
import PromptLibraryDialog from "./PromptLibraryDialog.vue";
import ConfirmDialog from "./ui/ConfirmDialog.vue";

const uiStore = useUiStore();
const runtime = useScimageRuntime();
const workspaceStore = runtime.workspaceStore;

onMounted(() => {
  uiStore.markMounted();
  void runtime.initRuntime();
});
</script>
