import type { GenealogyFamily, GenealogyViewMode } from "../../stores/genealogy";

export interface GenealogyCanvasBarViewModel {
  familyTitle: string;
  generationLabel: string;
  imageCountLabel: string;
  navigationLabel: string;
  showMultiSource: boolean;
  showStats: boolean;
}

export interface GenealogyWorkspaceToolbarViewModel {
  canOpenTree: boolean;
  queryPlaceholder: string;
  refreshLabel: string;
  title: string;
  viewMode: GenealogyViewMode;
}

export function createGenealogyCanvasBarViewModel(
  family: GenealogyFamily | null,
  navigationOpen: boolean,
): GenealogyCanvasBarViewModel {
  return {
    familyTitle: family?.title || "未选择族谱",
    generationLabel: `${family?.generation_count || 0} 代`,
    imageCountLabel: `${family?.image_count || 0} 张`,
    navigationLabel: navigationOpen ? "收起导航" : "展开导航",
    showMultiSource: Boolean(family?.has_multi_source),
    showStats: Boolean(family),
  };
}

export function createGenealogyWorkspaceToolbarViewModel(options: {
  hasActiveFamily: boolean;
  viewMode: GenealogyViewMode;
}): GenealogyWorkspaceToolbarViewModel {
  return {
    canOpenTree: options.hasActiveFamily,
    queryPlaceholder: "搜索根图 / 提示词 / 时间",
    refreshLabel: "刷新族谱",
    title: "族谱图库",
    viewMode: options.viewMode,
  };
}
