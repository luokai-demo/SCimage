import { ref } from "vue";
import type { MaintenanceCleanupPayload } from "../../contracts/api";
import { apiRequest } from "./apiClient";
import type { StatusTone } from "./status";

interface MaintenanceRuntimeOptions {
  setStatus: (tone: StatusTone, message: string, timeoutMs?: number) => void;
}

export function createMaintenanceRuntime(options: MaintenanceRuntimeOptions) {
  const isCleaningGeneratedDirs = ref(false);
  let cleanupGeneratedPromise: Promise<void> | null = null;

  async function cleanupEmptyGeneratedDirs() {
    if (cleanupGeneratedPromise) return cleanupGeneratedPromise;
    cleanupGeneratedPromise = (async () => {
      isCleaningGeneratedDirs.value = true;
      try {
        const payload = await apiRequest<MaintenanceCleanupPayload>("/api/maintenance/generated/cleanup-empty-dirs", { method: "POST" });
        options.setStatus("success", payload?.removed_count ? `已清理 ${payload.removed_count} 个空文件夹。` : "没有需要清理的空文件夹。", 2200);
      } catch (error) {
        options.setStatus("error", error instanceof Error ? error.message : String(error));
      } finally {
        isCleaningGeneratedDirs.value = false;
        cleanupGeneratedPromise = null;
      }
    })();
    return cleanupGeneratedPromise;
  }

  return {
    cleanupEmptyGeneratedDirs,
    isCleaningGeneratedDirs,
  };
}
