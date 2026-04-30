import { defineStore } from "pinia";

export const useUiStore = defineStore("ui", {
  state: () => ({
    mounted: false,
  }),
  actions: {
    markMounted() {
      this.mounted = true;
    },
  },
});
