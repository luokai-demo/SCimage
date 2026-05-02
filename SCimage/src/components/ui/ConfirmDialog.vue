<template>
  <AlertDialogRoot :open="state.open" @update:open="onOpenChange">
    <AlertDialogPortal>
      <AlertDialogOverlay class="confirm-dialog-overlay" />
      <AlertDialogContent class="confirm-dialog-content">
        <AlertDialogTitle class="confirm-dialog-title">{{ state.title }}</AlertDialogTitle>
        <AlertDialogDescription class="confirm-dialog-description">{{ state.description }}</AlertDialogDescription>
        <div class="confirm-dialog-actions">
          <button type="button" class="confirm-dialog-cancel" @click="resolve(false)">{{ state.cancelText }}</button>
          <button type="button" :class="['confirm-dialog-action', { 'is-danger': state.tone === 'danger' }]" @click="resolve(true)">
            {{ state.confirmText }}
          </button>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>

<script setup lang="ts">
import {
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogRoot,
  AlertDialogTitle,
} from "reka-ui";
import { useConfirmDialog } from "../../composables/useConfirmDialog";

const { state, resolve } = useConfirmDialog();

function onOpenChange(open: boolean) {
  if (!open && state.open) resolve(false);
}
</script>
