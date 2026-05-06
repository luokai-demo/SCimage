import { computed, reactive, type ComputedRef, type Ref } from "vue";
import {
  getDefaultQuality,
  getDefaultSizeOption,
  getQualityOptions,
  getSizeOptionsForValue,
  normalizeOutputForm,
  normalizeQuality,
  normalizeSizeOption,
} from "../../data/outputOptions";
import { usePromptStore } from "../../stores/prompts";
import { useWorkspaceStore, type WorkflowName } from "../../stores/workspace";
import { getOutputOptionSummary } from "../../utils/jobFormatters";
import type { SourceImageItem } from "./sourceImages";
import type { StatusTone } from "./status";
import type { RuntimeWorkspaceForm } from "./workspacePersistence";

const WORKFLOWS: WorkflowName[] = ["generate", "image-to-image"];

interface WorkspaceFormRuntimeOptions {
  activeOutputProfileId: Ref<string>;
  isCreatingJob: Ref<boolean>;
  providerWorkflowAvailability: ComputedRef<Record<WorkflowName, boolean>>;
  getSourceImages: () => SourceImageItem[];
  clearSourceImages: () => void;
  persistWorkspaceState: () => Promise<void>;
  setStatus: (tone: StatusTone, message: string, timeoutMs?: number) => void;
}

export function createWorkspaceFormRuntime(options: WorkspaceFormRuntimeOptions) {
  const forms = reactive<Record<WorkflowName, RuntimeWorkspaceForm>>({
    generate: createDefaultWorkspaceForm(),
    "image-to-image": createDefaultWorkspaceForm(),
  });
  const currentWorkflowForm = computed(() => forms[useWorkspaceStore().activeWorkflow]);
  const qualityOptions = computed(() => getQualityOptions(options.activeOutputProfileId.value));
  const sizeOptions = computed(() => (
    getSizeOptionsForValue(
      currentWorkflowForm.value.quality,
      currentWorkflowForm.value.size,
      options.activeOutputProfileId.value,
    )
  ));
  const canGenerate = computed(() => {
    const workspaceStore = useWorkspaceStore();
    const form = forms[workspaceStore.activeWorkflow];
    if (options.isCreatingJob.value) return false;
    if (!options.providerWorkflowAvailability.value[workspaceStore.activeWorkflow]) return false;
    if (!form.prompt.trim()) return false;
    if (workspaceStore.activeWorkflow === "image-to-image" && !options.getSourceImages().length) return false;
    return true;
  });

  function currentForm() {
    return forms[useWorkspaceStore().activeWorkflow];
  }

  function getOutputSummary(
    form: Pick<RuntimeWorkspaceForm, "size" | "quality" | "count"> & { workflow?: string },
    outputProfileId = options.activeOutputProfileId.value,
  ) {
    return getOutputOptionSummary(form as Record<string, unknown>, outputProfileId);
  }

  function normalizeCurrentOutputForm() {
    applyNormalizedForm(currentForm(), normalizeOutputForm(currentForm(), options.activeOutputProfileId.value));
  }

  function syncOutputFormsForProfile() {
    WORKFLOWS.forEach((workflow) => {
      applyNormalizedForm(forms[workflow], normalizeOutputForm(forms[workflow], options.activeOutputProfileId.value));
    });
  }

  function syncCurrentSizeForQuality(preferredSize?: string) {
    const form = currentForm();
    form.quality = normalizeQuality(
      form.quality,
      getDefaultQuality(options.activeOutputProfileId.value),
      options.activeOutputProfileId.value,
    );
    form.size = normalizeSizeOption(
      preferredSize ?? form.size,
      getDefaultSizeOption(),
      form.quality,
      options.activeOutputProfileId.value,
    );
  }

  function resetFormState() {
    WORKFLOWS.forEach((workflow) => {
      applyNormalizedForm(forms[workflow], normalizeOutputForm({}, options.activeOutputProfileId.value));
    });
    options.clearSourceImages();
    useWorkspaceStore().setWorkflow("generate");
    syncPromptWorkflowLabel("generate");
    void options.persistWorkspaceState();
    options.setStatus("success", "表单已重置。", 2000);
  }

  function setWorkflow(workflow: WorkflowName) {
    if (!options.providerWorkflowAvailability.value[workflow]) {
      options.setStatus("error", "当前提供方配置不支持图生图。", 2400);
      return false;
    }
    useWorkspaceStore().setWorkflow(workflow);
    syncPromptWorkflowLabel(workflow);
    void options.persistWorkspaceState();
    return true;
  }

  return {
    canGenerate,
    currentForm,
    currentWorkflowForm,
    forms,
    getOutputSummary,
    normalizeCurrentOutputForm,
    qualityOptions,
    resetFormState,
    setWorkflow,
    sizeOptions,
    syncCurrentSizeForQuality,
    syncOutputFormsForProfile,
    syncPromptWorkflowLabel,
  };
}

export function syncPromptWorkflowLabel(workflow: WorkflowName) {
  const promptStore = usePromptStore();
  promptStore.setActiveWorkflow(workflow);
  promptStore.setEmptyLabel(`还没有保存的${workflow === "image-to-image" ? "图生图" : "文生图"}提示词`);
}

function createDefaultWorkspaceForm(): RuntimeWorkspaceForm {
  return {
    prompt: "",
    size: getDefaultSizeOption(),
    quality: getDefaultQuality(),
    count: "1",
  };
}

function applyNormalizedForm(target: RuntimeWorkspaceForm, normalized: RuntimeWorkspaceForm) {
  target.prompt = normalized.prompt;
  target.quality = normalized.quality;
  target.size = normalized.size;
  target.count = normalized.count;
}
