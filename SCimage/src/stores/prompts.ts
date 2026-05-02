import { defineStore } from "pinia";

export interface SavedPrompt {
  id: string;
  workflow: string;
  prompt: string;
  outputProfileId?: string;
  size?: string;
  quality?: string;
  count?: number | string;
  optionSummary?: string;
  savedAtText?: string;
  createdAt?: string;
  updatedAt?: string;
}

export const usePromptStore = defineStore("prompts", {
  state: () => ({
    prompts: [] as SavedPrompt[],
    activeWorkflow: "generate",
    emptyLabel: "还没有保存的提示词",
    query: "",
  }),
  getters: {
    activePrompts: (state) => state.prompts.filter((item) => item.workflow === state.activeWorkflow),
    filteredPrompts(): SavedPrompt[] {
      const keyword = this.query.trim().toLowerCase();
      if (!keyword) {
        return this.activePrompts;
      }
      return this.activePrompts.filter((item) => (
        item.prompt.toLowerCase().includes(keyword) ||
        (item.optionSummary || "").toLowerCase().includes(keyword)
      ));
    },
  },
  actions: {
    setActiveWorkflow(workflow: string) {
      this.activeWorkflow = workflow;
    },
    setEmptyLabel(label: string) {
      this.emptyLabel = label;
    },
    setQuery(query: string) {
      this.query = query;
    },
    replacePrompts(prompts: SavedPrompt[]) {
      this.prompts = prompts;
    },
  },
});
