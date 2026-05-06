import type { GenealogyFamily } from "../../stores/genealogy";
import { shortGenealogyText } from "../../utils/genealogyFormat";
import { formatGenealogyTime } from "../../utils/genealogyGraph";

export interface GenealogyFamilyViewModel {
  coverUrl: string;
  family: GenealogyFamily;
  generationLabel: string;
  hasMultiSource: boolean;
  imageCountLabel: string;
  lineageSteps: number[];
  rootId: string;
  rootKindLabel: string;
  timeLabel: string;
  title: string;
}

export function createGenealogyFamilyViewModel(family: GenealogyFamily): GenealogyFamilyViewModel {
  return {
    coverUrl: family.cover_url,
    family,
    generationLabel: `${family.generation_count} 代`,
    hasMultiSource: family.has_multi_source,
    imageCountLabel: `${family.image_count} 张`,
    lineageSteps: createFamilyLineageSteps(family.generation_count),
    rootId: family.root_id,
    rootKindLabel: family.root_type === "source" ? "外部根图" : "图库根图",
    timeLabel: formatGenealogyTime(family.latest_updated_at),
    title: family.title || "未命名族谱",
  };
}

export function createGenealogyRootTabViewModel(family: GenealogyFamily) {
  return {
    coverUrl: family.cover_url,
    family,
    metaLabel: `${family.generation_count} 代 · ${family.image_count} 图`,
    rootId: family.root_id,
    title: shortGenealogyText(family.title || "未命名族谱", 24),
  };
}

function createFamilyLineageSteps(generationCount: number) {
  return Array.from({ length: Math.max(3, Math.min(generationCount, 5)) }, (_, index) => index + 1);
}
