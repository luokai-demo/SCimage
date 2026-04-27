"use strict";

(() => {
  const DB_NAME = "image_workbench_source_images_v1";
  const STORE_NAME = "source_images";
  const STATE_KEY = "active";
  const SOURCE_KEY_PROPERTY = "__imageWorkbenchSourceKey";

  function isIndexedDbAvailable() {
    return typeof indexedDB !== "undefined";
  }

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

  function openDatabase() {
    if (!isIndexedDbAvailable()) {
      return Promise.reject(new Error("IndexedDB is not available."));
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.addEventListener("upgradeneeded", () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      });
      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () => reject(request.error || new Error("Failed to open source image store.")));
    });
  }

  async function withStore(mode, callback) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      let callbackResult;

      transaction.addEventListener("complete", () => {
        db.close();
        resolve(callbackResult);
      });
      transaction.addEventListener("error", () => {
        db.close();
        reject(transaction.error || new Error("Source image store transaction failed."));
      });
      transaction.addEventListener("abort", () => {
        db.close();
        reject(transaction.error || new Error("Source image store transaction aborted."));
      });

      try {
        callbackResult = callback(store);
      } catch (error) {
        transaction.abort();
        reject(error);
      }
    });
  }

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () => reject(request.error || new Error("Source image store request failed.")));
    });
  }

  function buildRecord(file, order) {
    const id = getFileKey(file);
    return {
      id,
      order,
      name: file.name || `source-${order + 1}.png`,
      type: file.type || "image/png",
      size: file.size || 0,
      lastModified: file.lastModified || Date.now(),
      blob: file.slice(0, file.size, file.type || "image/png"),
    };
  }

  function recordToFile(record) {
    if (!record?.blob) {
      return null;
    }
    const file = new File([record.blob], record.name || "source-image.png", {
      type: record.type || record.blob.type || "image/png",
      lastModified: record.lastModified || Date.now(),
    });
    return tagFile(file, record.id);
  }

  async function loadFiles() {
    if (!isIndexedDbAvailable()) {
      return [];
    }
    const records = await withStore("readonly", (store) => requestToPromise(store.get(STATE_KEY)));
    if (!Array.isArray(records)) {
      return [];
    }
    return records
      .slice()
      .sort((left, right) => Number(left.order || 0) - Number(right.order || 0))
      .map(recordToFile)
      .filter(Boolean);
  }

  async function saveFiles(files) {
    if (!isIndexedDbAvailable()) {
      return;
    }
    const records = Array.from(files || []).map((file, index) => buildRecord(file, index));
    await withStore("readwrite", (store) => requestToPromise(store.put(records, STATE_KEY)));
  }

  async function clearFiles() {
    if (!isIndexedDbAvailable()) {
      return;
    }
    await withStore("readwrite", (store) => requestToPromise(store.delete(STATE_KEY)));
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
    loadFiles,
    saveFiles,
    clearFiles,
    createFileFromUrl,
  };
})();
