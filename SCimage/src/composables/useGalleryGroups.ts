import { computed, type Ref } from "vue";
import type { GalleryFilter, GalleryFlatItem } from "../stores/gallery";

export interface GalleryRenderGroup {
  id: string;
  title: string;
  meta: string;
  items: GalleryFlatItem[];
}

const EMPTY_PROMPT_LABEL = "未提供提示词";

function normalizePrompt(value: string) {
  return value.trim() || EMPTY_PROMPT_LABEL;
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
        title: `任务 ${id.slice(0, 8) || "未知"}`,
        meta: "",
        items: [],
      };
      groupMap.set(id, group);
      groups.push(group);
    }
    group.items.push(item);
  });
  return groups.map((group) => ({ ...group, meta: `${group.items.length} 张图片` }));
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
        meta: "",
        items: [],
      };
      groupMap.set(prompt, group);
      groups.push(group);
    }
    group.items.push(item);
  });
  return groups.map((group) => ({ ...group, meta: `${group.items.length} 张图片` }));
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
      indexMap.set(`${item.jobId}:${item.slot}`, index);
    });
    return indexMap;
  });

  return {
    grouped,
    itemIndexByKey,
  };
}
