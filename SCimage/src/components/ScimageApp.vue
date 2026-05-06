<template>
  <TooltipProvider>
    <div class="app">
      <WorkspacePanel />
      <RightWorkspace />
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
import RightWorkspace from "./RightWorkspace.vue";
import FeedbackOverlays from "./FeedbackOverlays.vue";
import PromptLibraryDialog from "./PromptLibraryDialog.vue";
import ConfirmDialog from "./ui/ConfirmDialog.vue";

const uiStore = useUiStore();
const runtime = useScimageRuntime();
onMounted(() => {
  uiStore.markMounted();
  void runtime.initRuntime();
});
</script>
