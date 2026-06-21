import type { CanvasRatio, LayoutOption, SplitNode } from "../../types";
import { getCanvasAspect, RATIO_VALUES } from "../../types";
import { countLeaves } from "./splitTree";
import {
  getTemplatesForCount,
  instantiateTemplate,
  type TemplateDefinition,
} from "./templates";

function scoreTemplate(
  tree: SplitNode,
  aspect: number,
  templateName: string,
  count: number,
): number {
  let score = 0;
  const name = templateName.toLowerCase();

  if (aspect >= 1.2) {
    if (name.includes("row") || name.includes("hero left") || name.includes("grid")) score += 2;
    if (name.includes("column") && aspect > 1.5) score -= 1;
  } else if (aspect <= 0.85) {
    if (name.includes("column") || name.includes("hero top") || name.includes("grid tall")) score += 2;
    if (name.includes("row") && aspect < 0.7) score -= 1;
  } else {
    if (name.includes("grid") || name.includes("mosaic") || name.includes("quartet")) score += 2;
  }

  if (name.includes("hero")) score += 0.5;
  if (name.includes("magazine")) score += 1;
  if (count >= 2 && name === "grid") score += 2;
  if (count >= 6 && name === "gallery") score += 1.5;

  const leaves = countLeaves(tree);
  score += Math.min(leaves, 20) * 0.01;

  return score;
}

export function generateLayoutOptions(
  frameIds: string[],
  canvasRatio: CanvasRatio,
  customWidth: number,
  customHeight: number,
): LayoutOption[] {
  const count = frameIds.length;
  if (count < 2) return [];

  const aspect =
    canvasRatio === "custom"
      ? customWidth / customHeight
      : RATIO_VALUES[canvasRatio];

  const templates = getTemplatesForCount(count);

  const options: LayoutOption[] = templates.map((template: TemplateDefinition) => {
    const tree = instantiateTemplate(template, frameIds, aspect);
    return {
      id: template.id,
      name: template.name,
      tree,
      score: scoreTemplate(tree, aspect, template.name, count),
    };
  });

  return options.sort((a, b) => b.score - a.score);
}

export function getBestLayout(
  frameIds: string[],
  canvasRatio: CanvasRatio,
  customWidth: number,
  customHeight: number,
): LayoutOption | null {
  const options = generateLayoutOptions(
    frameIds,
    canvasRatio,
    customWidth,
    customHeight,
  );
  return options[0] ?? null;
}

export function getCanvasAspectFromSettings(
  canvasRatio: CanvasRatio,
  customWidth: number,
  customHeight: number,
): number {
  if (canvasRatio === "custom") return customWidth / customHeight;
  return RATIO_VALUES[canvasRatio];
}

export { getCanvasAspect };
