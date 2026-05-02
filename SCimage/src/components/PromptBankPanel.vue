<template>
  <div class="prompt-bank-shell">
    <div class="prompt-bank-tools">
      <div class="prompt-bank-search">
        <Search aria-hidden="true" />
        <input
          :value="promptStore.query"
          type="search"
          placeholder="搜索提示词"
          aria-label="搜索提示词"
          @input="promptStore.setQuery(($event.target as HTMLInputElement).value)"
        >
      </div>
    </div>

    <div
      id="savedPrompts"
      :class="promptStore.filteredPrompts.length ? 'prompt-bank-list' : 'prompt-bank-empty'"
    >
      <template v-if="promptStore.filteredPrompts.length">
        <article
          v-for="item in promptStore.filteredPrompts"
          :key="item.id"
          class="prompt-bank-item"
        >
          <div class="prompt-text">{{ item.prompt }}</div>
          <div v-if="item.optionSummary" class="prompt-meta">{{ item.optionSummary }}</div>
          <div v-if="item.savedAtText" class="prompt-meta">{{ item.savedAtText }}</div>
          <div class="prompt-bank-actions">
            <button type="button" @click="runtime.applyPrompt(item)">
              <CornerDownLeft aria-hidden="true" />
              <span>套用</span>
            </button>
            <button type="button" @click="copyPrompt(item.prompt)">
              <Copy aria-hidden="true" />
              <span>复制</span>
            </button>
            <button type="button" class="gallery-del-btn" @click="runtime.deletePrompt(item.id)">
              <Trash2 aria-hidden="true" />
              <span>删除</span>
            </button>
          </div>
        </article>
      </template>
      <template v-else>
        {{ promptStore.emptyLabel }}
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Copy, CornerDownLeft, Search, Trash2 } from "lucide-vue-next";
import { useScimageRuntime } from "../composables/useScimageRuntime";
import { usePromptStore } from "../stores/prompts";
import { copyTextToClipboard } from "../utils/clipboard";

const promptStore = usePromptStore();
const runtime = useScimageRuntime();

async function copyPrompt(prompt: string) {
  const copied = await copyTextToClipboard(prompt);
  runtime.setStatus(copied ? "success" : "error", copied ? "提示词已复制。" : "无法复制到剪贴板。", copied ? 1200 : 2500);
}
</script>
