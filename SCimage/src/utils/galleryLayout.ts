import type { GalleryFlatItem } from "../stores/gallery";
import { imageKey } from "./galleryKeys";

export interface GalleryLayoutProfile {
  span: number;
  variant: "featured" | "tall" | "compact" | "lifted" | "balanced";
  shape: "panorama" | "landscape" | "square" | "portrait" | "tallPortrait";
  heightRatio: number;
  aspectRatio: string;
}

export interface GalleryLayoutItem {
  item: GalleryFlatItem;
  key: string;
  index: number;
  profile: GalleryLayoutProfile;
  columnIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  columnSpan: number;
}

export interface GalleryLayoutResult {
  items: GalleryLayoutItem[];
  totalHeight: number;
  columnCount: number;
}

export interface GalleryLayoutOptions {
  containerWidth: number;
  targetColumnWidth?: number;
  minColumns?: number;
  maxColumns?: number;
  gapPx?: number;
  allowFeatured?: boolean;
}

export interface GalleryVisibleWindow {
  scrollTop: number;
  viewportHeight: number;
  overscanScreens?: number;
}

export function buildGalleryMasonryLayout(items: GalleryFlatItem[], options: GalleryLayoutOptions): GalleryLayoutResult {
  const gapPx = options.gapPx ?? 12;
  const targetColumnWidth = options.targetColumnWidth ?? 176;
  const minColumns = options.minColumns ?? 1;
  const maxColumns = options.maxColumns ?? 8;
  const containerWidth = Math.max(0, options.containerWidth || 0);
  if (!containerWidth || !items.length) {
    return { items: [], totalHeight: 0, columnCount: minColumns };
  }

  const columnCount = clamp(Math.floor((containerWidth + gapPx) / (targetColumnWidth + gapPx)), minColumns, maxColumns);
  const columnWidth = (containerWidth - (gapPx * (columnCount - 1))) / columnCount;
  const columnHeights = Array.from({ length: columnCount }, () => 0);
  const profiles = assignLayoutProfiles(items, { allowFeatured: options.allowFeatured !== false });

  const layoutItems = items.map((item, index) => {
    const profile = profiles[index];
    let columnSpan = clamp(Math.round(profile.span || 1), 1, columnCount);
    let itemWidth = spannedWidth(columnWidth, columnSpan, gapPx);
    let height = estimateItemHeight(profile, itemWidth);
    let placement = findColumnPlacement(columnHeights, columnSpan);

    if (shouldCollapseSpan(placement, height, columnWidth, gapPx)) {
      columnSpan = 1;
      itemWidth = spannedWidth(columnWidth, columnSpan, gapPx);
      height = estimateItemHeight(profile, itemWidth);
      placement = findColumnPlacement(columnHeights, columnSpan);
    }

    const x = placement.columnIndex * (columnWidth + gapPx);
    const y = placement.y;
    for (let offset = 0; offset < columnSpan; offset += 1) {
      columnHeights[placement.columnIndex + offset] = y + height + gapPx;
    }

    return {
      item,
      key: imageKey(item),
      index,
      profile,
      columnIndex: placement.columnIndex,
      x,
      y,
      width: itemWidth,
      height,
      columnSpan,
    };
  });

  return {
    items: layoutItems,
    totalHeight: Math.max(0, Math.max(...columnHeights) - gapPx),
    columnCount,
  };
}

export function filterVisibleGalleryItems(layoutItems: GalleryLayoutItem[], windowState: GalleryVisibleWindow) {
  const viewportHeight = Math.max(1, windowState.viewportHeight || 1);
  const overscan = viewportHeight * (windowState.overscanScreens ?? 1.25);
  const start = Math.max(0, (windowState.scrollTop || 0) - overscan);
  const end = (windowState.scrollTop || 0) + viewportHeight + overscan;
  return layoutItems.filter((record) => record.y + record.height >= start && record.y <= end);
}

export function warmGalleryImages(items: GalleryFlatItem[], options: { immediateCount?: number; previewCount?: number } = {}) {
  if (typeof window === "undefined" || typeof Image !== "function") return;
  const previewCount = options.previewCount ?? 48;
  const immediateCount = options.immediateCount ?? 16;
  const previewUrls = uniqueUrls(items.slice(0, previewCount).map((item) => item.previewSrc).filter(Boolean));
  const imageUrls = uniqueUrls(items.slice(0, immediateCount).map((item) => item.src).filter(Boolean));
  previewUrls.forEach((url) => preloadImage(url, "high"));
  const run = () => imageUrls.forEach((url) => preloadImage(url, "auto"));
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(run, { timeout: 240 });
  } else {
    globalThis.setTimeout(run, 32);
  }
}

function assignLayoutProfiles(items: GalleryFlatItem[], options: { allowFeatured: boolean }) {
  const featuredIndexes = selectFeaturedIndexes(items, options);
  return items.map((item, index) => createLayoutProfile(item, index, featuredIndexes));
}

function createLayoutProfile(item: GalleryFlatItem, index: number, featuredIndexes: Set<number>): GalleryLayoutProfile {
  const baseHeightRatio = naturalHeightRatio(item);
  const shape = imageShape(baseHeightRatio);
  const seed = hashString(`${imageKey(item)}:${index}`);
  const isFeatured = featuredIndexes.has(index);
  let variant: GalleryLayoutProfile["variant"] = "balanced";
  const span = isFeatured ? 2 : 1;
  let heightRatio = baseHeightRatio;

  if (isFeatured) {
    variant = "featured";
    if (shape === "panorama") {
      heightRatio = clamp(baseHeightRatio * 1.12, 0.48, 0.72);
    } else if (shape === "landscape") {
      heightRatio = clamp(baseHeightRatio * 1.02, 0.62, 0.92);
    } else {
      heightRatio = clamp(baseHeightRatio * 0.86, 0.76, 1.02);
    }
  } else if (shape === "tallPortrait") {
    if (seed % 6 === 0) {
      variant = "lifted";
      heightRatio = clamp(baseHeightRatio * 0.76, 1.16, 1.48);
    } else {
      variant = "tall";
      heightRatio = clamp(baseHeightRatio * 0.88, 1.32, 1.82);
    }
  } else if (shape === "portrait") {
    if (seed % 7 === 0) {
      variant = "compact";
      heightRatio = clamp(baseHeightRatio * 0.72, 0.96, 1.22);
    } else if (seed % 4 === 0) {
      variant = "lifted";
      heightRatio = clamp(baseHeightRatio * 0.88, 1.04, 1.38);
    } else {
      variant = "tall";
      heightRatio = clamp(baseHeightRatio, 1.12, 1.58);
    }
  } else if (shape === "panorama") {
    variant = "compact";
    heightRatio = clamp(baseHeightRatio * 1.16, 0.5, 0.78);
  } else if (shape === "landscape") {
    variant = seed % 3 === 0 ? "lifted" : "compact";
    heightRatio = clamp(baseHeightRatio * (seed % 3 === 0 ? 1.08 : 0.96), 0.62, 1.02);
  } else if (seed % 5 === 0) {
    variant = "compact";
    heightRatio = clamp(baseHeightRatio * 0.92, 0.82, 1.12);
  } else if (seed % 3 === 0) {
    variant = "lifted";
    heightRatio = clamp(baseHeightRatio * 1.06, 0.9, 1.28);
  } else {
    heightRatio = clamp(baseHeightRatio, 0.86, 1.24);
  }

  return {
    span,
    variant,
    shape,
    heightRatio,
    aspectRatio: `1 / ${heightRatio.toFixed(4)}`,
  };
}

function selectFeaturedIndexes(items: GalleryFlatItem[], options: { allowFeatured: boolean }) {
  if (!options.allowFeatured || items.length < 12) return new Set<number>();
  const maxFeatured = clamp(Math.floor(items.length / 11), 1, 7);
  const minGap = items.length >= 36 ? 6 : 7;
  const candidates = items
    .map((item, index) => ({ item, index, score: featuredScore(item, index, items.length) }))
    .filter((candidate) => candidate.score >= 72)
    .sort((left, right) => right.score - left.score || left.index - right.index);

  const selected: number[] = [];
  const selectedJobIds = new Set<string>();
  [true, false].forEach((preferNewJob) => {
    candidates.forEach((candidate) => {
      if (selected.length >= maxFeatured || selected.includes(candidate.index)) return;
      const jobId = candidate.item.jobId || "";
      if (preferNewJob && jobId && selectedJobIds.has(jobId)) return;
      if (selected.some((index) => Math.abs(index - candidate.index) < minGap)) return;
      selected.push(candidate.index);
      if (jobId) selectedJobIds.add(jobId);
    });
  });
  return new Set(selected);
}

function featuredScore(item: GalleryFlatItem, index: number, total: number) {
  if (index < 2 || total < 12) return 0;
  const heightRatio = naturalHeightRatio(item);
  const shape = imageShape(heightRatio);
  const seed = hashString(`${imageKey(item)}:${index}`);
  const rhythmBoost = 12 - Math.abs((index % 12) - 5);
  const freshnessBoost = Math.max(0, 8 - Math.floor(index / 14));
  const shapeScore = {
    panorama: 98,
    landscape: 92,
    square: 66,
    portrait: 54,
    tallPortrait: 0,
  }[shape];
  return shapeScore + rhythmBoost + freshnessBoost + (seed % 11);
}

function naturalHeightRatio(item: GalleryFlatItem) {
  const width = Number(item.width || 0);
  const height = Number(item.height || 0);
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    return height / width;
  }
  return sizeHeightRatio(item.size);
}

function sizeHeightRatio(size?: string) {
  const normalized = String(size || "").trim().toLowerCase();
  if (/^[1-9]\d*x[1-9]\d*$/.test(normalized)) {
    const [width, height] = normalized.split("x").map((value) => Number.parseInt(value, 10));
    return height / width;
  }
  if (normalized.includes(":")) {
    const [width, height] = normalized.split(":").map((value) => Number.parseInt(value, 10));
    if (width && height) return height / width;
  }
  return 16 / 9;
}

function imageShape(heightRatio: number): GalleryLayoutProfile["shape"] {
  if (heightRatio <= 0.64) return "panorama";
  if (heightRatio <= 0.9) return "landscape";
  if (heightRatio <= 1.18) return "square";
  if (heightRatio <= 1.72) return "portrait";
  return "tallPortrait";
}

function estimateItemHeight(profile: GalleryLayoutProfile, width: number) {
  return Math.max(96, Math.round(width * profile.heightRatio));
}

function findColumnPlacement(columnHeights: number[], span: number) {
  let columnIndex = 0;
  let y = Number.POSITIVE_INFINITY;
  let bestScore = Number.POSITIVE_INFINITY;
  let bestWaste = 0;
  let bestImbalance = 0;
  const lastStartIndex = Math.max(0, columnHeights.length - span);
  for (let startIndex = 0; startIndex <= lastStartIndex; startIndex += 1) {
    const heights = columnHeights.slice(startIndex, startIndex + span);
    const candidateY = Math.max(...heights);
    const lowestY = Math.min(...heights);
    const waste = heights.reduce((total, value) => total + (candidateY - value), 0);
    const imbalance = candidateY - lowestY;
    const score = span > 1 ? candidateY + (waste * 0.9) + (imbalance * 0.45) : candidateY;
    if (score < bestScore || (score === bestScore && candidateY < y)) {
      columnIndex = startIndex;
      y = candidateY;
      bestScore = score;
      bestWaste = waste;
      bestImbalance = imbalance;
    }
  }
  return {
    columnIndex,
    y: Number.isFinite(y) ? y : 0,
    span,
    waste: bestWaste,
    imbalance: bestImbalance,
  };
}

function shouldCollapseSpan(placement: { span: number; imbalance: number; waste: number }, height: number, columnWidth: number, gapPx: number) {
  if (!placement || placement.span <= 1) return false;
  const tolerance = Math.max(gapPx * 2.5, Math.min(columnWidth * 0.18, height * 0.16));
  return placement.imbalance > tolerance || placement.waste > tolerance * placement.span;
}

function spannedWidth(columnWidth: number, span: number, gapPx: number) {
  return (columnWidth * span) + (gapPx * (span - 1));
}

function preloadImage(url: string, fetchPriority: "auto" | "high") {
  if (!url || warmCache.has(url)) return;
  warmCache.add(url);
  const image = new Image();
  image.decoding = "async";
  image.loading = fetchPriority === "high" ? "eager" : "lazy";
  image.fetchPriority = fetchPriority;
  image.src = url;
}

function uniqueUrls(urls: Array<string | undefined>) {
  return Array.from(new Set(urls.filter(Boolean) as string[]));
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

const warmCache = new Set<string>();
