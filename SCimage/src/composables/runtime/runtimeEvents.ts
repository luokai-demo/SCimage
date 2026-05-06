interface RuntimeEventsOptions {
  onRuntimeUpdate: () => void;
  fallbackIntervalMs?: number;
  updateDebounceMs?: number;
}

export interface RuntimeEventsController {
  connect: () => void;
}

export function createRuntimeEventsController(options: RuntimeEventsOptions): RuntimeEventsController {
  let eventSource: EventSource | null = null;
  let fallbackTimer = 0;
  let reconnectTimer = 0;
  let reconnectAttempts = 0;
  let updateTimer = 0;

  function connect() {
    if (eventSource) return;
    if (typeof window.EventSource !== "function") {
      startFallbackTimer();
      return;
    }
    stopFallbackTimer();
    eventSource = new EventSource("/api/events");
    eventSource.onopen = handleEventSourceOpen;
    eventSource.addEventListener("runtime-update", handleRuntimeUpdate);
    eventSource.onerror = handleEventSourceError;
  }

  function handleEventSourceOpen() {
    reconnectAttempts = 0;
    stopFallbackTimer();
  }

  function handleRuntimeUpdate() {
    reconnectAttempts = 0;
    scheduleRuntimeUpdate();
  }

  function handleEventSourceError() {
    closeEventSource();
    startFallbackTimer();
    scheduleReconnect();
  }

  function scheduleReconnect() {
    window.clearTimeout(reconnectTimer);
    const delay = Math.min(30000, 1000 * 2 ** Math.min(reconnectAttempts, 5));
    reconnectAttempts += 1;
    reconnectTimer = window.setTimeout(connect, delay);
  }

  function startFallbackTimer() {
    window.clearInterval(fallbackTimer);
    fallbackTimer = window.setInterval(scheduleRuntimeUpdate, options.fallbackIntervalMs || 30000);
  }

  function stopFallbackTimer() {
    window.clearInterval(fallbackTimer);
    fallbackTimer = 0;
  }

  function closeEventSource() {
    if (!eventSource) return;
    eventSource.removeEventListener("runtime-update", handleRuntimeUpdate);
    eventSource.close();
    eventSource = null;
  }

  function scheduleRuntimeUpdate() {
    if (updateTimer) return;
    updateTimer = window.setTimeout(() => {
      updateTimer = 0;
      options.onRuntimeUpdate();
    }, options.updateDebounceMs || 120);
  }

  return {
    connect,
  };
}
