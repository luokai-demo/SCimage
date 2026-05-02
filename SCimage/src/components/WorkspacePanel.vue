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
        <details class="connection-card" id="providerConfigCard" :open="providerConfigOpen" @toggle="onProviderConfigToggle">
          <summary>
            <span>API配置</span>
            <ChevronDown class="details-chevron" aria-hidden="true" />
          </summary>
          <div class="connection-card-body">
            <div class="provider-config-stack">
              <div class="provider-config-cluster">
                <div class="form-group provider-config-field">
                  <div class="field-label-row">
                    <label for="providerProfileSelect">快速切换</label>
                    <span class="field-meta-text">当前配置</span>
                  </div>
                  <div class="provider-profile-picker">
                    <button
                      id="providerProfileSelect"
                      ref="providerProfileTrigger"
                      type="button"
                      :class="['provider-profile-trigger', { 'is-open': profileMenuOpen, 'is-empty': !activeProfileLabel }]"
                      :disabled="providerStore.isSaving || !providerStore.hasProfiles"
                      :aria-expanded="profileMenuOpen"
                      :title="activeProfileLabel || '未保存任何配置'"
                      @click="toggleProfileMenu"
                    >{{ activeProfileLabel || "未保存任何配置" }}</button>
                    <div id="providerProfileMenu" class="provider-profile-menu" :hidden="!profileMenuOpen" role="listbox">
                      <div v-if="!providerStore.profiles.length" class="provider-profile-empty">还没有已保存配置</div>
                      <template v-else>
                        <div v-for="profile in providerStore.profiles" :key="profile.id" class="provider-profile-option-row">
                          <button
                            type="button"
                            class="provider-profile-delete-btn"
                            :disabled="providerStore.isSaving"
                            :aria-label="`删除配置 ${profile.name}`"
                            :title="`删除配置 ${profile.name}`"
                            @click.stop="deleteProfile(profile.id)"
                          >
                            <X aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            :class="['provider-profile-option-btn', { 'is-active': profile.id === providerStore.activeProfileId }]"
                            role="option"
                            :aria-selected="profile.id === providerStore.activeProfileId"
                            :disabled="providerStore.isSaving"
                            @click="activateProfile(profile.id)"
                          >
                            <span class="provider-profile-option-label">{{ profile.name }}</span>
                            <span v-if="profile.id === providerStore.activeProfileId" class="provider-profile-option-tag">当前</span>
                          </button>
                        </div>
                      </template>
                    </div>
                  </div>
                </div>
                <div class="form-group provider-config-field">
                  <div class="field-label-row">
                    <label for="providerProfileName">配置名称</label>
                    <span class="field-meta-text">保存 / 另存为</span>
                  </div>
                  <input v-model="runtime.providerForm.name" type="text" id="providerProfileName" placeholder="当前提供方 / 备用节点">
                </div>
              </div>

              <div class="provider-config-cluster">
                <div class="form-group provider-config-field">
                  <div class="field-label-row">
                    <label for="baseUrl">Base URL</label>
                    <span class="field-meta-text">OpenAI-compatible</span>
                  </div>
                  <input v-model="runtime.providerForm.base_url" type="text" id="baseUrl" placeholder="https://api.openai.com/v1">
                </div>
                <div class="form-group provider-config-field">
                  <div class="field-label-row">
                    <label for="apiKey">API Key</label>
                    <span class="field-meta-text">留空沿用已保存密钥</span>
                  </div>
                  <div class="input-with-action">
                    <input v-model="runtime.providerForm.api_key" :type="apiKeyVisible ? 'text' : 'password'" id="apiKey" :placeholder="apiKeyPlaceholder">
                    <IconButton id="toggleApiKeyVisibilityBtn" class-name="input-action-btn" :label="apiKeyVisible ? '隐藏 API Key' : '显示 API Key'" @click="apiKeyVisible = !apiKeyVisible">
                      <Eye aria-hidden="true" />
                    </IconButton>
                  </div>
                </div>
              </div>

              <div class="provider-config-cluster provider-option-stack">
                <UiSelectField v-model="runtime.providerForm.model" select-id="model" label="模型" aria-describedby="modelStatusHint" :disabled="runtime.modelPicker.loading" label-action>
                  <template #label-action>
                    <IconButton id="modelReloadBtn" :class-name="`field-label-icon-btn${runtime.modelPicker.loading ? ' is-loading' : ''}`" label="拉取模型" :disabled="!runtime.providerCanLoadModels.value" @click="runtime.loadModels()">
                      <RefreshCw aria-hidden="true" />
                    </IconButton>
                  </template>
                  <option value="" disabled>请选择 API 支持的模型</option>
                  <optgroup v-for="group in modelOptionGroups" :key="group.key" :label="group.label">
                    <option v-for="model in group.options" :key="model.id" :value="model.id">{{ model.label }}</option>
                  </optgroup>
                  <template #after>
                    <div id="modelStatusHint" class="field-hint" :data-tone="runtime.modelPicker.messageTone" aria-live="polite">{{ runtime.modelPicker.message }}</div>
                  </template>
                </UiSelectField>

                <div class="form-group">
                  <label class="checkbox-field" for="supportsCountParameter">
                    <span class="checkbox-field-copy">
                      <span class="checkbox-field-title">上游支持传递生成张数</span>
                    </span>
                    <span class="checkbox-switch">
                      <input v-model="runtime.providerForm.supports_count_parameter" type="checkbox" id="supportsCountParameter">
                      <span class="checkbox-switch-ui" aria-hidden="true"></span>
                    </span>
                  </label>
                </div>

                <UiSelectField v-model="runtime.providerForm.compat_profile_id" select-id="providerCompatProfile" label="兼容模式" meta="上游协议" class-name="provider-config-field">
                  <option v-for="profile in providerStore.compatProfiles" :key="profile.id" :value="profile.id">{{ profile.label }}</option>
                </UiSelectField>
              </div>

              <div class="button-row button-row-tight">
                <button type="button" id="saveProviderBtn" class="btn-secondary" :disabled="!runtime.providerCanSaveCurrent.value" :title="saveCurrentTitle" @click="runtime.saveProviderProfile(false)">保存当前配置</button>
                <button type="button" id="saveAsProviderBtn" class="btn-secondary" :disabled="!runtime.providerCanSaveAs.value" :title="saveAsTitle" @click="runtime.saveProviderProfile(true)">另存为新配置</button>
              </div>
            </div>
          </div>
        </details>

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
              <section v-show="workspaceStore.activeWorkflow === 'image-to-image'" class="workspace-group" data-workflow-scope="image-to-image">
                <div class="workspace-group-head">
                  <div>
                    <div id="sourceTitle" class="workspace-group-title">参考图</div>
                    <div id="sourceHint" class="workspace-group-hint">支持拖拽、粘贴或选择多张图片作为参考。</div>
                  </div>
                </div>
                <div
                  :class="['drop-zone', { dragover: sourceDragOver }]"
                  id="sourceDropZone"
                  tabindex="0"
                  aria-label="参考图上传区域"
                  @click="onSourceZoneClick"
                  @drop.prevent="onDrop"
                  @dragover.prevent="sourceDragOver = true"
                  @dragleave="sourceDragOver = false"
                  @paste="onPaste"
                >
                  <div class="drop-zone-text" id="sourceDropText">{{ runtime.sourceImages.value.length ? `已选择 ${runtime.sourceImages.value.length} 张参考图` : "将多张参考图拖到这里，或粘贴到工作区" }}</div>
                  <div class="drop-zone-preview" id="sourcePreview">
                    <span v-for="item in runtime.sourceImages.value" :key="item.key" class="source-preview-item">
                      <img :src="item.url" :alt="item.name">
                      <button type="button" aria-label="移除参考图" @click.stop="runtime.removeSourceImage(item.key)">
                        <X aria-hidden="true" />
                      </button>
                    </span>
                  </div>
                  <input ref="sourceInput" type="file" id="sourceImage" accept="image/*" multiple style="display:none;" @change="onSourceChange">
                  <button type="button" class="drop-zone-browse" id="sourceBrowseBtn" @click="sourceInput?.click()">选择多张参考图</button>
                </div>
              </section>

              <section class="workspace-group">
                <div class="workspace-group-head">
                  <div>
                    <div class="workspace-group-title">提示词</div>
                    <div id="promptSectionHint" class="workspace-group-hint">{{ workflowPromptHint }}</div>
                  </div>
                  <button
                    type="button"
                    id="togglePromptBankBtn"
                    class="chip-btn"
                    :aria-expanded="promptDialog.open.value"
                    @click="promptDialog.setOpen(!promptDialog.open.value)"
                  >词库</button>
                </div>
                <textarea v-model="runtime.currentWorkflowForm.value.prompt" id="prompt" :placeholder="workflowPromptPlaceholder"></textarea>
              </section>

              <section class="workspace-group">
                <div class="workspace-group-head">
                  <div>
                    <div class="workspace-group-title">输出参数</div>
                    <div class="workspace-group-hint">当前工作流独立保存这一组输出参数，尺寸会随质量档位联动。</div>
                  </div>
                </div>
                <div class="row">
                  <UiSelectField v-model="runtime.currentWorkflowForm.value.size" select-id="size" label="尺寸">
                    <option v-for="option in sizeOptionItems" :key="option.value" :value="option.value">{{ option.label }}</option>
                  </UiSelectField>
                  <UiSelectField v-model="runtime.currentWorkflowForm.value.quality" select-id="quality" label="质量">
                    <option v-for="option in qualityOptionItems" :key="option.value" :value="option.value">{{ option.label }}</option>
                  </UiSelectField>
                </div>
                <div class="row">
                  <UiSelectField v-model="runtime.currentWorkflowForm.value.count" select-id="count" label="数量">
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                    <option value="6">6</option>
                  </UiSelectField>
                  <div class="form-group">
                    <label>输出格式</label>
                    <div class="helper-note">当前固定输出 PNG，格式与压缩选项后续再开放。</div>
                  </div>
                </div>
              </section>

              <section class="workspace-group">
                <div class="workspace-group-head">
                  <div class="workspace-group-title">执行</div>
                </div>
                <div id="status" class="status" :data-tone="runtime.status.tone">{{ runtime.status.message }}</div>
                <div class="button-row">
                  <button type="button" id="generateBtn" class="btn-primary" :disabled="!runtime.canGenerate.value" @click="runtime.generate">{{ workspaceStore.activeWorkflow === 'image-to-image' ? '开始图生图' : '生成图片' }}</button>
                </div>
              </section>
            </div>
          </section>

          <TaskPanel />
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { ChevronDown, ChevronLeft, Eye, RefreshCw, X } from "lucide-vue-next";
import { useScimageRuntime } from "../composables/useScimageRuntime";
import { usePromptLibraryDialog } from "../composables/usePromptLibraryDialog";
import type { OutputOption } from "../data/outputOptions";
import IconButton from "./ui/IconButton.vue";
import TaskPanel from "./jobs/TaskPanel.vue";
import UiSelectField from "./ui/UiSelectField.vue";

const runtime = useScimageRuntime();
const workspaceStore = runtime.workspaceStore;
const providerStore = runtime.providerStore;
const promptDialog = usePromptLibraryDialog();
const apiKeyVisible = ref(false);
const sourceInput = ref<HTMLInputElement | null>(null);
const sourceDragOver = ref(false);
const providerConfigOpen = ref(false);
const providerConfigTouched = ref(false);
const profileMenuOpen = ref(false);
const providerProfileTrigger = ref<HTMLButtonElement | null>(null);
const savedApiKeyHint = computed(() => providerStore.activeProfile?.api_key_hint || "");
const activeProfileLabel = computed(() => providerStore.profiles.find((profile) => profile.id === providerStore.activeProfileId)?.name || providerStore.activeProfile?.name || "");
const apiKeyPlaceholder = computed(() => (providerStore.activeProfile?.has_api_key && savedApiKeyHint.value ? `已保存：${savedApiKeyHint.value}` : "输入 API Key"));
const saveBlockMessage = computed(() => runtime.providerSaveBlockMessage.value);
const saveCurrentTitle = computed(() => {
  if (providerStore.isSaving) return "配置正在保存中。";
  if (!providerStore.activeProfileId) return "请先使用“另存为新配置”创建第一套配置。";
  return saveBlockMessage.value;
});
const saveAsTitle = computed(() => (providerStore.isSaving ? "配置正在保存中。" : saveBlockMessage.value));
const sizeOptionItems = computed(() => runtime.sizeOptions.value as OutputOption[]);
const qualityOptionItems = computed(() => runtime.qualityOptions.value as OutputOption[]);
const workflowPromptHint = computed(() => (
  workspaceStore.activeWorkflow === "image-to-image"
    ? "可上传多张参考图，再描述你希望统一迁移出的画面效果。"
    : "直接描述你想生成的画面、风格和细节。"
));
const workflowPromptPlaceholder = computed(() => (
  workspaceStore.activeWorkflow === "image-to-image"
    ? "参考多张样图的构图与质感，输出统一风格的人像海报"
    : "一只在星空下奔跑的白色柴犬，水彩风格"
));
const modelOptions = computed(() => {
  const options = runtime.modelPicker.options;
  const currentModel = runtime.providerForm.model.trim();
  if (!currentModel || options.some((model) => model.id === currentModel)) return options;
  return [{ id: currentModel, label: currentModel, category: "other" as const }, ...options];
});
const modelOptionGroups = computed(() => {
  const imageOptions = modelOptions.value.filter((model) => model.category === "image");
  const otherOptions = modelOptions.value.filter((model) => model.category !== "image");
  return [
    { key: "image", label: "图片模型", options: imageOptions },
    { key: "other", label: "其他模型", options: otherOptions },
  ].filter((group) => group.options.length);
});

watch(() => providerStore.hasProfiles, (hasProfiles) => {
  if (!providerConfigTouched.value) providerConfigOpen.value = !hasProfiles;
}, { immediate: true });

function onProviderConfigToggle(event: Event) {
  providerConfigTouched.value = true;
  providerConfigOpen.value = (event.currentTarget as HTMLDetailsElement).open;
}

function toggleProfileMenu() {
  if (providerStore.isSaving || !providerStore.hasProfiles) return;
  profileMenuOpen.value = !profileMenuOpen.value;
}

function closeProfileMenu() {
  profileMenuOpen.value = false;
}

function activateProfile(profileId: string) {
  closeProfileMenu();
  if (profileId === providerStore.activeProfileId) return;
  void runtime.activateProviderProfile(profileId);
}

function deleteProfile(profileId: string) {
  closeProfileMenu();
  void runtime.deleteProviderProfile(profileId);
}

function onDocumentClick(event: MouseEvent) {
  if (!profileMenuOpen.value) return;
  const target = event.target as HTMLElement;
  if (target.closest(".provider-profile-picker")) return;
  closeProfileMenu();
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key !== "Escape") return;
  const wasOpen = profileMenuOpen.value;
  closeProfileMenu();
  if (wasOpen) providerProfileTrigger.value?.focus();
}

function onSourceChange(event: Event) {
  const input = event.currentTarget as HTMLInputElement;
  if (input.files) runtime.addSourceFiles(input.files);
  input.value = "";
}

function onSourceZoneClick(event: MouseEvent) {
  if ((event.target as HTMLElement).closest("button")) return;
  sourceInput.value?.click();
}

function onDrop(event: DragEvent) {
  sourceDragOver.value = false;
  if (event.dataTransfer?.files) runtime.addSourceFiles(event.dataTransfer.files);
}

function onPaste(event: ClipboardEvent) {
  const files = Array.from(event.clipboardData?.items || [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter(Boolean) as File[];
  if (!files.length) return;
  event.preventDefault();
  runtime.addSourceFiles(files);
}

onMounted(() => {
  document.addEventListener("click", onDocumentClick);
  document.addEventListener("keydown", onDocumentKeydown);
});

onUnmounted(() => {
  document.removeEventListener("click", onDocumentClick);
  document.removeEventListener("keydown", onDocumentKeydown);
});
</script>
