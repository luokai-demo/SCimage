import { computed, type Ref } from "vue";
import type { GalleryFilter, GalleryFlatItem } from "../stores/gallery";
import { imageKey } from "../utils/galleryKeys";
import { formatDateTime, getJobProgressText, getWorkflowLabel } from "../utils/jobFormatters";

export interface GalleryRenderGroup {
  id: string;
  title: string;
  summary: string;
  meta: string;
  items: GalleryFlatItem[];
}

const EMPTY_PROMPT_LABEL = "未提供提示词";

function normalizePrompt(value: string) {
  return value.trim() || EMPTY_PROMPT_LABEL;
}

function groupTimeValue(item: GalleryFlatItem) {
  return item.updatedAt || item.createdAt || "";
}

function compareLatestTime(left: string, right: string) {
  const leftTime = new Date(left || 0).getTime();
  const rightTime = new Date(right || 0).getTime();
  return (Number.isNaN(leftTime) ? 0 : leftTime) - (Number.isNaN(rightTime) ? 0 : rightTime);
}

function taskProgressText(item: GalleryFlatItem, imageCount: number) {
  return getJobProgressText({
    status: item.jobStatus,
    workflow: item.workflow,
    prompt: item.prompt,
    count: item.totalCount,
    images: Array.from({ length: imageCount }, () => ({})),
  });
}

function groupByTask(items: GalleryFlatItem[]): GalleryRenderGroup[] {
  const groups: GalleryRenderGroup[] = [];
  const groupMap = new Map<string, GalleryRenderGroup>();
  items.forEach((item) => {
    const id = item.jobId || "unknown";
    let group = groupMap.get(id);
    if (!group) {
      group = {
        id: `task:${id}`,
        title: normalizePrompt(item.prompt),
        summary: `任务 ${id.slice(0, 8) || "未知"}`,
        meta: "",
        items: [],
      };
      groupMap.set(id, group);
      groups.push(group);
    }
    group.items.push(item);
  });
  return groups.map((group) => {
    const latestItem = group.items.reduce((latest, item) => (
      compareLatestTime(groupTimeValue(item), groupTimeValue(latest)) > 0 ? item : latest
    ), group.items[0]);
    return {
      ...group,
      meta: `${getWorkflowLabel(latestItem?.workflow)} · ${taskProgressText(latestItem, group.items.length)} · ${formatDateTime(groupTimeValue(latestItem))}`,
    };
  });
}

function groupByPrompt(items: GalleryFlatItem[]): GalleryRenderGroup[] {
  const groups: GalleryRenderGroup[] = [];
  const groupMap = new Map<string, GalleryRenderGroup>();
  items.forEach((item) => {
    const prompt = normalizePrompt(item.prompt);
    let group = groupMap.get(prompt);
    if (!group) {
      group = {
        id: `prompt:${prompt}`,
        title: prompt,
        summary: prompt,
        meta: "",
        items: [],
      };
      groupMap.set(prompt, group);
      groups.push(group);
    }
    group.items.push(item);
  });
  return groups.map((group) => {
    const jobIds = new Set(group.items.map((item) => item.jobId).filter(Boolean));
    const latestItem = group.items.reduce((latest, item) => (
      compareLatestTime(groupTimeValue(item), groupTimeValue(latest)) > 0 ? item : latest
    ), group.items[0]);
    return {
      ...group,
      meta: `${jobIds.size} 个任务 · ${group.items.length} 张图片 · 最近更新 ${formatDateTime(groupTimeValue(latestItem))}`,
    };
  });
}

export function useGalleryGroups(items: Ref<GalleryFlatItem[]>, filter: Ref<GalleryFilter>) {
  const grouped = computed(() => {
    if (filter.value === "tasks") return groupByTask(items.value);
    if (filter.value === "prompts") return groupByPrompt(items.value);
    return [];
  });

  const itemIndexByKey = computed(() => {
    const indexMap = new Map<string, number>();
    items.value.forEach((item, index) => {
      indexMap.set(imageKey(item), index);
    });
    return indexMap;
  });

  return {
    grouped,
    itemIndexByKey,
  };
}
