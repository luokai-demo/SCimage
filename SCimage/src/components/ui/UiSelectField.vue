<template>
  <div class="form-group ui-select-field" :class="className">
    <div v-if="$slots.meta || meta || labelAction" class="field-label-row">
      <Label class="ui-select-label" :for="selectId">{{ label }}</Label>
      <slot name="meta">
        <span v-if="meta" class="field-meta-text">{{ meta }}</span>
      </slot>
      <slot name="label-action" />
    </div>
    <Label v-else class="ui-select-label" :for="selectId">{{ label }}</Label>
    <div class="ui-select-control">
      <select
        :id="selectId"
        :aria-describedby="ariaDescribedby"
        :disabled="disabled"
        :value="modelValue"
        @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
      >
        <slot />
      </select>
      <ChevronDown class="ui-select-icon" aria-hidden="true" />
    </div>
    <slot name="after" />
  </div>
</template>

<script setup lang="ts">
import { Label } from "reka-ui";
import { ChevronDown } from "lucide-vue-next";

defineProps<{
  selectId: string;
  label: string;
  meta?: string;
  className?: string;
  ariaDescribedby?: string;
  labelAction?: boolean;
  modelValue?: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();
</script>
