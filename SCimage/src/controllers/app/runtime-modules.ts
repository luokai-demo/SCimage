// @ts-nocheck

let loadedModules = null;

export async function loadRuntimeModules() {
  if (loadedModules) {
    return loadedModules;
  }

  await import("../../runtime/source-image-store.js");
  await import("../../runtime/output-options.js");
  await import("../../runtime/workflow-state.js");
  await import("../workspace-panel-runtime.js");
  await import("../../runtime/gallery-runtime.js");
  await import("../../runtime/gallery-layout-controller.js");
  await import("../../runtime/gallery-grouping.js");
  await import("../provider-model-picker-runtime.js");
  await import("../provider-profile-picker-runtime.js");

  loadedModules = {
    OUTPUT_OPTIONS: window.OutputOptions,
    WORKFLOW_STATE: window.WorkflowState,
    GALLERY_RUNTIME: window.GalleryRuntime,
    GALLERY_LAYOUT: window.GalleryLayoutController,
    GALLERY_GROUPING: window.GalleryGrouping,
  };

  if (
    !loadedModules.OUTPUT_OPTIONS ||
    !loadedModules.WORKFLOW_STATE ||
    !loadedModules.GALLERY_RUNTIME ||
    !loadedModules.GALLERY_LAYOUT ||
    !loadedModules.GALLERY_GROUPING
  ) {
    throw new Error("SCimage frontend runtime modules failed to load.");
  }

  return loadedModules;
}
