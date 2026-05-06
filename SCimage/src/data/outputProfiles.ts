export const AUTO_OPTION = "auto";
export const OUTPUT_PROFILE_ASPECT_V1 = "aspect_v1";
export const OUTPUT_PROFILE_PIXEL_V1 = "pixel_v1";
export const DEFAULT_OUTPUT_PROFILE_ID = OUTPUT_PROFILE_PIXEL_V1;

export interface OutputOption {
  value: string;
  label: string;
  aspect?: string;
  width?: number;
  height?: number;
  quality?: string;
}

export const aspectLabels: Record<string, string> = {
  "1:1": "1:1 方形",
  "16:9": "16:9 横屏",
  "9:16": "9:16 竖屏",
  "3:2": "3:2 横屏（相机）",
  "2:3": "2:3 竖屏（相机）",
  "4:3": "4:3 横屏",
  "3:4": "3:4 竖屏",
  "5:4": "5:4 横屏",
  "4:5": "4:5 竖屏（社媒）",
  "21:9": "21:9 超宽屏",
};

export const pixelSizeValues: Record<string, Array<[string, string]>> = {
  standard: [
    ["1:1", "1024x1024"], ["16:9", "1280x720"], ["9:16", "720x1280"],
    ["3:2", "1248x832"], ["2:3", "832x1248"], ["4:3", "1152x864"],
    ["3:4", "864x1152"], ["5:4", "1120x896"], ["4:5", "896x1120"],
    ["21:9", "1456x624"],
  ],
  hd: [
    ["1:1", "2048x2048"], ["16:9", "2560x1440"], ["9:16", "1440x2560"],
    ["3:2", "2496x1664"], ["2:3", "1664x2496"], ["4:3", "2304x1728"],
    ["3:4", "1728x2304"], ["5:4", "2240x1792"], ["4:5", "1792x2240"],
    ["21:9", "3024x1296"],
  ],
  "4k": [
    ["1:1", "2880x2880"], ["16:9", "3840x2160"], ["9:16", "2160x3840"],
    ["3:2", "3504x2336"], ["2:3", "2336x3504"], ["4:3", "3264x2448"],
    ["3:4", "2448x3264"], ["5:4", "3200x2560"], ["4:5", "2560x3200"],
    ["21:9", "3696x1584"],
  ],
};

export function parsePixelSize(value: unknown): [number, number] | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (!/^[1-9]\d*x[1-9]\d*$/.test(normalized)) return null;
  const [width, height] = normalized.split("x");
  return [Number.parseInt(width, 10), Number.parseInt(height, 10)];
}
