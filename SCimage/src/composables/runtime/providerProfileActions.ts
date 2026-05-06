import { nextTick } from "vue";
import type { ProviderProfilesState } from "../../stores/provider";
import { useProviderStore } from "../../stores/provider";
import { useConfirmDialog } from "../useConfirmDialog";
import { apiRequest } from "./apiClient";
import { normalizeProviderState } from "./providerProfiles";
import type { ProviderFormState } from "./providerModelPicker";
import type { StatusTone } from "./status";

interface ProviderProfileActionsOptions {
  getSelectedProviderSourceId: () => string;
  providerForm: ProviderFormState;
  providerCanSaveAs: { value: boolean };
  providerCanSaveCurrent: { value: boolean };
  providerSaveBlockMessage: { value: string };
  setStatus: (tone: StatusTone, message: string, timeoutMs?: number) => void;
  setSuppressProviderFormWatch: (value: boolean) => void;
  syncProviderForm: (options?: { validateModels?: boolean }) => void;
}

export function createProviderProfileActions(options: ProviderProfileActionsOptions) {
  async function loadProviderProfiles() {
    const providerStore = useProviderStore();
    providerStore.setLoading(true);
    try {
      const payload = normalizeProviderState(await apiRequest<ProviderProfilesState>("/api/provider-profiles", { method: "GET" }));
      providerStore.replaceState(payload);
      options.syncProviderForm({ validateModels: true });
    } finally {
      providerStore.setLoading(false);
    }
  }

  async function activateProviderProfile(profileId: string) {
    if (!profileId) return;
    const providerStore = useProviderStore();
    providerStore.setSaving(true);
    try {
      const payload = normalizeProviderState(await apiRequest<ProviderProfilesState>(`/api/provider-profiles/${profileId}/activate`, { method: "POST" }));
      providerStore.replaceState(payload);
      options.syncProviderForm({ validateModels: true });
      options.setStatus("success", "已切换当前配置。", 1800);
    } catch (error) {
      options.setStatus("error", error instanceof Error ? error.message : String(error));
    } finally {
      providerStore.setSaving(false);
    }
  }

  async function saveProviderProfile(asNew = false) {
    const providerStore = useProviderStore();
    if (asNew ? !options.providerCanSaveAs.value : !options.providerCanSaveCurrent.value) {
      options.setStatus("error", !asNew && !providerStore.activeProfileId ? "请先使用“另存为新配置”创建第一套配置。" : options.providerSaveBlockMessage.value, 2200);
      return;
    }
    providerStore.setSaving(true);
    try {
      const selectedId = providerStore.activeProfileId;
      if (!asNew && !selectedId) {
        options.setStatus("error", "请先另存为新配置。", 2200);
        return;
      }
      const path = asNew ? "/api/provider-profiles" : `/api/provider-profiles/${selectedId}`;
      const method = asNew ? "POST" : "PUT";
      const body = providerPayload();
      if (asNew && !String(body.api_key || "").trim() && options.getSelectedProviderSourceId()) {
        body.source_profile_id = options.getSelectedProviderSourceId();
      }
      const payload = normalizeProviderState(await apiRequest<ProviderProfilesState>(path, { method, body }));
      providerStore.replaceState(payload);
      options.syncProviderForm({ validateModels: true });
      options.setStatus("success", asNew ? "新配置已保存。" : "当前配置已保存。", 2200);
    } catch (error) {
      options.setStatus("error", error instanceof Error ? error.message : String(error));
    } finally {
      providerStore.setSaving(false);
    }
  }

  async function deleteProviderProfile(profileId: string) {
    if (!profileId) return;
    const providerStore = useProviderStore();
    const targetProfile = providerStore.profiles.find((profile) => profile.id === profileId) || null;
    if (!targetProfile) {
      options.setStatus("error", "要删除的配置不存在。", 2200);
      return;
    }
    const isLastProfile = providerStore.profiles.length === 1;
    const isActiveProfile = targetProfile.id === providerStore.activeProfileId;
    let description = `确定删除配置「${targetProfile.name}」吗？`;
    if (isLastProfile) {
      description = `确定删除配置「${targetProfile.name}」吗？删除后需要重新创建提供方配置。`;
    } else if (isActiveProfile) {
      description = `确定删除当前配置「${targetProfile.name}」吗？删除后会自动切换到其他已保存配置。`;
    }
    const confirmed = await useConfirmDialog().confirm({
      title: "删除 API 配置",
      description,
      confirmText: "删除配置",
      tone: "danger",
    });
    if (!confirmed) return;
    providerStore.setSaving(true);
    try {
      const payload = normalizeProviderState(await apiRequest<ProviderProfilesState>(`/api/provider-profiles/${targetProfile.id}`, { method: "DELETE" }));
      providerStore.replaceState(payload);
      options.syncProviderForm({ validateModels: true });
      options.setStatus("success", "配置已删除。", 2200);
    } catch (error) {
      options.setStatus("error", error instanceof Error ? error.message : String(error));
    } finally {
      providerStore.setSaving(false);
    }
  }

  function providerPayload() {
    const payload: Record<string, unknown> = {
      name: options.providerForm.name.trim(),
      base_url: options.providerForm.base_url.trim(),
      model: options.providerForm.model.trim(),
      supports_count_parameter: options.providerForm.supports_count_parameter,
      compat_profile_id: options.providerForm.compat_profile_id,
    };
    if (options.providerForm.api_key.trim()) payload.api_key = options.providerForm.api_key.trim();
    return payload;
  }

  function setProviderFormFromActiveProfile() {
    const providerStore = useProviderStore();
    const active = providerStore.activeProfile;
    options.setSuppressProviderFormWatch(true);
    options.providerForm.name = active?.name || "";
    options.providerForm.base_url = active?.base_url || "";
    options.providerForm.model = active?.model || "";
    options.providerForm.compat_profile_id = active?.compat_profile_id || providerStore.compatProfiles[0]?.id || "";
    options.providerForm.supports_count_parameter = active?.supports_count_parameter !== false;
    options.providerForm.api_key = active?.api_key || "";
    void nextTick(() => {
      options.setSuppressProviderFormWatch(false);
    });
  }

  return {
    activateProviderProfile,
    deleteProviderProfile,
    loadProviderProfiles,
    saveProviderProfile,
    setProviderFormFromActiveProfile,
  };
}
