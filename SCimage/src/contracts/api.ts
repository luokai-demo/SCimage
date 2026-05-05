import type {
  GenealogyEdge,
  GenealogyFamily,
  GenealogyNode,
  GenealogyPositionMap,
} from "../stores/genealogy";

export interface ApiJobImage {
  slot?: number;
  url?: string;
  name?: string;
  width?: number;
  height?: number;
  preview?: {
    url?: string;
    name?: string;
    width?: number;
    height?: number;
    [key: string]: unknown;
  };
  placeholder?: {
    color?: string;
    accent_color?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ApiJobSummary {
  id?: string;
  status?: string;
  workflow?: string;
  prompt?: string;
  message?: string;
  error?: string;
  warnings?: unknown[];
  count?: number;
  image_count?: number;
  quality?: string;
  size?: string;
  model?: string;
  compat_profile_id?: string;
  output_profile_id?: string;
  outputProfileId?: string;
  created_at?: string;
  run_started_at?: string;
  updated_at?: string;
  source_images?: unknown[];
  images?: ApiJobImage[];
  [key: string]: unknown;
}

export type CreateJobResponse = ApiJobSummary;

export type JobActionResponse = ApiJobSummary & {
  ok?: boolean;
  deleted_id?: string;
};

export interface JobsPagePayload {
  jobs?: ApiJobSummary[];
  total?: number;
  has_more?: boolean;
  page_size?: number;
  limit?: number;
  next_offset?: number;
  next_cursor?: string;
  [key: string]: unknown;
}

export interface ApiGalleryImagePageItem {
  job?: ApiJobSummary;
  image?: ApiJobImage;
  job_id?: string;
  slot?: number;
  url?: string;
  preview_url?: string;
  name?: string;
  prompt?: string;
  status?: string;
  workflow?: string;
  count?: number;
  image_count?: number;
  created_at?: string;
  updated_at?: string;
  width?: number;
  height?: number;
  placeholder?: {
    color?: string;
    accent_color?: string;
    [key: string]: unknown;
  };
  quality?: string;
  size?: string;
  output_profile_id?: string;
  outputProfileId?: string;
  [key: string]: unknown;
}

export interface GalleryImagesPagePayload {
  items?: ApiGalleryImagePageItem[];
  total?: number;
  has_more?: boolean;
  page_size?: number;
  limit?: number;
  next_cursor?: string;
  [key: string]: unknown;
}

export interface ProviderModelPayload {
  id?: string;
  label?: string;
  category?: string;
}

export interface ProviderModelsPayload {
  normalized_base_url?: string;
  models?: ProviderModelPayload[];
  data?: ProviderModelPayload[];
}

export interface GenealogyGraphApiPayload {
  families: GenealogyFamily[];
  nodes: GenealogyNode[];
  edges: GenealogyEdge[];
  positions?: GenealogyPositionMap;
}

export interface WorkspaceOutputFormPayload {
  prompt?: unknown;
  size?: unknown;
  quality?: unknown;
  count?: unknown;
  workflow?: unknown;
  outputProfileId?: unknown;
  output_profile_id?: unknown;
}

export interface PromptBankEntryPayload extends WorkspaceOutputFormPayload {
  id?: unknown;
  createdAt?: unknown;
  created_at?: unknown;
  updatedAt?: unknown;
  updated_at?: unknown;
}

export type PromptBankPayload = PromptBankEntryPayload[] | Partial<Record<"generate" | "image-to-image", PromptBankEntryPayload[]>>;

export interface WorkspaceStatePayload {
  active_workflow?: unknown;
  forms?: Partial<Record<"generate" | "image-to-image", WorkspaceOutputFormPayload>>;
  prompt_bank?: PromptBankPayload;
  saved_prompts?: PromptBankPayload;
  ui?: {
    gallery?: {
      filter?: unknown;
    };
  };
}

export interface MaintenanceCleanupPayload {
  removed_count?: number;
}
