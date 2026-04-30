import { ref } from "vue";

const open = ref(false);

export function usePromptLibraryDialog() {
  function setOpen(value: boolean) {
    open.value = value;
  }

  return { open, setOpen };
}
