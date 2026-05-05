export async function waitForCondition(predicate, message, timeoutMs = 3000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(message);
}

export function svgDataUrl(width, height, topColor, bottomColor) {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${topColor}"/><stop offset="1" stop-color="${bottomColor}"/></linearGradient></defs><rect width="${width}" height="${height}" fill="url(#g)"/><circle cx="${width * 0.52}" cy="${height * 0.42}" r="${Math.min(width, height) * 0.18}" fill="#f4dfcd"/><rect x="${width * 0.18}" y="${height * 0.62}" width="${width * 0.64}" height="${height * 0.2}" rx="28" fill="#ffffff" opacity="0.78"/></svg>`)}`;
}

export async function installRegressionHarness(page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    window.__copiedTexts = [];
    window.__desktopDownloads = [];
    document.execCommand = (command) => {
      if (command !== "copy") return false;
      const active = document.activeElement;
      window.__copiedTexts.push(active && "value" in active ? active.value : String(window.getSelection?.() || ""));
      return true;
    };
    window.genealogyDragTarget = ({ nodeSelector, desiredX, desiredY }) => {
      const viewport = document.querySelector(".tree-viewport");
      const node = document.querySelector(nodeSelector);
      if (!viewport || !node) return null;
      const nodeRect = node.getBoundingClientRect();
      const grabOffsetX = nodeRect.width / 2;
      const grabOffsetY = 24;
      const startX = Number(node.getAttribute("data-genealogy-x"));
      const startY = Number(node.getAttribute("data-genealogy-y"));
      return {
        startClientX: nodeRect.left + grabOffsetX,
        startClientY: nodeRect.top + grabOffsetY,
        endClientX: nodeRect.left + grabOffsetX + desiredX - startX,
        endClientY: nodeRect.top + grabOffsetY + desiredY - startY,
        startX,
        startY,
        desiredX,
        desiredY,
      };
    };
  });
}

export async function collectViteOverlayText(browser) {
  const overlays = [];
  for (const context of browser.contexts()) {
    for (const page of context.pages()) {
      const overlayText = await page.locator("vite-error-overlay").evaluate((overlay) => (
        overlay.shadowRoot?.textContent || overlay.textContent || ""
      )).catch(() => "");
      if (overlayText) overlays.push(overlayText);
    }
  }
  return overlays;
}
