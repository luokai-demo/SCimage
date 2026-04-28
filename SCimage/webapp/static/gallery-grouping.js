"use strict";

(() => {
  const EMPTY_PROMPT_LABEL = "未提供提示词";

  function normalizePromptText(value) {
    const prompt = String(value || "").trim();
    return prompt || EMPTY_PROMPT_LABEL;
  }

  function parseTimestamp(value) {
    if (!value) {
      return Number.NEGATIVE_INFINITY;
    }
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
  }

  function pickLatestTimestamp(currentValue, candidateValue) {
    if (!candidateValue) {
      return currentValue;
    }
    if (!currentValue) {
      return candidateValue;
    }
    return parseTimestamp(candidateValue) >= parseTimestamp(currentValue)
      ? candidateValue
      : currentValue;
  }

  function groupJobsByPrompt(jobs) {
    const promptGroups = [];
    const groupMap = new Map();

    (Array.isArray(jobs) ? jobs : []).forEach((job) => {
      const images = Array.isArray(job?.images) ? job.images.filter(Boolean) : [];
      if (!images.length) {
        return;
      }

      const prompt = normalizePromptText(job?.prompt);
      let group = groupMap.get(prompt);
      if (!group) {
        group = {
          key: prompt,
          prompt,
          jobs: [],
          latestUpdatedAt: "",
        };
        groupMap.set(prompt, group);
        promptGroups.push(group);
      }

      group.jobs.push(job);
      group.latestUpdatedAt = pickLatestTimestamp(group.latestUpdatedAt, job?.updated_at || job?.created_at || "");
    });

    return promptGroups;
  }

  window.GalleryGrouping = {
    EMPTY_PROMPT_LABEL,
    normalizePromptText,
    groupJobsByPrompt,
  };
})();
