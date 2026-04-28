"use strict";

(() => {
  const SOURCE_KEY_PROPERTY = "__imageWorkbenchSourceKey";

  function tagFile(file, key) {
    if (!file || !key) {
      return file;
    }
    try {
      Object.defineProperty(file, SOURCE_KEY_PROPERTY, {
        value: key,
        configurable: true,
      });
    } catch (error) {
      console.warn("Failed to tag source image file:", error);
    }
    return file;
  }

  function getFileKey(file) {
    return file?.[SOURCE_KEY_PROPERTY] || [file?.name || "", file?.size || 0, file?.lastModified || 0].join("::");
  }

  function resolveFilename(url, fallback) {
    if (fallback) {
      return fallback;
    }
    try {
      const pathname = new URL(url, window.location.origin).pathname;
      return decodeURIComponent(pathname.split("/").filter(Boolean).pop() || "source-image.png");
    } catch (error) {
      return "source-image.png";
    }
  }

  async function createFileFromUrl({ url, filename, sourceKey } = {}) {
    if (!url) {
      throw new Error("缺少图片地址。");
    }
    const absoluteUrl = new URL(url, window.location.origin).toString();
    const response = await fetch(absoluteUrl);
    if (!response.ok) {
      throw new Error(`图片读取失败：${response.status}`);
    }
    const blob = await response.blob();
    const file = new File([blob], resolveFilename(absoluteUrl, filename), {
      type: blob.type || "image/png",
      lastModified: Date.now(),
    });
    return tagFile(file, sourceKey || `url:${absoluteUrl}`);
  }

  window.SourceImageStore = {
    getFileKey,
    tagFile,
    createFileFromUrl,
  };
})();
