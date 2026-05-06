import assert from "node:assert/strict";
import { test } from "node:test";

export function runGenealogyUnitCases(modules) {
  const {
    createGenealogyFamilyViewModel,
    createGenealogyInspectorViewModel,
    createGenealogyNodeMediaLoadState,
    createGenealogyRenderBudget,
    createJobPanelListItems,
    findGenealogyMiniMapNodeAtPoint,
  } = modules;

  test("小地图命中测试优先返回最上层节点", () => {
    const nodes = [
      layoutNode({ id: "first", x: 10, y: 20 }),
      layoutNode({ id: "second", x: 30, y: 40 }),
    ];

    const hit = findGenealogyMiniMapNodeAtPoint(nodes, { x: 48, y: 58 });

    assert.equal(hit?.id, "second");
  });

  test("族谱渲染预算会按规模降级", () => {
    const normal = createGenealogyRenderBudget(layoutOf(8, 7));
    const dense = createGenealogyRenderBudget(layoutOf(90, 120));
    const huge = createGenealogyRenderBudget(layoutOf(180, 220));

    assert.equal(normal.level, "normal");
    assert.equal(normal.renderEdgeTracks, true);
    assert.equal(dense.level, "dense");
    assert.equal(dense.renderEdgeTracks, true);
    assert.equal(huge.level, "huge");
    assert.equal(huge.renderEdgeTracks, false);
    assert.equal(huge.renderEdgeOrigins, false);
    assert.equal(huge.imageSourceMode, "preview");
  });

  test("族谱卡片 view model 输出稳定中文文案", () => {
    const family = createGenealogyFamilyViewModel({
      root_id: "root",
      title: "",
      prompt: "root prompt",
      cover_url: "/cover.png",
      image_count: 3,
      node_count: 3,
      generation_count: 2,
      latest_updated_at: "2026-05-06T12:00:00.000Z",
      has_multi_source: true,
      root_type: "source",
    });

    assert.equal(family.title, "未命名族谱");
    assert.equal(family.rootKindLabel, "外部根图");
    assert.equal(family.generationLabel, "2 代");
    assert.equal(family.imageCountLabel, "3 张");
    assert.equal(family.hasMultiSource, true);
  });

  test("族谱检查器 view model 复用节点状态文案", () => {
    const node = layoutNode({
      id: "node",
      type: "pending",
      prompt: "等待生成",
      status: "queued",
      updated_at: "2026-05-06T12:00:00.000Z",
    });

    const view = createGenealogyInspectorViewModel(node, node, 2);

    assert.equal(view.fallbackPreviewText, "预定位置");
    assert.equal(view.parentLabel, "2 来源");
    assert.equal(view.statusLabel, "排队");
    assert.equal(view.title, "等待生成");
  });

  test("族谱节点图片策略不会因视口变化退回占位", () => {
    const layout = layoutOf(180, 220);
    const hugeBudget = createGenealogyRenderBudget(layout);
    const farNode = layoutNode({ x: 3600, y: 2600 });

    const farState = createGenealogyNodeMediaLoadState({
      bloodline: false,
      dragging: false,
      node: farNode,
      related: false,
      renderBudget: hugeBudget,
      selected: false,
    });
    const selectedState = createGenealogyNodeMediaLoadState({
      bloodline: false,
      dragging: false,
      node: farNode,
      related: false,
      renderBudget: hugeBudget,
      selected: true,
    });

    assert.equal(farState.imageUrl, "/preview.png");
    assert.equal(farState.loadingMode, "lazy");
    assert.equal(selectedState.imageUrl, "/preview.png");
    assert.equal(selectedState.loadingMode, "eager");
  });

  test("任务中心按状态分组输出稳定顺序", () => {
    const items = createJobPanelListItems([
      job({ id: "done", status: "completed" }),
      job({ id: "running", status: "running" }),
      job({ id: "failed", status: "failed" }),
      job({ id: "partial", status: "partial" }),
    ]);

    assert.deepEqual(
      items.map((item) => item.type === "group" ? item.title : item.job.id),
      ["进行中", "running", "失败", "failed", "partial", "已完成", "done"],
    );
  });
}

function layoutNode(overrides = {}) {
  return {
    id: "node",
    type: "generated",
    job_id: "job",
    slot: 1,
    url: "/image.png",
    preview_url: "/preview.png",
    filename: "image.png",
    prompt: "prompt",
    workflow: "image-to-image",
    status: "completed",
    model: "model",
    compat_profile_id: "openai",
    output_profile_id: "aspect_v1",
    quality: "auto",
    size: "1024x1024",
    created_at: "2026-05-06T12:00:00.000Z",
    updated_at: "2026-05-06T12:00:00.000Z",
    generation: 0,
    order: 0,
    x: 0,
    y: 0,
    ...overrides,
  };
}

function layoutOf(nodeCount, edgeCount) {
  return {
    nodes: Array.from({ length: nodeCount }, (_, index) => layoutNode({ id: `node-${index}` })),
    edges: Array.from({ length: edgeCount }, (_, index) => ({
      from: `node-${index % Math.max(nodeCount, 1)}`,
      to: `node-${(index + 1) % Math.max(nodeCount, 1)}`,
      job_id: `job-${index}`,
      fromX: 0,
      fromY: 0,
      toX: 1,
      toY: 1,
    })),
    generationCount: 1,
    width: 1000,
    height: 1000,
  };
}

function job(overrides = {}) {
  return {
    id: "job",
    status: "completed",
    workflow: "generate",
    prompt: "prompt",
    count: 1,
    images: [],
    created_at: "2026-05-06T12:00:00.000Z",
    updated_at: "2026-05-06T12:00:10.000Z",
    ...overrides,
  };
}
