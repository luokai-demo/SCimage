import { onBeforeUnmount, ref } from "vue";

export function useNodeClickSuppressor() {
  const suppressNextNodeClickId = ref("");
  let suppressNodeClickTimer = 0;

  function shouldSuppressNodeClick(nodeId: string) {
    if (suppressNextNodeClickId.value !== nodeId) return false;
    suppressNextNodeClickId.value = "";
    return true;
  }

  function suppressNodeClick(nodeId: string) {
    suppressNextNodeClickId.value = nodeId;
    window.clearTimeout(suppressNodeClickTimer);
    suppressNodeClickTimer = window.setTimeout(() => {
      if (suppressNextNodeClickId.value === nodeId) suppressNextNodeClickId.value = "";
    }, 0);
  }

  function disposeNodeClickSuppressor() {
    window.clearTimeout(suppressNodeClickTimer);
    suppressNextNodeClickId.value = "";
  }

  onBeforeUnmount(disposeNodeClickSuppressor);

  return {
    disposeNodeClickSuppressor,
    shouldSuppressNodeClick,
    suppressNodeClick,
  };
}
