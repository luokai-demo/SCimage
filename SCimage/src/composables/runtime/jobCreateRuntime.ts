import { ref, type Ref } from "vue";
import type { CreateJobResponse } from "../../contracts/api";
import type { WorkflowName } from "../../stores/workspace";
import { usePromptLibraryDialog } from "../usePromptLibraryDialog";
import { apiRequest } from "./apiClient";
import type { SourceImageItem } from "./sourceImages";
import type { StatusTone } from "./status";
import type { RuntimeWorkspaceForm } from "./workspacePersistence";

interface JobCreateRuntimeOptions {
  currentForm: () => RuntimeWorkspaceForm;
  getActiveWorkflow: () => WorkflowName;
  getSourceImages: () => SourceImageItem[];
  isCreatingJob?: Ref<boolean>;
  normalizeCurrentOutputForm: () => void;
  persistWorkspaceState: () => Promise<void>;
  refreshJobs: (options?: { silent?: boolean; reset?: boolean }) => Promise<void>;
  setStatus: (tone: StatusTone, message: string, timeoutMs?: number) => void;
}

export function createJobCreateRuntime(options: JobCreateRuntimeOptions) {
  const isCreatingJob = options.isCreatingJob || ref(false);
  let createJobInFlight: Promise<unknown> | null = null;

  async function generate() {
    if (createJobInFlight) return createJobInFlight;
    const form = options.currentForm();
    options.normalizeCurrentOutputForm();
    const prompt = form.prompt.trim();
    if (!prompt) {
      options.setStatus("error", "请输入提示词。", 2200);
      return;
    }
    const workflow = options.getActiveWorkflow();
    const sourceImages = options.getSourceImages();
    const base = { workflow, prompt, quality: form.quality, size: form.size, count: Number.parseInt(form.count, 10) || 1 };
    const body = buildCreateJobBody(workflow, base, sourceImages);
    if (!body) {
      options.setStatus("error", "请先上传至少 1 张参考图。", 2200);
      return;
    }

    createJobInFlight = (async () => {
      isCreatingJob.value = true;
      options.setStatus("loading", "正在创建任务...");
      await options.persistWorkspaceState();
      try {
        const job = await apiRequest<CreateJobResponse>("/api/jobs", { method: "POST", body, timeoutMs: 30000 });
        usePromptLibraryDialog().setOpen(false);
        await options.refreshJobs({ silent: true, reset: true });
        options.setStatus("success", `任务已创建，开始请求生成 ${job.count || base.count} 张图片。`, 2600);
      } catch (error) {
        options.setStatus("error", error instanceof Error ? error.message : String(error));
      } finally {
        createJobInFlight = null;
        isCreatingJob.value = false;
      }
    })();
    return createJobInFlight;
  }

  return {
    generate,
    isCreatingJob,
  };
}

function buildCreateJobBody(
  workflow: WorkflowName,
  base: Record<string, unknown>,
  sourceImages: SourceImageItem[],
) {
  if (workflow !== "image-to-image") return base;
  if (!sourceImages.length) return null;
  const formData = new FormData();
  Object.entries(base).forEach(([key, value]) => formData.append(key, String(value)));
  sourceImages.forEach((item) => {
    formData.append("source_image", item.file, item.name);
    formData.append("source_image_origin", JSON.stringify(item.origin || null));
  });
  return formData;
}
