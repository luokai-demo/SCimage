export type StatusTone = "loading" | "success" | "warning" | "error" | "";

export interface RuntimeStatusState {
  tone: StatusTone;
  message: string;
}

export function createStatusController(status: RuntimeStatusState) {
  let statusTimer = 0;
  return {
    setStatus(tone: StatusTone, message: string, timeoutMs = 0) {
      window.clearTimeout(statusTimer);
      status.tone = tone;
      status.message = message;
      if (timeoutMs) {
        statusTimer = window.setTimeout(() => {
          status.tone = "";
          status.message = "";
        }, timeoutMs);
      }
    },
    clearStatusTimer() {
      window.clearTimeout(statusTimer);
    },
  };
}
