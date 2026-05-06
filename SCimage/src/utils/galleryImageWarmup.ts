import type { GalleryFlatItem } from "../stores/gallery";

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

const warmCache = new Set<string>();
