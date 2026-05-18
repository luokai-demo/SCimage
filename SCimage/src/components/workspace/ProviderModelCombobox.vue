<template>
  <div ref="rootRef" class="form-group provider-config-field provider-model-combobox" @focusout="onFocusOut">
    <div class="field-label-row">
      <label for="model">模型</label>
      <IconButton
        id="modelReloadBtn"
        :class-name="`field-label-icon-btn${loading ? ' is-loading' : ''}`"
        label="拉取模型"
        :disabled="!canLoadModels"
        @click="emit('load-models')"
      >
        <RefreshCw aria-hidden="true" />
      </IconButton>
    </div>

    <div ref="controlRef" :class="['provider-model-control', { 'is-open': menuOpen }]">
      <input
        ref="inputRef"
        v-model="inputValue"
        id="model"
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-haspopup="listbox"
        :aria-expanded="menuOpen"
        aria-controls="providerModelMenu"
        :aria-activedescendant="activeDescendantId"
        aria-describedby="modelStatusHint"
        :aria-busy="loading"
        :disabled="loading"
        placeholder="选择或输入模型 ID"
        autocomplete="off"
        @focus="openMenu(false)"
        @input="onInput"
        @keydown="onInputKeydown"
      >
      <button
        id="modelDropdownBtn"
        type="button"
        class="provider-model-toggle"
        aria-label="展开模型列表"
        aria-controls="providerModelMenu"
        :aria-expanded="menuOpen"
        :disabled="loading"
        @mousedown.prevent
        @click="toggleMenu"
      >
        <ChevronDown aria-hidden="true" />
      </button>
    </div>

    <Teleport to="body">
      <div
        id="providerModelMenu"
        ref="menuRef"
        class="provider-model-menu"
        role="listbox"
        :hidden="!menuOpen"
        :style="menuStyle"
        aria-label="模型列表"
      >
        <button
          v-for="item in menuItems"
          :id="menuItemId(item)"
          :key="item.key"
          type="button"
          :class="['provider-model-option-btn', { 'is-active': isActiveMenuItem(item), 'is-selected': inputValue.trim() === item.value, 'is-manual': item.type === 'manual' }]"
          role="option"
          :aria-selected="inputValue.trim() === item.value"
          :data-model-value="item.value"
          :title="item.value"
          @mousedown.prevent
          @mouseenter="setActiveItem(item)"
          @click="selectMenuItem(item)"
        >
          <span class="provider-model-option-label">{{ item.label }}</span>
          <span class="provider-model-option-tag">{{ optionTag(item) }}</span>
        </button>

        <div v-if="!menuItems.length" class="provider-model-empty">
          {{ emptyMenuMessage }}
        </div>
      </div>
    </Teleport>

    <div id="modelStatusHint" class="field-hint" :data-tone="modelStatusTone" aria-live="polite">{{ modelStatusMessage }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { ChevronDown, RefreshCw } from "lucide-vue-next";
import type { ModelOption, ModelPickerStatus, ModelPickerTone } from "../../composables/runtime/providerModelPicker";
import { useFloatingMenuPosition } from "../../composables/useFloatingMenuPosition";
import IconButton from "../ui/IconButton.vue";

interface ModelMenuItem {
  key: string;
  value: string;
  label: string;
  category: ModelOption["category"] | "manual";
  type: "manual" | "option";
}

const props = defineProps<{
  modelValue: string;
  options: ModelOption[];
  status: ModelPickerStatus;
  message: string;
  messageTone: ModelPickerTone;
  loading: boolean;
  canLoadModels: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  "load-models": [];
}>();

const rootRef = ref<HTMLElement | null>(null);
const controlRef = ref<HTMLElement | null>(null);
const inputRef = ref<HTMLInputElement | null>(null);
const menuRef = ref<HTMLElement | null>(null);
const inputValue = ref(props.modelValue);
const menuOpen = ref(false);
const shouldFilterOptions = ref(false);
const activeItemKey = ref("");
const { menuStyle, updateMenuPosition } = useFloatingMenuPosition({
  anchorRef: controlRef,
  isOpen: menuOpen,
});

const normalizedOptions = computed(() => [
  ...props.options.filter((model) => model.category === "image"),
  ...props.options.filter((model) => model.category !== "image"),
]);
const filterText = computed(() => inputValue.value.trim().toLowerCase());
const displayedOptions = computed(() => {
  if (!shouldFilterOptions.value || !filterText.value) return normalizedOptions.value;
  return normalizedOptions.value.filter((model) => {
    const haystack = `${model.id} ${model.label} ${model.category === "image" ? "图片模型" : "其他模型"}`.toLowerCase();
    return haystack.includes(filterText.value);
  });
});
const hasExactOption = computed(() => {
  const currentModel = inputValue.value.trim();
  return Boolean(currentModel) && props.options.some((model) => model.id === currentModel);
});
const manualMenuItem = computed<ModelMenuItem | null>(() => {
  const currentModel = inputValue.value.trim();
  if (!currentModel || hasExactOption.value) return null;
  return {
    key: "manual",
    value: currentModel,
    label: `使用“${currentModel}”`,
    category: "manual",
    type: "manual",
  };
});
const optionMenuItems = computed<ModelMenuItem[]>(() => displayedOptions.value.map((model, index) => ({
  key: `option-${index}-${sanitizeKey(model.id)}`,
  value: model.id,
  label: model.label || model.id,
  category: model.category,
  type: "option",
})));
const menuItems = computed(() => [
  ...(manualMenuItem.value ? [manualMenuItem.value] : []),
  ...optionMenuItems.value,
]);
const activeMenuItem = computed(() => menuItems.value.find((item) => item.key === activeItemKey.value) || null);
const activeDescendantId = computed(() => (menuOpen.value && activeMenuItem.value ? menuItemId(activeMenuItem.value) : undefined));
const isManualModelEntry = computed(() => (
  Boolean(inputValue.value.trim()) &&
  props.status === "ready" &&
  props.options.length > 0 &&
  !hasExactOption.value
));
const hasLoadedModelOptions = computed(() => props.status === "ready" && props.options.length > 0);
const loadedModelOptionsMessage = computed(() => (hasLoadedModelOptions.value ? `已加载 ${props.options.length} 个模型` : ""));
const modelStatusMessage = computed(() => (
  isManualModelEntry.value ? "当前模型不在 API 返回列表中，将按手动输入保存。" : loadedModelOptionsMessage.value || props.message
));
const modelStatusTone = computed(() => (
  isManualModelEntry.value ? "warning" : hasLoadedModelOptions.value ? "success" : props.messageTone
));
const emptyMenuMessage = computed(() => (
  shouldFilterOptions.value && filterText.value
    ? "没有匹配的模型，可直接按当前输入保存。"
    : "拉取模型后可从列表选择，也可以直接输入模型 ID。"
));

watch(() => props.modelValue, (value) => {
  if (value === inputValue.value) return;
  inputValue.value = value;
});

watch(menuItems, () => {
  if (!menuOpen.value) return;
  syncActiveItem();
  void nextTick(updateMenuPosition);
});

function onInput() {
  shouldFilterOptions.value = true;
  emit("update:modelValue", inputValue.value);
  openMenu(true);
}

function openMenu(filterOptions: boolean) {
  if (props.loading) return;
  shouldFilterOptions.value = filterOptions;
  menuOpen.value = true;
  syncActiveItem();
  updateMenuPosition();
  void nextTick(updateMenuPosition);
}

function closeMenu() {
  menuOpen.value = false;
  activeItemKey.value = "";
}

function toggleMenu() {
  if (menuOpen.value) {
    closeMenu();
    inputRef.value?.focus();
    return;
  }
  openMenu(false);
  void nextTick(() => inputRef.value?.focus());
}

function onInputKeydown(event: KeyboardEvent) {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    if (!menuOpen.value) openMenu(false);
    moveActiveItem(1);
    return;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    if (!menuOpen.value) openMenu(false);
    moveActiveItem(-1);
    return;
  }
  if (event.key === "Enter" && menuOpen.value && activeMenuItem.value) {
    event.preventDefault();
    selectMenuItem(activeMenuItem.value);
    return;
  }
  if (event.key === "Escape" && menuOpen.value) {
    event.preventDefault();
    closeMenu();
    return;
  }
  if (event.key === "Home" && menuOpen.value) {
    event.preventDefault();
    activeItemKey.value = menuItems.value[0]?.key || "";
    return;
  }
  if (event.key === "End" && menuOpen.value) {
    event.preventDefault();
    activeItemKey.value = menuItems.value.at(-1)?.key || "";
    return;
  }
  if (event.key === "Tab") closeMenu();
}

function moveActiveItem(offset: number) {
  const items = menuItems.value;
  if (!items.length) return;
  const currentIndex = Math.max(0, items.findIndex((item) => item.key === activeItemKey.value));
  const nextIndex = (currentIndex + offset + items.length) % items.length;
  activeItemKey.value = items[nextIndex]?.key || "";
}

function syncActiveItem() {
  const items = menuItems.value;
  if (!items.length) {
    activeItemKey.value = "";
    return;
  }
  if (items.some((item) => item.key === activeItemKey.value)) return;
  const currentModel = inputValue.value.trim();
  const selectedItem = items.find((item) => item.value === currentModel);
  activeItemKey.value = (selectedItem || items[0])?.key || "";
}

function setActiveItem(item: ModelMenuItem) {
  activeItemKey.value = item.key;
}

function isActiveMenuItem(item: ModelMenuItem) {
  return item.key === activeItemKey.value;
}

function optionTag(item: ModelMenuItem) {
  if (item.type === "manual") return "手动";
  return item.category === "image" ? "图片" : "其他";
}

function selectMenuItem(item: ModelMenuItem) {
  inputValue.value = item.value;
  emit("update:modelValue", item.value);
  shouldFilterOptions.value = false;
  closeMenu();
  inputRef.value?.focus();
}

function onFocusOut(event: FocusEvent) {
  const nextTarget = event.relatedTarget;
  if (nextTarget instanceof Node && rootRef.value?.contains(nextTarget)) return;
  if (nextTarget instanceof Node && menuRef.value?.contains(nextTarget)) return;
  closeMenu();
}

function onDocumentPointerDown(event: PointerEvent) {
  const target = event.target;
  if (target instanceof Node && rootRef.value?.contains(target)) return;
  if (target instanceof Node && menuRef.value?.contains(target)) return;
  closeMenu();
}

function menuItemId(item: ModelMenuItem) {
  return `provider-model-option-${item.key}`;
}

function sanitizeKey(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

onMounted(() => {
  document.addEventListener("pointerdown", onDocumentPointerDown);
});

onUnmounted(() => {
  document.removeEventListener("pointerdown", onDocumentPointerDown);
});
</script>
