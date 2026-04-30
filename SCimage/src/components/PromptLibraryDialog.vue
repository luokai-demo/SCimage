<template>
  <DialogRoot :open="dialog.open.value" :modal="false" @update:open="dialog.setOpen">
    <DialogPortal>
      <DialogContent class="prompt-library-dialog" aria-describedby="promptLibraryDescription" @interact-outside.prevent>
        <div class="prompt-library-head">
          <div>
            <DialogTitle class="prompt-library-title">提示词库</DialogTitle>
            <DialogDescription id="promptLibraryDescription" class="prompt-library-description">
              点击内置词组添加到当前提示词，再次点击可取消添加。
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
            <div class="prompt-library-tools">
              <div class="prompt-library-search">
                <Search aria-hidden="true" />
                <input v-model="dialog.query.value" type="search" placeholder="搜索词组" aria-label="搜索内置词组">
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
                  @click="runtime.togglePromptToken(item)"
                >
                  <Check v-if="isTokenSelected(item)" aria-hidden="true" />
                  <Plus v-else aria-hidden="true" />
                  <span>{{ item }}</span>
                  <small>{{ isTokenSelected(item) ? "取消" : "添加" }}</small>
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
import { Check, Plus, Search, X } from "lucide-vue-next";
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

const promptTokenSet = computed(() => new Set(runtime.currentWorkflowForm.value.prompt.split(/[,，]/).map((item) => item.trim()).filter(Boolean)));

function isTokenSelected(token: string) {
  return promptTokenSet.value.has(token);
}

watch(visibleGroups, (groups) => {
  if (!groups.some((group) => group.id === activeGroup.value)) {
    activeGroup.value = groups[0]?.id || "";
  }
});
</script>
