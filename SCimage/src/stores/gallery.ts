import { defineStore } from "pinia";

export type GalleryFilter = "all" | "tasks" | "prompts";

export interface GalleryPaginationState {
  total: number;
  hasMore: boolean;
  pageSize: number;
  nextCursor: string;
  isLoadingMore: boolean;
}

export interface GalleryFlatItem {
  src: string;
  previewSrc: string;
  prompt: string;
  filename: string;
  jobId: string;
  slot: number;
}

export interface GalleryImagePageItem {
  job?: {
    id?: string;
    prompt?: string;
    created_at?: string;
    updated_at?: string;
    [key: string]: unknown;
  };
  image?: {
    slot?: number;
    url?: string;
    name?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export const useGalleryStore = defineStore("gallery", {
  state: () => ({
    filter: "all" as GalleryFilter,
    sortAsc: false,
    selectedKeys: new Set<string>(),
    pageItems: [] as GalleryImagePageItem[],
    flatItems: [] as GalleryFlatItem[],
    pagination: {
      total: 0,
      hasMore: false,
      pageSize: 160,
      nextCursor: "",
      isLoadingMore: false,
    } as GalleryPaginationState,
    loadedCount: 0,
    totalCount: 0,
  }),
  getters: {
    selectedCount: (state) => state.selectedKeys.size,
    hasItems: (state) => state.flatItems.length > 0,
    selectedItems: (state) => state.flatItems.filter((item) => state.selectedKeys.has(`${item.jobId || ""}:${Number(item.slot || 0)}`)),
  },
  actions: {
    setFilter(filter: GalleryFilter) {
      this.filter = filter;
    },
    setSortAsc(sortAsc: boolean) {
      this.sortAsc = sortAsc;
    },
    setLoadedCounts(loadedCount: number, totalCount: number) {
      this.loadedCount = loadedCount;
      this.totalCount = totalCount;
    },
    replacePageItems(items: GalleryImagePageItem[]) {
      this.pageItems = items;
    },
    replaceFlatItems(items: GalleryFlatItem[]) {
      this.flatItems = items;
    },
    patchPagination(pagination: Partial<GalleryPaginationState>) {
      this.pagination = { ...this.pagination, ...pagination };
      this.setLoadedCounts(this.pageItems.length, Number(this.pagination.total || this.pageItems.length));
    },
    replaceSelection(keys: Iterable<string>) {
      this.selectedKeys = new Set(keys);
    },
    clearSelection() {
      this.selectedKeys = new Set();
    },
  },
});
