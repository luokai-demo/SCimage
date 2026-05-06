import { prepareGenealogyCanvas } from "./genealogy/canvasBasics.mjs";
import { runGenealogyDeleteAndBudgetScenario } from "./genealogy/canvasDeletionAndBudget.mjs";
import { runGenealogyMinimapScenario } from "./genealogy/canvasMinimap.mjs";
import { runGenealogyNodeDragScenario } from "./genealogy/canvasNodeDrag.mjs";

export async function runGenealogyCanvasScenario(context) {
  await prepareGenealogyCanvas(context);
  const blankPanStart = await runGenealogyNodeDragScenario(context);
  await runGenealogyMinimapScenario(context, blankPanStart);
  await runGenealogyDeleteAndBudgetScenario(context);
}
