import { reactive } from "vue";

interface ConfirmDialogOptions {
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  tone?: "default" | "danger";
}

interface ConfirmDialogState extends Required<ConfirmDialogOptions> {
  open: boolean;
  resolver: ((value: boolean) => void) | null;
}

const state = reactive<ConfirmDialogState>({
  open: false,
  title: "",
  description: "",
  confirmText: "确定",
  cancelText: "取消",
  tone: "default",
  resolver: null,
});

export function useConfirmDialog() {
  function confirm(options: ConfirmDialogOptions) {
    state.resolver?.(false);
    state.title = options.title;
    state.description = options.description;
    state.confirmText = options.confirmText || "确定";
    state.cancelText = options.cancelText || "取消";
    state.tone = options.tone || "default";
    return new Promise<boolean>((resolve) => {
      state.resolver = resolve;
      state.open = true;
    });
  }

  function resolve(value: boolean) {
    state.open = false;
    state.resolver?.(value);
    state.resolver = null;
  }

  return { state, confirm, resolve };
}
