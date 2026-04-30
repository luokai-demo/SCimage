import { computed, ref } from "vue";

const open = ref(false);
const query = ref("");
const selectedTokens = ref<string[]>([]);
const recentTokens = ref<string[]>([]);

export function usePromptLibraryDialog() {
  function setOpen(value: boolean) {
    open.value = value;
  }

  function markSelected(token: string) {
    if (!selectedTokens.value.includes(token)) {
      selectedTokens.value = [...selectedTokens.value, token];
    }
    recentTokens.value = [token, ...recentTokens.value.filter((item) => item !== token)].slice(0, 12);
  }

  function unmarkSelected(token: string) {
    selectedTokens.value = selectedTokens.value.filter((item) => item !== token);
  }

  function clearSelected() {
    selectedTokens.value = [];
  }

  function moveSelected(token: string, direction: -1 | 1) {
    const index = selectedTokens.value.indexOf(token);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= selectedTokens.value.length) return;
    const nextTokens = [...selectedTokens.value];
    [nextTokens[index], nextTokens[nextIndex]] = [nextTokens[nextIndex], nextTokens[index]];
    selectedTokens.value = nextTokens;
  }

  const selectedSet = computed(() => new Set(selectedTokens.value));

  return {
    open,
    query,
    selectedTokens,
    selectedSet,
    recentTokens,
    setOpen,
    markSelected,
    unmarkSelected,
    clearSelected,
    moveSelected,
  };
}
