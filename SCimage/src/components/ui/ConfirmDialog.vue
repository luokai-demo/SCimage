<template>
  <AlertDialogRoot :open="state.open" @update:open="onOpenChange">
    <AlertDialogPortal>
      <AlertDialogOverlay class="confirm-dialog-overlay" />
      <AlertDialogContent class="confirm-dialog-content">
        <AlertDialogTitle class="confirm-dialog-title">{{ state.title }}</AlertDialogTitle>
        <AlertDialogDescription class="confirm-dialog-description">{{ state.description }}</AlertDialogDescription>
        <div class="confirm-dialog-actions">
          <AlertDialogCancel class="confirm-dialog-cancel" @click="resolve(false)">{{ state.cancelText }}</AlertDialogCancel>
          <AlertDialogAction :class="['confirm-dialog-action', { 'is-danger': state.tone === 'danger' }]" @click="resolve(true)">
            {{ state.confirmText }}
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>

<script setup lang="ts">
import {
  AlertDialogAction,
  AlertDialogCancel,
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
