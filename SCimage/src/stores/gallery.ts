import { defineStore } from "pinia";
import type { ApiGalleryImagePageItem } from "../contracts/api";
import { imageKey } from "../utils/galleryKeys";
import type { JobSummary } from "./jobs";

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
  prompt: string;
  filename: string;
  jobId: string;
  slot: number;
  jobStatus?: string;
  workflow?: string;
  imageCount?: number;
  totalCount?: number;
  createdAt?: string;
  updatedAt?: string;
  width?: number;
  height?: number;
  size?: string;
  quality?: string;
  outputProfileId?: string;
  jobSnapshot?: JobSummary;
}

export type GalleryImagePageItem = ApiGalleryImagePageItem;

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
    selectedCount: (state) => state.flatItems.filter((item) => state.selectedKeys.has(imageKey(item))).length,
    hasItems: (state) => state.flatItems.length > 0,
    selectedItems: (state) => state.flatItems.filter((item) => state.selectedKeys.has(imageKey(item))),
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
      const availableKeys = new Set(items.map((item) => imageKey(item)));
      this.selectedKeys = new Set([...this.selectedKeys].filter((key) => availableKeys.has(key)));
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
