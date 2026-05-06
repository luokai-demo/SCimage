import type { GalleryFlatItem } from "../stores/gallery";
import { imageKey } from "./galleryKeys";
import {
  assignLayoutProfiles,
  type GalleryLayoutProfile,
} from "./galleryLayoutProfiles";
export type { GalleryLayoutProfile } from "./galleryLayoutProfiles";
export { warmGalleryImages } from "./galleryImageWarmup";

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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
