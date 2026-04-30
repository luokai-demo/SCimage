export const LIST_TIMEOUT_MS = 10000;
export const ACTION_TIMEOUT_MS = 20000;
export const POLL_INTERVAL_MS = 3000;
export const JOBS_PAGE_SIZE = 80;
export const GALLERY_PAGE_SIZE = 160;
export const JOBS_CLIENT_MAX_RETAINED = 600;
export const GALLERY_CLIENT_MAX_RETAINED = 1200;
export const TASK_LIST_MAX_RENDERED = 180;
export const TASK_LIST_VIRTUAL_ITEM_HEIGHT = 124;
export const TASK_LIST_VIRTUAL_OVERSCAN = 8;
export const JOBS_LOAD_MORE_THRESHOLD_PX = 900;
export const RUNNING_STATUSES = new Set(["queued", "running", "canceling"]);
export const GALLERY_PLACEHOLDER_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export const FORM_FIELD_IDS = ["prompt", "size", "quality", "count"];

export const LIGHTBOX_ZOOM_MIN = 1;
export const LIGHTBOX_ZOOM_MAX = 5;
export const LIGHTBOX_ZOOM_STEP = 0.25;

export const GALLERY_COLUMN_TARGET_WIDTH = 176;
export const GALLERY_COLUMN_MIN = 1;
export const GALLERY_COLUMN_MAX = 6;
export const GALLERY_GRID_ROW_HEIGHT_PX = 8;
export const GALLERY_GRID_GAP_PX = 12;
export const GALLERY_PRELOAD_SCREENS = 3;
export const GALLERY_PRELOAD_EXTRA_PX = 160;
export const GALLERY_VIRTUAL_OVERSCAN_SCREENS = 3;
export const GALLERY_VIRTUAL_ESTIMATED_HEIGHT_PX = 310;
export const GALLERY_VIRTUAL_MAX_CACHED_ITEMS = 180;
export const GALLERY_IMAGE_WARM_CONCURRENCY = 8;
export const GALLERY_IMAGE_WARM_MAX_ENTRIES = 220;
export const GALLERY_PREVIEW_WARM_CONCURRENCY = 16;
export const GALLERY_PREVIEW_WARM_MAX_ENTRIES = 260;
export const GALLERY_PREVIEW_WARM_BATCH_SIZE = 96;
