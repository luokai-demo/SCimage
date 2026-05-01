import { defineStore } from "pinia";

export type WorkflowName = "generate" | "image-to-image";

export const useWorkspaceStore = defineStore("workspace", {
  state: () => ({
    activeWorkflow: "generate" as WorkflowName,
    isPanelCollapsed: false,
    sourceFileCount: 0,
    workflowAvailability: {
      generate: true,
      "image-to-image": true,
    } as Record<WorkflowName, boolean>,
  }),
  actions: {
    setWorkflow(workflow: WorkflowName) {
      this.activeWorkflow = workflow;
    },
    setWorkflowAvailability(workflow: WorkflowName, available: boolean) {
      this.workflowAvailability[workflow] = available;
    },
    setPanelCollapsed(collapsed: boolean) {
      this.isPanelCollapsed = collapsed;
    },
    setSourceFileCount(count: number) {
      this.sourceFileCount = Math.max(0, count);
    },
  },
});
