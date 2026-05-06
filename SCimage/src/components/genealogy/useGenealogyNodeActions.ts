import { computed, ref, type ComputedRef } from "vue";
import type { UseScimageRuntimeReturn } from "../../composables/useScimageRuntime";
import type { GalleryFlatItem } from "../../stores/gallery";
import type { GenealogyNode } from "../../stores/genealogy";
import {
  genealogyPreviewImageUrl,
  type GenealogyLayoutNode,
} from "../../utils/genealogyGraph";

interface UseGenealogyNodeActionsOptions {
  runtime: UseScimageRuntimeReturn;
  selectedNode: ComputedRef<GenealogyNode | null>;
  layoutNodes: ComputedRef<GenealogyLayoutNode[]>;
  generatedImageCountByJobId: ComputedRef<Map<string, number>>;
  loadGraph: (options?: { silent?: boolean; force?: boolean }) => Promise<void>;
}

export function useGenealogyNodeActions(options: UseGenealogyNodeActionsOptions) {
  const deletingNodeId = ref("");
  const selectedCanDelete = computed(() => {
    const node = options.selectedNode.value;
    return Boolean(node?.type === "generated" && node.job_id && Number(node.slot || 0) > 0 && node.url);
  });
  const selectedDeleting = computed(() => Boolean(
    options.selectedNode.value &&
    deletingNodeId.value === options.selectedNode.value.id,
  ));

  async function setSelectedAsReference() {
    if (!options.selectedNode.value) return;
    await addNodeAsReference(options.selectedNode.value);
  }

  async function addNodeAsReference(node: GenealogyNode) {
    if (!node.url) return;
    await options.runtime.addSourceImageFromUrl({
      url: node.url,
      filename: node.filename || "reference.png",
      prompt: node.prompt,
      origin: node.job_id && node.slot ? {
        job_id: node.job_id,
        slot: node.slot,
        url: node.url,
        filename: node.filename,
        prompt: node.prompt,
      } : undefined,
    });
  }

  function previewSelected() {
    const node = options.selectedNode.value;
    if (!node?.url) return;
    previewNode(node);
  }

  function previewNode(node: GenealogyNode) {
    if (!node?.url) return;
    const items = options.layoutNodes.value
      .filter((item) => item.url)
      .map(genealogyNodeToGalleryItem);
    const index = Math.max(0, items.findIndex((item) => (
      item.jobId === (node.job_id || node.id) && Number(item.slot || 0) === Number(node.slot || 1)
    )));
    options.runtime.openLightboxFromItems(items, index);
  }

  async function deleteSelectedNodeImage() {
    const node = options.selectedNode.value;
    if (!node || !selectedCanDelete.value || deletingNodeId.value) return;
    deletingNodeId.value = node.id;
    try {
      await options.runtime.deleteImage(node.job_id, Number(node.slot || 0), {
        item: genealogyNodeToGalleryItem(node),
      });
      await options.loadGraph({ silent: true, force: true });
    } finally {
      if (deletingNodeId.value === node.id) deletingNodeId.value = "";
    }
  }

  function genealogyNodeToGalleryItem(node: GenealogyNode): GalleryFlatItem {
    const jobId = node.job_id || node.id;
    const slot = Number(node.slot || 1);
    const imageCount = options.generatedImageCountByJobId.value.get(jobId) || 1;
    return {
      src: node.url,
      previewSrc: genealogyPreviewImageUrl(node),
      prompt: node.prompt,
      filename: node.filename || "genealogy-preview.png",
      jobId,
      slot,
      jobStatus: node.status,
      workflow: node.workflow,
      imageCount,
      totalCount: imageCount,
      jobSnapshot: {
        id: jobId,
        status: node.status,
        prompt: node.prompt,
        workflow: node.workflow,
        created_at: node.created_at,
        updated_at: node.updated_at,
        count: imageCount,
        image_count: imageCount,
        images: [{ slot, url: node.url, name: node.filename }],
      },
      createdAt: node.created_at,
      updatedAt: node.updated_at,
      size: node.size,
      quality: node.quality,
    };
  }

  return {
    addNodeAsReference,
    deleteSelectedNodeImage,
    deletingNodeId,
    genealogyNodeToGalleryItem,
    previewNode,
    previewSelected,
    selectedCanDelete,
    selectedDeleting,
    setSelectedAsReference,
  };
}
