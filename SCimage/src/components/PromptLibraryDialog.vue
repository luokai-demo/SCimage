<template>
  <DialogRoot :open="dialog.open.value" :modal="false" @update:open="dialog.setOpen">
    <DialogPortal>
      <DialogContent class="prompt-library-dialog" aria-describedby="promptLibraryDescription" @interact-outside.prevent>
        <div class="prompt-library-head">
          <div>
            <DialogTitle class="prompt-library-title">提示词库</DialogTitle>
            <DialogDescription id="promptLibraryDescription" class="prompt-library-description">
              点击内置词组会追加到当前提示词，已保存提示词仍可直接套用。
            </DialogDescription>
          </div>
          <button type="button" class="prompt-library-close" aria-label="关闭提示词库" @click="dialog.setOpen(false)">
            <X aria-hidden="true" />
          </button>
        </div>

        <TabsRoot v-model="activeTab" class="prompt-library-tabs">
          <TabsList class="prompt-library-tab-list" aria-label="提示词类型">
            <TabsTrigger value="builtin" class="prompt-library-tab">内置词组</TabsTrigger>
            <TabsTrigger value="saved" class="prompt-library-tab">已保存</TabsTrigger>
          </TabsList>

          <TabsContent value="builtin" force-mount class="prompt-library-tab-content">
            <div v-if="dialog.selectedTokens.value.length" class="prompt-library-selected">
              <div class="prompt-library-section-title">已选词组</div>
              <div class="prompt-library-selected-list">
                <div v-for="(item, index) in dialog.selectedTokens.value" :key="item" class="prompt-library-selected-chip">
                  <span>{{ item }}</span>
                  <button type="button" :disabled="index === 0" aria-label="前移词组" @click="runtime.reorderLibraryPromptToken(item, -1)">
                    <ChevronLeft aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    :disabled="index === dialog.selectedTokens.value.length - 1"
                    aria-label="后移词组"
                    @click="runtime.reorderLibraryPromptToken(item, 1)"
                  >
                    <ChevronRight aria-hidden="true" />
                  </button>
                  <button type="button" aria-label="移除词组" @click="runtime.removePromptToken(item)">
                    <X aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
            <div class="prompt-library-tools">
              <div class="prompt-library-search">
                <Search aria-hidden="true" />
                <input v-model="dialog.query.value" type="search" placeholder="搜索词组" aria-label="搜索内置词组">
              </div>
              <button type="button" class="prompt-library-clear" :disabled="!dialog.selectedTokens.value.length" @click="runtime.clearLibraryPromptTokens">
                清除本次
              </button>
            </div>
            <div v-if="dialog.recentTokens.value.length && !dialog.query.value.trim()" class="prompt-library-recent">
              <div class="prompt-library-section-title">最近使用</div>
              <div class="builtin-prompt-chips is-recent">
                <button
                  v-for="item in dialog.recentTokens.value"
                  :key="item"
                  type="button"
                  :class="['builtin-prompt-chip', { 'is-selected': isTokenSelected(item) }]"
                  @click="toggleToken(item)"
                >
                  <Check v-if="isTokenSelected(item)" aria-hidden="true" />
                  <Plus v-else aria-hidden="true" />
                  <span>{{ item }}</span>
                </button>
              </div>
            </div>
            <div class="builtin-prompt-layout">
              <div class="builtin-prompt-groups" role="tablist" aria-label="内置提示词分类">
                <button
                  v-for="group in visibleGroups"
                  :key="group.id"
                  type="button"
                  :class="['builtin-prompt-group-btn', { active: activeGroup === group.id }]"
                  @click="activeGroup = group.id"
                >
                  {{ group.label }}
                </button>
              </div>
              <div class="builtin-prompt-chips">
                <button
                  v-for="item in activeGroupItems"
                  :key="item"
                  type="button"
                  :class="['builtin-prompt-chip', { 'is-selected': isTokenSelected(item) }]"
                  @click="toggleToken(item)"
                >
                  <Check v-if="isTokenSelected(item)" aria-hidden="true" />
                  <Plus v-else aria-hidden="true" />
                  <span>{{ item }}</span>
                </button>
                <div v-if="!activeGroupItems.length" class="prompt-library-empty">没有匹配的词组</div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="saved" force-mount class="prompt-library-tab-content">
            <div class="prompt-library-saved-actions">
              <button type="button" class="btn-secondary" id="savePromptBtn" @click="runtime.savePrompt">保存当前提示词</button>
              <button type="button" class="btn-secondary" id="clearPromptBankBtn" @click="runtime.clearPrompts">清空词库</button>
            </div>
            <PromptBankPanel />
          </TabsContent>
        </TabsRoot>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Check, ChevronLeft, ChevronRight, Plus, Search, X } from "lucide-vue-next";
import {
  DialogContent,
  DialogDescription,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  TabsContent,
  TabsList,
  TabsRoot,
  TabsTrigger,
} from "reka-ui";
import { useScimageRuntime } from "../composables/useScimageRuntime";
import { usePromptLibraryDialog } from "../composables/usePromptLibraryDialog";
import { builtinPromptGroups } from "../data/builtinPrompts";
import PromptBankPanel from "./PromptBankPanel.vue";

const runtime = useScimageRuntime();
const dialog = usePromptLibraryDialog();
const activeTab = ref("builtin");
const activeGroup = ref(builtinPromptGroups[0]?.id || "");
const visibleGroups = computed(() => {
  const keyword = dialog.query.value.trim().toLowerCase();
  if (!keyword) return builtinPromptGroups;
  return builtinPromptGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.toLowerCase().includes(keyword) || group.label.toLowerCase().includes(keyword)),
    }))
    .filter((group) => group.items.length);
});
const activeGroupItems = computed(() => visibleGroups.value.find((group) => group.id === activeGroup.value)?.items || []);

function isTokenSelected(token: string) {
  return dialog.selectedSet.value.has(token);
}

function toggleToken(token: string) {
  if (isTokenSelected(token)) {
    runtime.removePromptToken(token);
    return;
  }
  runtime.appendPromptToken(token);
}

watch(visibleGroups, (groups) => {
  if (!groups.some((group) => group.id === activeGroup.value)) {
    activeGroup.value = groups[0]?.id || "";
  }
});
</script>
