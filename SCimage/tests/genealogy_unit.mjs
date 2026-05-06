import { createServer } from "vite";
import { runGenealogyUnitCases } from "./genealogy_unit_cases.mjs";

const server = await createServer({
  configFile: false,
  logLevel: "error",
  optimizeDeps: {
    entries: [],
    noDiscovery: true,
  },
  server: { middlewareMode: true },
});

try {
  const [
    familyViewModel,
    inspectorViewModel,
    miniMapHitTest,
    renderBudget,
  ] = await Promise.all([
    server.ssrLoadModule("/src/components/genealogy/genealogyFamilyViewModel.ts"),
    server.ssrLoadModule("/src/components/genealogy/genealogyInspectorViewModel.ts"),
    server.ssrLoadModule("/src/components/genealogy/genealogyMiniMapHitTest.ts"),
    server.ssrLoadModule("/src/components/genealogy/genealogyRenderBudget.ts"),
  ]);

  runGenealogyUnitCases({
    ...familyViewModel,
    ...inspectorViewModel,
    ...miniMapHitTest,
    ...renderBudget,
  });
} finally {
  await server.close();
}
