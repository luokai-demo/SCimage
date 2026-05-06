<template>
  <div :class="['panel', { 'is-collapsed': workspaceStore.isPanelCollapsed }]" id="workspacePanel">
    <div class="panel-inner">
      <div class="panel-header">
        <div class="panel-header-copy">
          <h1>SCimage</h1>
        </div>
        <IconButton id="panelToggleBtn" class-name="panel-toggle" :label="workspaceStore.isPanelCollapsed ? '展开左侧工作区' : '收起左侧工作区'" @click="workspaceStore.setPanelCollapsed(!workspaceStore.isPanelCollapsed)">
          <ChevronLeft aria-hidden="true" />
        </IconButton>
      </div>

      <div class="panel-body">
        <ProviderConfigCard
          :open="providerConfigOpen"
          :runtime="runtime"
          @toggle="onProviderConfigToggle"
        />

        <section class="workspace-shell" aria-labelledby="workspaceTitle">
          <div class="workflow-tabs" id="workflowTabs" role="tablist" aria-label="工作流切换">
            <button type="button" :class="['workflow-tab', { active: workspaceStore.activeWorkflow === 'generate' }]" data-workflow="generate" role="tab" :aria-selected="workspaceStore.activeWorkflow === 'generate'" @click="runtime.setWorkflow('generate')">文生图</button>
            <button type="button" :class="['workflow-tab', { active: workspaceStore.activeWorkflow === 'image-to-image' }]" data-workflow="image-to-image" role="tab" :aria-selected="workspaceStore.activeWorkflow === 'image-to-image'" :disabled="!workspaceStore.workflowAvailability['image-to-image']" :title="workspaceStore.workflowAvailability['image-to-image'] ? '' : '当前提供方配置不支持图生图'" @click="runtime.setWorkflow('image-to-image')">图生图</button>
          </div>

          <section class="workspace-card">
            <div class="workspace-card-head">
              <div class="workspace-card-copy">
                <div class="workspace-eyebrow">左侧工作区</div>
                <h2 id="workspaceTitle" class="workspace-title">{{ workspaceStore.activeWorkflow === 'image-to-image' ? '图生图' : '文生图' }}</h2>
              </div>
              <span id="workspaceModeChip" :class="['workspace-chip', workspaceStore.workflowAvailability[workspaceStore.activeWorkflow] ? 'is-live' : 'is-planned']">{{ workspaceStore.workflowAvailability[workspaceStore.activeWorkflow] ? '已接入' : '未启用' }}</span>
            </div>

            <div class="workspace-stack">
              <SourceImagesSection
                :active="workspaceStore.activeWorkflow === 'image-to-image'"
                :runtime="runtime"
              />
              <PromptSection :runtime="runtime" />
              <OutputParametersSection :runtime="runtime" />
              <WorkspaceExecuteSection :runtime="runtime" />
            </div>
          </section>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { ChevronLeft } from "lucide-vue-next";
import { useScimageRuntime } from "../composables/useScimageRuntime";
import IconButton from "./ui/IconButton.vue";
import OutputParametersSection from "./workspace/OutputParametersSection.vue";
import PromptSection from "./workspace/PromptSection.vue";
import ProviderConfigCard from "./workspace/ProviderConfigCard.vue";
import SourceImagesSection from "./workspace/SourceImagesSection.vue";
import WorkspaceExecuteSection from "./workspace/WorkspaceExecuteSection.vue";

const runtime = useScimageRuntime();
const workspaceStore = runtime.workspaceStore;
const providerConfigOpen = ref(false);
const providerConfigTouched = ref(false);

watch(() => runtime.providerStore.hasProfiles, (hasProfiles) => {
  if (!providerConfigTouched.value) providerConfigOpen.value = !hasProfiles;
}, { immediate: true });

function onProviderConfigToggle(event: Event) {
  providerConfigTouched.value = true;
  providerConfigOpen.value = (event.currentTarget as HTMLDetailsElement).open;
}
</script>
