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
            <div class="builtin-prompt-layout">
              <div class="builtin-prompt-groups" role="tablist" aria-label="内置提示词分类">
                <button
                  v-for="group in builtinPromptGroups"
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
                  class="builtin-prompt-chip"
                  @click="runtime.appendPromptToken(item)"
                >
                  <Plus aria-hidden="true" />
                  <span>{{ item }}</span>
                </button>
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
import { computed, ref } from "vue";
import { Plus, X } from "lucide-vue-next";
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
const activeGroupItems = computed(() => builtinPromptGroups.find((group) => group.id === activeGroup.value)?.items || []);
</script>
