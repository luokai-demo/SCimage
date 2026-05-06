import type { GalleryFlatItem } from "../stores/gallery";
import { imageKey } from "./galleryKeys";

export interface GalleryLayoutProfile {
  span: number;
  variant: "featured" | "tall" | "compact" | "lifted" | "balanced";
  shape: "panorama" | "landscape" | "square" | "portrait" | "tallPortrait";
  heightRatio: number;
  aspectRatio: string;
}

export function assignLayoutProfiles(items: GalleryFlatItem[], options: { allowFeatured: boolean }) {
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
