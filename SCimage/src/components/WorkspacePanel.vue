<template>
  <div :class="['panel', { 'is-collapsed': workspaceStore.isPanelCollapsed }]" id="workspacePanel">
    <div class="panel-inner">
      <div class="panel-header">
        <div class="panel-header-copy">
          <h1>SCimage</h1>
        </div>
        <IconButton id="panelToggleBtn" class-name="panel-toggle" label="收起左侧工作区" @click="workspaceStore.setPanelCollapsed(!workspaceStore.isPanelCollapsed)">
          <ChevronLeft aria-hidden="true" />
        </IconButton>
      </div>

      <div class="panel-body">
        <details class="connection-card" id="providerConfigCard">
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
                    <select id="providerProfileSelect" v-model="providerStore.activeProfileId" class="provider-profile-trigger" @change="runtime.activateProviderProfile(providerStore.activeProfileId)">
                      <option value="" disabled>未保存任何配置</option>
                      <option v-for="profile in providerStore.profiles" :key="profile.id" :value="profile.id">{{ profile.name }}</option>
                    </select>
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
                    <input v-model="runtime.providerForm.api_key" :type="apiKeyVisible ? 'text' : 'password'" id="apiKey" placeholder="输入新 API Key">
                    <IconButton id="toggleApiKeyVisibilityBtn" class-name="input-action-btn" label="显示 API Key" @click="apiKeyVisible = !apiKeyVisible">
                      <Eye aria-hidden="true" />
                    </IconButton>
                  </div>
                </div>
              </div>

              <div class="provider-config-cluster provider-option-stack">
                <UiSelectField v-model="runtime.providerForm.model" select-id="model" label="模型" aria-describedby="modelStatusHint" label-action>
                  <template #label-action>
                    <IconButton id="modelReloadBtn" class-name="field-label-icon-btn" label="拉取模型" @click="runtime.loadModels">
                      <RefreshCw aria-hidden="true" />
                    </IconButton>
                  </template>
                  <option value="" disabled>请选择 API 支持的模型</option>
                  <option v-for="model in runtime.modelPicker.options" :key="model.id" :value="model.id">{{ model.label }}</option>
                  <template #after>
                    <div id="modelStatusHint" class="field-hint" aria-live="polite">{{ runtime.modelPicker.message }}</div>
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
                <button type="button" id="saveProviderBtn" class="btn-secondary" @click="runtime.saveProviderProfile(false)">保存当前配置</button>
                <button type="button" id="saveAsProviderBtn" class="btn-secondary" @click="runtime.saveProviderProfile(true)">另存为新配置</button>
              </div>
            </div>
          </div>
        </details>

        <section class="workspace-shell" aria-labelledby="workspaceTitle">
          <div class="workflow-tabs" id="workflowTabs" role="tablist" aria-label="工作流切换">
            <button type="button" :class="['workflow-tab', { active: workspaceStore.activeWorkflow === 'generate' }]" data-workflow="generate" role="tab" :aria-selected="workspaceStore.activeWorkflow === 'generate'" @click="runtime.setWorkflow('generate')">文生图</button>
            <button type="button" :class="['workflow-tab', { active: workspaceStore.activeWorkflow === 'image-to-image' }]" data-workflow="image-to-image" role="tab" :aria-selected="workspaceStore.activeWorkflow === 'image-to-image'" @click="runtime.setWorkflow('image-to-image')">图生图</button>
          </div>

          <section class="workspace-card">
            <div class="workspace-card-head">
              <div class="workspace-card-copy">
                <div class="workspace-eyebrow">左侧工作区</div>
                <h2 id="workspaceTitle" class="workspace-title">{{ workspaceStore.activeWorkflow === 'image-to-image' ? '图生图' : '文生图' }}</h2>
              </div>
              <span id="workspaceModeChip" class="workspace-chip is-live">已接入</span>
            </div>

            <div class="workspace-stack">
              <section v-show="workspaceStore.activeWorkflow === 'image-to-image'" class="workspace-group" data-workflow-scope="image-to-image">
                <div class="workspace-group-head">
                  <div>
                    <div id="sourceTitle" class="workspace-group-title">参考图</div>
                    <div id="sourceHint" class="workspace-group-hint">支持拖拽、粘贴或选择多张图片作为参考。</div>
                  </div>
                </div>
                <div class="drop-zone" id="sourceDropZone" tabindex="0" aria-label="参考图上传区域" @drop.prevent="onDrop" @dragover.prevent>
                  <div class="drop-zone-text" id="sourceDropText">将多张参考图拖到这里，或粘贴到工作区</div>
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
                    <div id="promptSectionHint" class="workspace-group-hint">直接描述你想生成的画面、风格和细节。</div>
                  </div>
                  <button type="button" id="togglePromptBankBtn" class="chip-btn" :aria-expanded="promptDialog.open.value" @click="promptDialog.setOpen(true)">词库</button>
                </div>
                <textarea v-model="runtime.currentWorkflowForm.value.prompt" id="prompt" placeholder="一只在星空下奔跑的白色柴犬，水彩风格"></textarea>
              </section>

              <section class="workspace-group">
                <div class="workspace-group-head">
                  <div>
                    <div class="workspace-group-title">输出参数</div>
                    <div class="workspace-group-hint">当前工作流独立保存这一组输出参数，尺寸使用标准像素预设。</div>
                  </div>
                </div>
                <div class="row">
                  <UiSelectField v-model="runtime.currentWorkflowForm.value.size" select-id="size" label="尺寸">
                    <option v-for="option in runtime.sizeOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                  </UiSelectField>
                  <UiSelectField v-model="runtime.currentWorkflowForm.value.quality" select-id="quality" label="质量">
                    <option v-for="option in runtime.qualityOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
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
                  <button type="button" id="generateBtn" class="btn-primary" @click="runtime.generate">生成图片</button>
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
import { ref } from "vue";
import { ChevronDown, ChevronLeft, Eye, RefreshCw, X } from "lucide-vue-next";
import { useScimageRuntime } from "../composables/useScimageRuntime";
import { usePromptLibraryDialog } from "../composables/usePromptLibraryDialog";
import IconButton from "./ui/IconButton.vue";
import TaskPanel from "./jobs/TaskPanel.vue";
import UiSelectField from "./ui/UiSelectField.vue";

const runtime = useScimageRuntime();
const workspaceStore = runtime.workspaceStore;
const providerStore = runtime.providerStore;
const promptDialog = usePromptLibraryDialog();
const apiKeyVisible = ref(false);
const sourceInput = ref<HTMLInputElement | null>(null);

function onSourceChange(event: Event) {
  const input = event.currentTarget as HTMLInputElement;
  if (input.files) runtime.addSourceFiles(input.files);
  input.value = "";
}

function onDrop(event: DragEvent) {
  if (event.dataTransfer?.files) runtime.addSourceFiles(event.dataTransfer.files);
}
</script>
