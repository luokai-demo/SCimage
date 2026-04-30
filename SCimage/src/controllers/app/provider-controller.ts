// @ts-nocheck

export function normalizeProviderProfilesState(payload = {}) {
  return {
    active_profile_id: payload.active_profile_id || null,
    compat_profiles: Array.isArray(payload.compat_profiles) ? payload.compat_profiles : [],
    profiles: Array.isArray(payload.profiles) ? payload.profiles : [],
    active_profile: payload.active_profile || null,
    is_ready: Boolean(payload.is_ready),
  };
}

export function createProviderController({
  apiRequest,
  providerStore,
  listTimeoutMs,
  actionTimeoutMs,
}) {
  let inFlight = null;
  let state = normalizeProviderProfilesState();

  function syncStore() {
    providerStore?.replaceState(state);
  }

  function getState() {
    return state;
  }

  function getInFlight() {
    return inFlight;
  }

  function setState(payload) {
    state = normalizeProviderProfilesState(payload);
    syncStore();
    return state;
  }

  async function load() {
    providerStore?.setLoading(true);
    try {
      const payload = await apiRequest("/api/provider-profiles", {
        method: "GET",
        timeoutMs: listTimeoutMs,
      });
      return setState(payload);
    } finally {
      providerStore?.setLoading(false);
    }
  }

  async function activate(profileId) {
    const payload = await apiRequest(`/api/provider-profiles/${profileId}/activate`, {
      method: "POST",
      timeoutMs: actionTimeoutMs,
    });
    return setState(payload);
  }

  function runMutation(task) {
    if (inFlight) {
      return inFlight;
    }
    providerStore?.setSaving(true);
    inFlight = (async () => {
      try {
        const payload = await task();
        return setState(payload);
      } finally {
        inFlight = null;
        providerStore?.setSaving(false);
      }
    })();
    return inFlight;
  }

  function save(profileId, payload) {
    return runMutation(() => apiRequest(`/api/provider-profiles/${profileId}`, {
      method: "PUT",
      body: payload,
      timeoutMs: actionTimeoutMs,
    }));
  }

  function create(payload) {
    return runMutation(() => apiRequest("/api/provider-profiles", {
      method: "POST",
      body: payload,
      timeoutMs: actionTimeoutMs,
    }));
  }

  function remove(profileId) {
    return runMutation(() => apiRequest(`/api/provider-profiles/${profileId}`, {
      method: "DELETE",
      timeoutMs: actionTimeoutMs,
    }));
  }

  return {
    activate,
    create,
    getInFlight,
    getState,
    load,
    remove,
    save,
    setState,
  };
}
