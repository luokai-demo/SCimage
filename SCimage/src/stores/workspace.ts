import { defineStore } from "pinia";

export type WorkflowName = "generate" | "image-to-image";

export const useWorkspaceStore = defineStore("workspace", {
  state: () => ({
    activeWorkflow: "generate" as WorkflowName,
    isPanelCollapsed: false,
    sourceFileCount: 0,
  }),
  actions: {
    setWorkflow(workflow: WorkflowName) {
      this.activeWorkflow = workflow;
    },
    setPanelCollapsed(collapsed: boolean) {
      this.isPanelCollapsed = collapsed;
    },
    setSourceFileCount(count: number) {
      this.sourceFileCount = Math.max(0, count);
    },
  },
});
