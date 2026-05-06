import type { GalleryFlatItem } from "../stores/gallery";
import type { GalleryLayoutProfile } from "./galleryLayout";
import { imageKey } from "./galleryKeys";
import { isActiveJobStatus } from "./jobStatus";

export interface GalleryItemViewModel {
  classNames: Array<string | Record<string, boolean>>;
  clockText: string;
  dateText: string;
  formattedTime: string;
  galleryKey: string;
  hasPreview: boolean;
  isActive: boolean;
  styleVars: Record<string, string | undefined>;
  terminalActionLabel: string;
  terminalActionText: string;
}

export function createGalleryItemViewModel(
  item: GalleryFlatItem,
  options: {
    layoutProfile?: GalleryLayoutProfile;
    selected: boolean;
  },
): GalleryItemViewModel {
  const hasPreview = Boolean(item.previewSrc && item.previewSrc !== item.src);
  const isActive = isActiveJobStatus(item.jobStatus);
  const formattedTime = formatGalleryItemTime(item);
  const [dateText = "--", clockText = ""] = formattedTime.split(/\s+/, 2);
  return {
    classNames: [
      "gallery-item",
      {
        "is-selected": options.selected,
        "has-preview": hasPreview,
        "has-masonry-profile": Boolean(options.layoutProfile),
      },
      options.layoutProfile ? `is-${options.layoutProfile.variant}` : "",
      options.layoutProfile ? `shape-${options.layoutProfile.shape}` : "",
    ],
    clockText,
    dateText,
    formattedTime,
    galleryKey: imageKey(item),
    hasPreview,
    isActive,
    styleVars: {
      "--gallery-placeholder-color": item.placeholderColor || undefined,
      "--gallery-card-aspect-ratio": options.layoutProfile?.aspectRatio || undefined,
    },
    terminalActionLabel: isActive ? "中断任务" : "删除图片",
    terminalActionText: isActive ? "中断" : "删除",
  };
}

export function createGalleryCountText(options: {
  filter: "all" | "tasks" | "prompts";
  groupedCount: number;
  loadedCount: number;
  totalCount: number;
}) {
  const total = Number(options.totalCount || options.loadedCount);
  const loadedText = total > options.loadedCount
    ? `已加载 ${options.loadedCount}/${total} 张`
    : `${options.loadedCount} 张图片`;
  if (!options.loadedCount) return "";
  if (options.filter === "tasks") {
    return `${options.groupedCount} 个可见任务 · ${options.loadedCount} 张 · ${loadedText}`;
  }
  if (options.filter === "prompts") {
    return `${options.groupedCount} 组提示词 · ${options.loadedCount} 张 · ${loadedText}`;
  }
  return total > options.loadedCount ? `${options.loadedCount}/${total} 张图片` : loadedText;
}

function formatGalleryItemTime(item: GalleryFlatItem) {
  const value = item.updatedAt || item.createdAt || "";
  if (!value) return "--";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}
