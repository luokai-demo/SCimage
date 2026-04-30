"use strict";

(() => {
  const elements = {
    trigger: document.getElementById("providerProfileSelect"),
    menu: document.getElementById("providerProfileMenu"),
  };

  const state = {
    profiles: [],
    activeProfileId: "",
    disabled: false,
    open: false,
    onDelete: null,
    isBound: false,
  };

  function init(options = {}) {
    state.onDelete = typeof options.onDelete === "function" ? options.onDelete : null;
    bindEvents();
    render();
  }

  function bindEvents() {
    if (state.isBound) {
      return;
    }
    state.isBound = true;

    elements.trigger?.addEventListener("click", () => {
      if (elements.trigger?.disabled) {
        return;
      }
      toggleMenu();
    });

    document.addEventListener("click", (event) => {
      if (!state.open) {
        return;
      }
      if (elements.trigger?.contains(event.target) || elements.menu?.contains(event.target)) {
        return;
      }
      close();
    });

    document.addEventListener("keydown", (event) => {
      if (!state.open) {
        return;
      }
      if (event.key === "Escape") {
        close();
        elements.trigger?.focus();
      }
    });
  }

  function toggleMenu() {
    if (state.open) {
      close();
      return;
    }
    open();
  }

  function open() {
    if (!elements.menu || !elements.trigger || elements.trigger.disabled) {
      return;
    }
    state.open = true;
    elements.menu.hidden = false;
    elements.trigger.classList.add("is-open");
    elements.trigger.setAttribute("aria-expanded", "true");
  }

  function close() {
    if (!elements.menu || !elements.trigger) {
      return;
    }
    state.open = false;
    elements.menu.hidden = true;
    elements.trigger.classList.remove("is-open");
    elements.trigger.setAttribute("aria-expanded", "false");
  }

  function render(options = {}) {
    if (Array.isArray(options.profiles)) {
      state.profiles = options.profiles.map((profile) => ({
        id: String(profile?.id || "").trim(),
        name: String(profile?.name || "").trim(),
      })).filter((profile) => profile.id && profile.name);
    }
    if (Object.prototype.hasOwnProperty.call(options, "activeProfileId")) {
      state.activeProfileId = String(options.activeProfileId || "").trim();
    }
    if (Object.prototype.hasOwnProperty.call(options, "disabled")) {
      state.disabled = Boolean(options.disabled);
    }

    syncTrigger();
    syncMenu();
  }

  function setDisabled(disabled) {
    state.disabled = Boolean(disabled);
    syncTrigger();
    syncMenu();
  }

  function syncTrigger() {
    if (!elements.trigger) {
      return;
    }

    const activeProfile = state.profiles.find((profile) => profile.id === state.activeProfileId) || null;
    const label = activeProfile?.name || "未保存任何配置";
    const shouldDisable = state.disabled || !state.profiles.length;

    elements.trigger.textContent = label;
    elements.trigger.title = label;
    elements.trigger.value = activeProfile?.id || "";
    elements.trigger.disabled = shouldDisable;
    elements.trigger.setAttribute("aria-expanded", state.open ? "true" : "false");
    elements.trigger.classList.toggle("is-empty", !activeProfile);

    if (shouldDisable) {
      close();
    }
  }

  function syncMenu() {
    if (!elements.menu) {
      return;
    }
    elements.menu.innerHTML = "";

    if (!state.profiles.length) {
      const empty = document.createElement("div");
      empty.className = "provider-profile-empty";
      empty.textContent = "还没有已保存配置";
      elements.menu.appendChild(empty);
      return;
    }

    state.profiles.forEach((profile) => {
      const row = document.createElement("div");
      row.className = "provider-profile-option-row";

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "provider-profile-delete-btn";
      deleteButton.setAttribute("aria-label", `删除配置 ${profile.name}`);
      deleteButton.setAttribute("title", `删除配置 ${profile.name}`);
      deleteButton.innerHTML = [
        '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">',
        '<path d="M7 7 17 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
        '<path d="M17 7 7 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
        "</svg>",
      ].join("");
      deleteButton.disabled = state.disabled;
      deleteButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        close();
        state.onDelete?.(profile.id);
      });

      const optionButton = document.createElement("button");
      optionButton.type = "button";
      optionButton.className = "provider-profile-option-btn";
      optionButton.classList.toggle("is-active", profile.id === state.activeProfileId);
      optionButton.setAttribute("role", "option");
      optionButton.setAttribute("aria-selected", profile.id === state.activeProfileId ? "true" : "false");
      optionButton.disabled = state.disabled;

      const label = document.createElement("span");
      label.className = "provider-profile-option-label";
      label.textContent = profile.name;
      optionButton.appendChild(label);

      if (profile.id === state.activeProfileId) {
        const currentTag = document.createElement("span");
        currentTag.className = "provider-profile-option-tag";
        currentTag.textContent = "当前";
        optionButton.appendChild(currentTag);
      }

      optionButton.addEventListener("click", () => {
        if (state.disabled || profile.id === state.activeProfileId || !elements.trigger) {
          close();
          return;
        }
        state.activeProfileId = profile.id;
        syncTrigger();
        close();
        elements.trigger.dispatchEvent(new Event("change", { bubbles: true }));
      });

      row.appendChild(deleteButton);
      row.appendChild(optionButton);
      elements.menu.appendChild(row);
    });
  }

  window.ProviderProfilePicker = {
    init,
    render,
    setDisabled,
    close,
  };
})();
