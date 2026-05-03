<template>
  <aside v-if="node" :class="['node-inspector', { 'is-source': node.type === 'source' }]">
    <div class="node-inspector-preview">
      <img v-if="imageUrl" :src="imageUrl" alt="" loading="lazy" decoding="async">
      <div v-else class="genealogy-node-placeholder">无预览</div>
    </div>
    <div class="node-inspector-copy">
      <strong>{{ node.prompt || node.filename || node.id }}</strong>
      <span class="node-inspector-type">{{ node.type === 'source' ? '外部参考图' : '生成图片' }} · {{ formattedTime }}</span>
      <span class="node-inspector-meta">
        <span><GitBranch aria-hidden="true" />{{ layoutNode ? generationLabel(layoutNode.generation) : '当前节点' }}</span>
        <span><ImageIcon aria-hidden="true" />{{ node.size || 'auto' }}</span>
        <span v-if="node.quality"><SlidersHorizontal aria-hidden="true" />{{ node.quality }}</span>
        <span v-if="node.model"><Cpu aria-hidden="true" />{{ shortText(node.model, 22) }}</span>
        <span><GitMerge aria-hidden="true" />{{ parentCount }} 来源</span>
        <span><Activity aria-hidden="true" />{{ statusLabel }}</span>
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
import { formatGenealogyTime } from "../../utils/genealogyGraph";

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

const formattedTime = computed(() => formatGenealogyTime(props.node?.updated_at || ""));
const statusLabel = computed(() => {
  const status = String(props.node?.status || "");
  if (status === "completed") return "完成";
  if (status === "partial") return "部分";
  if (status === "failed") return "失败";
  if (status === "canceled") return "中断";
  if (status === "source") return "来源";
  return status || "未知";
});

function generationLabel(generation: number) {
  return generation === 0 ? "Gen 0" : `Gen ${generation}`;
}

function shortText(value: string, maxLength: number) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}
</script>

<style scoped>
.node-inspector {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background:
    linear-gradient(90deg, rgba(143,184,255,.045), transparent 42%),
    rgba(255,255,255,.025);
}
.node-inspector.is-source {
  background:
    linear-gradient(90deg, rgba(245,215,110,.05), transparent 42%),
    rgba(255,255,255,.025);
}
.node-inspector-preview {
  width: 64px;
  height: 64px;
  overflow: hidden;
  border-radius: 6px;
  background: rgba(255,255,255,.06);
}
.node-inspector-preview img,
.node-inspector-preview .genealogy-node-placeholder {
  width: 64px;
  height: 64px;
  display: block;
  object-fit: cover;
}
.node-inspector-preview .genealogy-node-placeholder {
  display: flex;
}
.genealogy-node-placeholder {
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  font-size: 12px;
}
.node-inspector-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.node-inspector-copy strong {
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1.35;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.node-inspector-type {
  color: var(--text-tertiary);
  font-size: 11px;
}
.node-inspector-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.node-inspector-meta span {
  min-height: 22px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 7px;
  border: 1px solid rgba(255,255,255,.075);
  border-radius: 999px;
  background: rgba(255,255,255,.035);
  color: var(--text-secondary);
  font-size: 10px;
}
.node-inspector-meta svg,
.node-inspector-actions svg {
  width: 12px;
  height: 12px;
  flex: 0 0 auto;
  stroke-width: 1.8;
}
.node-inspector-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.genealogy-tool-btn {
  min-height: 28px;
  padding: 0 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: rgba(255,255,255,.03);
  color: var(--text-tertiary);
  font-family: inherit;
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: border-color var(--transition), color var(--transition), background var(--transition);
}
.genealogy-tool-btn:hover {
  border-color: var(--border-hover);
  color: var(--text-primary);
  background: rgba(255,255,255,.055);
}
.genealogy-tool-btn.is-danger {
  border-color: rgba(229,72,77,.26);
  color: #f87171;
  background: rgba(229,72,77,.14);
}
.genealogy-tool-btn.is-danger:hover {
  border-color: rgba(248,113,113,.46);
  color: #ffb3b6;
  background: rgba(229,72,77,.22);
}
.genealogy-tool-btn:disabled {
  opacity: .48;
  cursor: not-allowed;
}
.genealogy-tool-btn .is-spinning {
  animation: genealogy-inspector-spin 900ms linear infinite;
}
@keyframes genealogy-inspector-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 1040px) {
  .node-inspector {
    display: flex;
    align-items: flex-start;
    flex-direction: column;
  }
  .node-inspector-actions {
    flex-wrap: wrap;
  }
}
</style>
