<template>
  <aside v-if="node" :class="['node-inspector', { 'is-source': node.type === 'source', 'is-pending': node.type === 'pending' }]">
    <div class="node-inspector-strip" aria-hidden="true"></div>
    <div class="node-inspector-preview">
      <img v-if="imageUrl" :src="imageUrl" alt="" loading="lazy" decoding="async">
      <div v-else class="genealogy-node-placeholder">{{ viewModel?.fallbackPreviewText }}</div>
    </div>
    <div class="node-inspector-copy">
      <span class="node-inspector-kicker">{{ viewModel?.kicker }}</span>
      <strong>{{ viewModel?.title }}</strong>
      <span class="node-inspector-meta">
        <span><GitBranch aria-hidden="true" />{{ viewModel?.generationLabel }}</span>
        <span><ImageIcon aria-hidden="true" />{{ viewModel?.sizeLabel }}</span>
        <span v-if="viewModel?.qualityLabel"><SlidersHorizontal aria-hidden="true" />{{ viewModel.qualityLabel }}</span>
        <span v-if="viewModel?.modelLabel"><Cpu aria-hidden="true" />{{ viewModel.modelLabel }}</span>
        <span><GitMerge aria-hidden="true" />{{ viewModel?.parentLabel }}</span>
        <span><Activity aria-hidden="true" />{{ viewModel?.statusLabel }}</span>
      </span>
    </div>
    <div class="node-inspector-actions">
      <button type="button" class="genealogy-tool-btn" title="设为左侧参考图" :disabled="!node.url" @click="$emit('reference')">
        <ImagePlus aria-hidden="true" />
        <span>参考</span>
      </button>
      <button v-if="node.url" type="button" class="genealogy-tool-btn" title="预览" @click="$emit('preview')">
        <Eye aria-hidden="true" />
        <span>预览</span>
      </button>
      <button v-if="canDelete" type="button" class="genealogy-tool-btn is-danger" title="删除图片" :disabled="deleting" @click="$emit('delete')">
        <LoaderCircle v-if="deleting" class="is-spinning" aria-hidden="true" />
        <Trash2 v-else aria-hidden="true" />
        <span>{{ deleting ? "删除中" : "删除" }}</span>
      </button>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  Activity,
  Cpu,
  Eye,
  GitBranch,
  GitMerge,
  ImageIcon,
  ImagePlus,
  LoaderCircle,
  SlidersHorizontal,
  Trash2,
} from "lucide-vue-next";
import type { GenealogyNode } from "../../stores/genealogy";
import type { GenealogyLayoutNode } from "../../utils/genealogyGraph";
import { createGenealogyInspectorViewModel } from "./genealogyInspectorViewModel";

const props = defineProps<{
  node: GenealogyNode | null;
  layoutNode: GenealogyLayoutNode | null;
  imageUrl: string;
  parentCount: number;
  canDelete?: boolean;
  deleting?: boolean;
}>();

defineEmits<{
  reference: [];
  preview: [];
  delete: [];
}>();

const viewModel = computed(() => (
  props.node
    ? createGenealogyInspectorViewModel(props.node, props.layoutNode, props.parentCount)
    : null
));
</script>

<style scoped src="../../styles/parts/genealogy-node-inspector.css"></style>
