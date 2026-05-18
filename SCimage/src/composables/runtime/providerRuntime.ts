import { computed, reactive } from "vue";
import {
  DEFAULT_OUTPUT_PROFILE_ID,
  normalizeOutputProfileId,
} from "../../data/outputOptions";
import { useProviderStore } from "../../stores/provider";
import { useWorkspaceStore, type WorkflowName } from "../../stores/workspace";
import {
  createProviderModelPicker,
  MODEL_LOADING_TEXT,
  type ProviderFormState,
} from "./providerModelPicker";
import { createProviderProfileActions } from "./providerProfileActions";
import type { StatusTone } from "./status";

interface ProviderRuntimeOptions {
  setStatus: (tone: StatusTone, message: string, timeoutMs?: number) => void;
  syncPromptWorkflowLabel: (workflow: WorkflowName) => void;
  persistWorkspaceState: () => Promise<void>;
}

export function createProviderRuntime(options: ProviderRuntimeOptions) {
  const providerForm = reactive<ProviderFormState>({
    name: "",
    base_url: "",
    api_key: "",
    model: "",
    compat_profile_id: "",
    supports_count_parameter: true,
  });
  let suppressProviderFormWatch = false;

  const selectedProviderProfile = computed(() => {
    const providerStore = useProviderStore();
    return providerStore.selectedProfile;
  });
  const selectedProviderSourceId = computed(() => selectedProviderProfile.value?.id || useProviderStore().activeProfileId || "");
  const selectedCompatProfile = computed(() => {
    const providerStore = useProviderStore();
    const selectedCompatProfileId = providerForm.compat_profile_id || providerStore.activeProfile?.compat_profile_id || providerStore.compatProfiles[0]?.id || "";
    return providerStore.compatProfiles.find((item) => item.id === selectedCompatProfileId) || null;
  });
  const providerWorkflowAvailability = computed<Record<WorkflowName, boolean>>(() => {
    const compat = selectedCompatProfile.value;
    return {
      generate: true,
      "image-to-image": compat ? compat.supports_image_to_image !== false : true,
    };
  });
  const activeOutputProfileId = computed(() => normalizeOutputProfileId(
    selectedCompatProfile.value?.output_profile_id || DEFAULT_OUTPUT_PROFILE_ID,
  ));
  const modelPickerRuntime = createProviderModelPicker({
    providerForm,
    getSelectedProviderSourceId: () => selectedProviderSourceId.value,
    setStatus: options.setStatus,
    shouldSuppressProviderFormWatch: () => suppressProviderFormWatch,
    setSuppressProviderFormWatch: (value) => {
      suppressProviderFormWatch = value;
    },
  });
  const {
    handleProviderConnectionChanged,
    invalidateModelPicker,
    loadModels,
    modelPicker,
    resetModelPicker,
  } = modelPickerRuntime;

  const providerSaveBlockMessage = computed(() => {
    if (!providerForm.base_url.trim()) return "请先填写 Base URL。";
    if (!providerForm.api_key.trim() && !selectedProviderSourceId.value) return "请先填写 API Key。";
    if (!providerForm.model.trim()) return "请填写模型。";
    if (modelPicker.status === "loading") return MODEL_LOADING_TEXT;
    return "";
  });
  const providerCanSave = computed(() => !useProviderStore().isSaving && !modelPicker.loading && !providerSaveBlockMessage.value);
  const providerCanSaveCurrent = computed(() => providerCanSave.value && Boolean(useProviderStore().activeProfileId));
  const providerCanSaveAs = computed(() => providerCanSave.value);
  const providerCanLoadModels = computed(() => (
    !useProviderStore().isSaving &&
    !modelPicker.loading &&
    Boolean(providerForm.base_url.trim()) &&
    Boolean(providerForm.api_key.trim() || selectedProviderSourceId.value)
  ));

  const profileActions = createProviderProfileActions({
    getSelectedProviderSourceId: () => selectedProviderSourceId.value,
    providerForm,
    providerCanSaveAs,
    providerCanSaveCurrent,
    providerSaveBlockMessage,
    setStatus: options.setStatus,
    setSuppressProviderFormWatch: (value) => {
      suppressProviderFormWatch = value;
    },
    syncProviderForm,
  });
  const {
    activateProviderProfile,
    deleteProviderProfile,
    loadProviderProfiles,
    saveProviderProfile,
    setProviderFormFromActiveProfile,
  } = profileActions;

  function syncProviderForm(syncOptions: { validateModels?: boolean } = {}) {
    const active = useProviderStore().activeProfile;
    invalidateModelPicker();
    setProviderFormFromActiveProfile();
    resetModelPicker();
    syncWorkflowAvailability();
    if (syncOptions.validateModels && active?.base_url && active.model && active.has_api_key !== false) {
      void loadModels({ preferredModel: active.model, sourceProfileId: active.id, showStatus: false });
    }
  }

  function syncWorkflowAvailability() {
    const workspaceStore = useWorkspaceStore();
    const availability = providerWorkflowAvailability.value;
    workspaceStore.setWorkflowAvailability("generate", availability.generate);
    workspaceStore.setWorkflowAvailability("image-to-image", availability["image-to-image"]);
    if (!availability[workspaceStore.activeWorkflow]) {
      workspaceStore.setWorkflow("generate");
      options.syncPromptWorkflowLabel("generate");
      void options.persistWorkspaceState();
    }
  }

  return {
    activateProviderProfile,
    activeOutputProfileId,
    deleteProviderProfile,
    handleProviderConnectionChanged,
    loadModels,
    loadProviderProfiles,
    modelPicker,
    providerCanLoadModels,
    providerCanSaveAs,
    providerCanSaveCurrent,
    providerForm,
    providerSaveBlockMessage,
    providerWorkflowAvailability,
    resetModelPicker,
    saveProviderProfile,
    selectedCompatProfile,
    syncWorkflowAvailability,
  };
}
