<template>
  <TooltipRoot :delay-duration="350">
    <TooltipTrigger as-child>
      <span class="ui-tooltip-trigger">
        <button
          :id="id"
          :class="className"
          :type="type"
          :aria-label="label"
          :title="label"
        >
          <slot />
        </button>
      </span>
    </TooltipTrigger>
    <TooltipPortal>
      <TooltipContent class="ui-tooltip" :side-offset="8">
        {{ label }}
      </TooltipContent>
    </TooltipPortal>
  </TooltipRoot>
</template>

<script setup lang="ts">
import { TooltipContent, TooltipPortal, TooltipRoot, TooltipTrigger } from "reka-ui";

withDefaults(defineProps<{
  id?: string;
  label: string;
  className?: string;
  type?: "button" | "submit" | "reset";
}>(), {
  id: undefined,
  className: "",
  type: "button",
});
</script>
