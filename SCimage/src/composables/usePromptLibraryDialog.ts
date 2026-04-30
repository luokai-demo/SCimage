import { ref } from "vue";

const open = ref(false);
const query = ref("");

export function usePromptLibraryDialog() {
  function setOpen(value: boolean) {
    open.value = value;
  }

  return {
    open,
    query,
    setOpen,
  };
}
