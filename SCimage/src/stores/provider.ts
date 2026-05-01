import { defineStore } from "pinia";

export interface ProviderProfileSummary {
  id: string;
  name: string;
  base_url?: string;
  model?: string;
  compat_profile_id?: string;
  supports_count_parameter?: boolean;
  api_key?: string;
  has_api_key?: boolean;
  api_key_hint?: string;
}

export interface ProviderCompatProfile {
  id: string;
  label: string;
  output_profile_id?: string;
  supports_image_to_image?: boolean;
}

export interface ProviderProfilesState {
  active_profile_id: string | null;
  compat_profiles: ProviderCompatProfile[];
  profiles: ProviderProfileSummary[];
  active_profile: ProviderProfileSummary | null;
  is_ready: boolean;
}

export const useProviderStore = defineStore("provider", {
  state: () => ({
    activeProfileId: "" as string,
    profiles: [] as ProviderProfileSummary[],
    compatProfiles: [] as ProviderCompatProfile[],
    activeProfile: null as ProviderProfileSummary | null,
    isReady: false,
    isSaving: false,
    isLoading: false,
    message: "",
  }),
  getters: {
    selectedProfile: (state) => state.profiles.find((profile) => profile.id === state.activeProfileId) || state.activeProfile || null,
    hasProfiles: (state) => state.profiles.length > 0,
  },
  actions: {
    replaceProfiles(profiles: ProviderProfileSummary[], activeProfileId = "") {
      this.profiles = profiles;
      this.activeProfileId = activeProfileId || this.activeProfileId || "";
    },
    replaceState(state: ProviderProfilesState) {
      this.activeProfileId = state.active_profile_id || "";
      this.profiles = state.profiles;
      this.compatProfiles = state.compat_profiles;
      this.activeProfile = state.active_profile;
      this.isReady = state.is_ready;
    },
    setSaving(isSaving: boolean) {
      this.isSaving = isSaving;
    },
    setLoading(isLoading: boolean) {
      this.isLoading = isLoading;
    },
    setMessage(message: string) {
      this.message = message;
    },
  },
});
