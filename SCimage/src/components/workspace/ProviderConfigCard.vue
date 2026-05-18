<template>
  <details class="connection-card" id="providerConfigCard" :open="open" @toggle="emit('toggle', $event)">
    <summary :aria-expanded="open" aria-controls="providerConfigCardBody" @click="emit('user-toggle')">
      <span>API配置</span>
      <ChevronDown class="details-chevron" aria-hidden="true" />
    </summary>
    <div id="providerConfigCardBody" class="connection-card-body">
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
                :disabled="runtime.providerStore.isSaving || !runtime.providerStore.hasProfiles"
                :aria-expanded="profileMenuOpen"
                :title="activeProfileLabel || '未保存任何配置'"
                @click="toggleProfileMenu"
              >{{ activeProfileLabel || "未保存任何配置" }}</button>
              <div id="providerProfileMenu" class="provider-profile-menu" :hidden="!profileMenuOpen" role="listbox">
                <div v-if="!runtime.providerStore.profiles.length" class="provider-profile-empty">还没有已保存配置</div>
                <template v-else>
                  <div v-for="profile in runtime.providerStore.profiles" :key="profile.id" class="provider-profile-option-row">
                    <button
                      type="button"
                      class="provider-profile-delete-btn"
                      :disabled="runtime.providerStore.isSaving"
                      :aria-label="`删除配置 ${profile.name}`"
                      :title="`删除配置 ${profile.name}`"
                      @click.stop="deleteProfile(profile.id)"
                    >
                      <X aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      :class="['provider-profile-option-btn', { 'is-active': profile.id === runtime.providerStore.activeProfileId }]"
                      role="option"
                      :aria-selected="profile.id === runtime.providerStore.activeProfileId"
                      :disabled="runtime.providerStore.isSaving"
                      @click="activateProfile(profile.id)"
                    >
                      <span class="provider-profile-option-label">{{ profile.name }}</span>
                      <span v-if="profile.id === runtime.providerStore.activeProfileId" class="provider-profile-option-tag">当前</span>
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
          <ProviderModelCombobox
            v-model="runtime.providerForm.model"
            :options="runtime.modelPicker.options"
            :status="runtime.modelPicker.status"
            :message="runtime.modelPicker.message"
            :message-tone="runtime.modelPicker.messageTone"
            :loading="runtime.modelPicker.loading"
            :can-load-models="runtime.providerCanLoadModels.value"
            @load-models="runtime.loadModels()"
          />

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
            <option v-for="profile in runtime.providerStore.compatProfiles" :key="profile.id" :value="profile.id">{{ profile.label }}</option>
          </UiSelectField>
        </div>

        <div class="button-row button-row-tight">
          <button type="button" id="saveProviderBtn" class="btn-secondary" :disabled="!runtime.providerCanSaveCurrent.value" :title="saveCurrentTitle" @click="runtime.saveProviderProfile(false)">保存当前配置</button>
          <button type="button" id="saveAsProviderBtn" class="btn-secondary" :disabled="!runtime.providerCanSaveAs.value" :title="saveAsTitle" @click="runtime.saveProviderProfile(true)">另存为新配置</button>
        </div>
      </div>
    </div>
  </details>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { ChevronDown, Eye, X } from "lucide-vue-next";
import type { UseScimageRuntimeReturn } from "../../composables/useScimageRuntime";
import IconButton from "../ui/IconButton.vue";
import ProviderModelCombobox from "./ProviderModelCombobox.vue";
import UiSelectField from "../ui/UiSelectField.vue";

const props = defineProps<{
  open: boolean;
  runtime: UseScimageRuntimeReturn;
}>();

const emit = defineEmits<{
  toggle: [event: Event];
  "user-toggle": [];
}>();

const apiKeyVisible = ref(false);
const profileMenuOpen = ref(false);
const providerProfileTrigger = ref<HTMLButtonElement | null>(null);
const savedApiKeyHint = computed(() => props.runtime.providerStore.activeProfile?.api_key_hint || "");
const activeProfileLabel = computed(() => props.runtime.providerStore.profiles.find((profile) => profile.id === props.runtime.providerStore.activeProfileId)?.name || props.runtime.providerStore.activeProfile?.name || "");
const apiKeyPlaceholder = computed(() => (props.runtime.providerStore.activeProfile?.has_api_key && savedApiKeyHint.value ? `已保存：${savedApiKeyHint.value}` : "输入 API Key"));
const saveBlockMessage = computed(() => props.runtime.providerSaveBlockMessage.value);
const saveCurrentTitle = computed(() => {
  if (props.runtime.providerStore.isSaving) return "配置正在保存中。";
  if (!props.runtime.providerStore.activeProfileId) return "请先使用“另存为新配置”创建第一套配置。";
  return saveBlockMessage.value;
});
const saveAsTitle = computed(() => (props.runtime.providerStore.isSaving ? "配置正在保存中。" : saveBlockMessage.value));

function toggleProfileMenu() {
  if (props.runtime.providerStore.isSaving || !props.runtime.providerStore.hasProfiles) return;
  profileMenuOpen.value = !profileMenuOpen.value;
}

function closeProfileMenu() {
  profileMenuOpen.value = false;
}

function activateProfile(profileId: string) {
  closeProfileMenu();
  if (profileId === props.runtime.providerStore.activeProfileId) return;
  void props.runtime.activateProviderProfile(profileId);
}

function deleteProfile(profileId: string) {
  closeProfileMenu();
  void props.runtime.deleteProviderProfile(profileId);
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

onMounted(() => {
  document.addEventListener("click", onDocumentClick);
  document.addEventListener("keydown", onDocumentKeydown);
});

onUnmounted(() => {
  document.removeEventListener("click", onDocumentClick);
  document.removeEventListener("keydown", onDocumentKeydown);
});
</script>
