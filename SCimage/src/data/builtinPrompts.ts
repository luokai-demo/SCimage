export interface BuiltinPromptGroup {
  id: string;
  label: string;
  items: string[];
}

export const builtinPromptGroups: BuiltinPromptGroup[] = [
  {
    id: "subject",
    label: "主体",
    items: [
      "精致人物肖像",
      "自然放松的姿态",
      "清晰面部细节",
      "完整身体构图",
      "服装层次丰富",
      "真实皮肤质感",
    ],
  },
  {
    id: "scene",
    label: "场景",
    items: [
      "室内自然光",
      "城市街景",
      "海边日落",
      "温暖卧室",
      "咖啡馆窗边",
      "极简摄影棚",
    ],
  },
  {
    id: "style",
    label: "风格",
    items: [
      "电影感摄影",
      "日系清透风格",
      "高端时装大片",
      "胶片质感",
      "写实商业摄影",
      "柔和复古色调",
    ],
  },
  {
    id: "light",
    label: "光影",
    items: [
      "柔和侧逆光",
      "窗边漫射光",
      "低对比自然光",
      "轮廓光",
      "黄金时刻光线",
      "细腻阴影层次",
    ],
  },
  {
    id: "camera",
    label: "镜头",
    items: [
      "85mm 人像镜头",
      "浅景深",
      "背景虚化",
      "半身构图",
      "低机位视角",
      "高清细节",
    ],
  },
  {
    id: "quality",
    label: "质量",
    items: [
      "高分辨率",
      "细节丰富",
      "色彩自然",
      "构图平衡",
      "专业后期调色",
      "干净背景",
    ],
  },
];
