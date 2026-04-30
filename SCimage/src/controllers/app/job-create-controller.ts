// @ts-nocheck

export function createJobCreateController({
  elements,
  actionTimeoutMs,
  apiRequest,
  getActiveWorkflow,
  getSelectedSourceFiles,
  normalizeWorkflow,
  readOutputParamsFromUi,
  refreshJobs,
  saveActiveWorkflowForm,
  setStatus,
  syncPrimaryActionState,
}) {
  let inFlight = null;

  function getInFlight() {
    return inFlight;
  }

  function buildRequestBody(workflow, prompt, outputParams) {
    const basePayload = {
      workflow,
      prompt,
      quality: outputParams.quality,
      size: outputParams.size,
      count: Number.parseInt(elements.count.value, 10) || 1,
    };

    if (workflow !== "image-to-image") {
      return basePayload;
    }

    const sourceFiles = getSelectedSourceFiles();
    if (!sourceFiles.length) {
      alert("请先上传至少 1 张参考图");
      return null;
    }

    const formData = new FormData();
    Object.entries(basePayload).forEach(([key, value]) => {
      formData.append(key, String(value));
    });
    sourceFiles.forEach((file) => {
      formData.append("source_image", file, file.name);
    });
    return formData;
  }

  async function generate(workflowOverride) {
    if (inFlight) {
      return inFlight;
    }

    const workflow = normalizeWorkflow(workflowOverride || getActiveWorkflow(), "");
    if (!workflow) {
      setStatus("error", "当前工作流无效，请重新选择文生图或图生图。", { timeoutMs: 2400 });
      return null;
    }

    const prompt = elements.prompt.value.trim();
    if (!prompt) {
      alert("请输入提示词");
      elements.prompt.focus();
      return null;
    }

    const outputParams = readOutputParamsFromUi();
    if (!outputParams) {
      return null;
    }

    const payload = buildRequestBody(workflow, prompt, outputParams);
    if (!payload) {
      syncPrimaryActionState(false);
      return null;
    }

    inFlight = (async () => {
      syncPrimaryActionState(true);
      saveActiveWorkflowForm(workflow);
      setStatus("loading", "正在创建任务...");

      try {
        const job = await apiRequest("/api/jobs", {
          method: "POST",
          body: payload,
          timeoutMs: actionTimeoutMs,
        });

        await refreshJobs({ silent: true });
        setStatus("success", `任务已创建，开始请求生成 ${job.count} 张图片。`, { timeoutMs: 2600 });
        return job;
      } catch (error) {
        console.error("Create job failed:", error);
        setStatus("error", error.message);
        return null;
      } finally {
        inFlight = null;
        syncPrimaryActionState(false);
      }
    })();

    return inFlight;
  }

  return {
    buildRequestBody,
    generate,
    getInFlight,
  };
}
