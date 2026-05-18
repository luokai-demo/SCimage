export async function runProviderWorkflowScenario(context) {
  const { page, state } = context;
  await page.locator("#providerConfigCard > summary").click();
  await page.waitForSelector("#providerConfigCard[open]", { state: "attached" });

  const invalidModelHint = await page.locator("#modelStatusHint").textContent();
  if (invalidModelHint !== "当前模型不在 API 返回列表中，将按手动输入保存。") {
    throw new Error(`已保存模型手动输入提示错误：${invalidModelHint || ""}`);
  }
  const saveAsDisabledBeforeModelSelect = await page.locator("#saveAsProviderBtn").isDisabled();
  if (saveAsDisabledBeforeModelSelect) {
    throw new Error("手动模型不应阻止另存为配置。");
  }

  await page.fill("#model", "supported-model");
  await page.waitForFunction(() => !document.querySelector("#saveAsProviderBtn")?.hasAttribute("disabled"));

  await page.fill("#baseUrl", "http://127.0.0.1:18081/v1");
  await page.waitForFunction(() => !document.querySelector("#saveAsProviderBtn")?.hasAttribute("disabled"));
  const staleModelHint = await page.locator("#modelStatusHint").textContent();
  if (staleModelHint !== "连接信息已变化，可重新拉取模型列表。") {
    throw new Error(`连接变化后模型列表提示错误：${staleModelHint || ""}`);
  }

  state.providerModels = [{ id: "fresh-model", label: "fresh-model", category: "image" }];
  await page.locator("#modelReloadBtn").click();
  await page.locator("#modelDropdownBtn").click();
  await page.waitForSelector("#providerModelMenu:not([hidden])", { state: "attached" });
  const imageModelText = await page.locator("#providerModelMenu .provider-model-option-btn[data-model-value='fresh-model']").textContent();
  if (!imageModelText?.includes("fresh-model") || !imageModelText.includes("图片")) {
    throw new Error(`模型浮层没有显示图片模型选项：${imageModelText || ""}`);
  }
  const readyModelHint = await page.locator("#modelStatusHint").textContent();
  if (readyModelHint !== "当前模型不在 API 返回列表中，将按手动输入保存。") {
    throw new Error(`重新拉取但保留手动模型时提示错误：${readyModelHint || ""}`);
  }
  await page.fill("#model", "fresh-model");
  await page.waitForFunction(() => !document.querySelector("#saveAsProviderBtn")?.hasAttribute("disabled"));

  await page.selectOption("#providerCompatProfile", "text-only");
  await page.waitForFunction(() => document.querySelector(".workflow-tab[data-workflow='image-to-image']")?.hasAttribute("disabled"));
  await page.waitForSelector("#quality option[value='hd']", { state: "attached" });
  await page.selectOption("#quality", "hd");
  await page.waitForSelector("#size option[value='1440x2560']", { state: "attached" });
  await page.selectOption("#size", "1440x2560");
  await page.fill("#prompt", "跨输出档位套用提示词");
  await page.locator("#togglePromptBankBtn").click();
  await page.getByRole("tab", { name: "已保存" }).click();
  await page.locator("#savePromptBtn").click();
  await page.waitForFunction(() => (
    [...document.querySelectorAll(".prompt-bank-item .prompt-text")]
      .some((node) => node.textContent === "跨输出档位套用提示词")
  ));
  await page.locator(".prompt-library-close").click();

  await page.selectOption("#providerCompatProfile", "openai");
  await page.waitForFunction(() => !document.querySelector(".workflow-tab[data-workflow='image-to-image']")?.hasAttribute("disabled"));
  await page.waitForSelector("#quality option[value='low']", { state: "attached" });
  await page.selectOption("#quality", "low");
  await page.selectOption("#size", "1:1");
  await page.fill("#prompt", "套用前占位");
  await page.locator("#togglePromptBankBtn").click();
  await page.getByRole("tab", { name: "已保存" }).click();
  await page.locator(".prompt-bank-item", { hasText: "跨输出档位套用提示词" }).locator("button", { hasText: "套用" }).click();
  await page.waitForFunction(() => document.querySelector("#prompt")?.value === "跨输出档位套用提示词");
  const appliedPromptOutput = await page.evaluate(() => {
    const quality = document.querySelector("#quality");
    const size = document.querySelector("#size");
    return {
      quality: quality?.value || "",
      size: size?.value || "",
      qualityValid: Boolean(quality && [...quality.options].some((option) => option.value === quality.value)),
      sizeValid: Boolean(size && [...size.options].some((option) => option.value === size.value)),
    };
  });
  if (
    appliedPromptOutput.quality !== "medium" ||
    appliedPromptOutput.size !== "9:16" ||
    !appliedPromptOutput.qualityValid ||
    !appliedPromptOutput.sizeValid
  ) {
    throw new Error(`跨输出档位套用提示词没有按当前兼容模式规范下拉值：${JSON.stringify(appliedPromptOutput)}`);
  }

  state.providerCompatProfiles = [
    { id: "openai", label: "OpenAI", output_profile_id: "aspect_v1", supports_image_to_image: false },
    { id: "text-only", label: "Text only", output_profile_id: "pixel_v1", supports_image_to_image: false },
  ];
  await page.locator("#saveProviderBtn").click();
  await page.waitForFunction(() => document.querySelector(".workflow-tab[data-workflow='image-to-image']")?.hasAttribute("disabled"));
  await page.locator(".gallery-item[data-job-id='job-completed'][data-image-slot='1'] .meta-actions button", { hasText: "参考" }).click({ force: true });
  await page.waitForFunction(() => document.querySelector("#status")?.textContent === "当前提供方配置不支持图生图。");
  const disabledWorkflowAfterReference = await page.locator(".workflow-tab.active").textContent();
  const disabledSourcePreviewCount = await page.locator(".source-preview-item").count();
  if (disabledWorkflowAfterReference !== "文生图" || disabledSourcePreviewCount !== 0) {
    throw new Error(`不支持图生图时仍然加入了参考图或切换了工作流：workflow=${disabledWorkflowAfterReference || ""}, sources=${disabledSourcePreviewCount}`);
  }
  state.providerCompatProfiles = [
    { id: "openai", label: "OpenAI", output_profile_id: "aspect_v1", supports_image_to_image: true },
    { id: "text-only", label: "Text only", output_profile_id: "pixel_v1", supports_image_to_image: false },
  ];
  await page.locator("#saveProviderBtn").click();
  await page.waitForFunction(() => !document.querySelector(".workflow-tab[data-workflow='image-to-image']")?.hasAttribute("disabled"));
}
