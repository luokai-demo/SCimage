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
            <button type="button" data-prompt-action="apply" :data-prompt-id="item.id">
              <CornerDownLeft aria-hidden="true" />
              <span>套用</span>
            </button>
            <button type="button" data-prompt-action="copy" :data-prompt-id="item.id">
              <Copy aria-hidden="true" />
              <span>复制</span>
            </button>
            <button type="button" class="gallery-del-btn" data-prompt-action="delete" :data-prompt-id="item.id">
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
import { usePromptStore } from "../stores/prompts";

const promptStore = usePromptStore();
</script>
