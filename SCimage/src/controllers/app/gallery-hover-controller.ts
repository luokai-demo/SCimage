// @ts-nocheck

export function createGalleryHoverController({ hideDelayMs = 140 } = {}) {
  const timers = new WeakMap();

  function setHoverState(card, isHovering) {
    if (!card) {
      return;
    }
    const previousTimer = timers.get(card);
    if (previousTimer) {
      window.clearTimeout(previousTimer);
      timers.delete(card);
    }
    if (isHovering) {
      card.classList.add("is-hovering");
      return;
    }
    const timer = window.setTimeout(() => {
      card.classList.remove("is-hovering");
      timers.delete(card);
    }, hideDelayMs);
    timers.set(card, timer);
  }

  function handlePointerEnter(event) {
    setHoverState(event.currentTarget, true);
  }

  function handlePointerLeave(event) {
    const card = event.currentTarget;
    const nextTarget = event.relatedTarget;
    if (nextTarget && card.contains(nextTarget)) {
      return;
    }
    setHoverState(card, false);
  }

  function handleFocusIn(event) {
    setHoverState(event.currentTarget, true);
  }

  function handleFocusOut(event) {
    const card = event.currentTarget;
    const nextTarget = event.relatedTarget;
    if (nextTarget && card.contains(nextTarget)) {
      return;
    }
    setHoverState(card, false);
  }

  function bind(card) {
    if (!card || card.dataset.hoverStateBound === "true") {
      return;
    }
    card.dataset.hoverStateBound = "true";
    card.addEventListener("pointerenter", handlePointerEnter);
    card.addEventListener("pointerleave", handlePointerLeave);
    card.addEventListener("focusin", handleFocusIn);
    card.addEventListener("focusout", handleFocusOut);
  }

  function unbind(card) {
    if (!card || card.dataset.hoverStateBound !== "true") {
      return;
    }
    card.dataset.hoverStateBound = "false";
    card.removeEventListener("pointerenter", handlePointerEnter);
    card.removeEventListener("pointerleave", handlePointerLeave);
    card.removeEventListener("focusin", handleFocusIn);
    card.removeEventListener("focusout", handleFocusOut);
    const previousTimer = timers.get(card);
    if (previousTimer) {
      window.clearTimeout(previousTimer);
      timers.delete(card);
    }
    card.classList.remove("is-hovering");
  }

  return {
    bind,
    unbind,
    setHoverState,
  };
}
