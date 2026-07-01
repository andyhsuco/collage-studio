import type { SplitNode } from "../../types";
import {
  chunkIds,
  computeBestGridLayout,
  distributeBalancedIds,
  gridLayoutPlanForRows,
} from "./balancedGrid";

export type TemplateFactory = (
  frameIds: string[],
  canvasAspect: number,
) => SplitNode;

function leaf(frameId: string): SplitNode {
  return { type: "leaf", frameId };
}

function splitV(ratio: number, a: SplitNode, b: SplitNode): SplitNode {
  return { type: "split", axis: "v", ratio, a, b };
}

function splitH(ratio: number, a: SplitNode, b: SplitNode): SplitNode {
  return { type: "split", axis: "h", ratio, a, b };
}

/** Each photo in the row gets equal width; the row always spans the full canvas width. */
export function rowEqual(ids: string[]): SplitNode {
  if (ids.length === 1) return leaf(ids[0]);
  const ratio = 1 / ids.length;
  return splitV(ratio, leaf(ids[0]), rowEqual(ids.slice(1)));
}

/** Each photo in the column gets equal height; the column spans the full canvas height. */
export function columnEqual(ids: string[]): SplitNode {
  if (ids.length === 1) return leaf(ids[0]);
  const ratio = 1 / ids.length;
  return splitH(ratio, leaf(ids[0]), columnEqual(ids.slice(1)));
}

function stackVerticalEqual(nodes: SplitNode[]): SplitNode {
  if (nodes.length === 1) return nodes[0];
  if (nodes.length === 2) return splitH(0.5, nodes[0], nodes[1]);
  const mid = Math.ceil(nodes.length / 2);
  const ratio = mid / nodes.length;
  return splitH(
    ratio,
    stackVerticalEqual(nodes.slice(0, mid)),
    stackVerticalEqual(nodes.slice(mid)),
  );
}

/**
 * Grid layout: every row fills 100% width, photos in a row share width equally
 * (fewer photos in a row ⇒ each photo is wider).
 */
export function buildGridTreeFromRowGroups(rowGroups: string[][]): SplitNode {
  const rowNodes = rowGroups.map((group) => rowEqual(group));
  if (rowNodes.length === 1) return rowNodes[0];
  return stackVerticalEqual(rowNodes);
}

export function buildFilledGridTree(
  ids: string[],
  canvasAspect: number,
  rowOverride?: number | null,
  rowGroups?: string[][] | null,
): SplitNode {
  if (rowGroups && rowGroups.length > 0) {
    return buildGridTreeFromRowGroups(rowGroups);
  }

  const plan =
    rowOverride != null
      ? gridLayoutPlanForRows(ids.length, rowOverride)
      : computeBestGridLayout(ids.length, canvasAspect);
  const computedGroups = plan.exact
    ? chunkIds(ids, plan.cols)
    : distributeBalancedIds(ids, plan.rows);

  const rowNodes = computedGroups.map((group) => rowEqual(group));
  if (rowNodes.length === 1) return rowNodes[0];
  return stackVerticalEqual(rowNodes);
}

function heroLeft(ids: string[], ratio = 0.58): SplitNode {
  const [hero, ...rest] = ids;
  if (rest.length === 0) return leaf(hero);
  return splitV(ratio, leaf(hero), columnEqual(rest));
}

function heroTop(ids: string[], ratio = 0.55): SplitNode {
  const [hero, ...rest] = ids;
  if (rest.length === 0) return leaf(hero);
  return splitH(ratio, leaf(hero), rowEqual(rest));
}

function heroRight(ids: string[], ratio = 0.42): SplitNode {
  const last = ids[ids.length - 1];
  const rest = ids.slice(0, -1);
  if (rest.length === 0) return leaf(last);
  return splitV(ratio, rowEqual(rest), leaf(last));
}

function mosaic5(ids: string[]): SplitNode | null {
  if (ids.length !== 5) return null;
  return splitV(
    0.5,
    splitH(0.5, leaf(ids[0]), leaf(ids[1])),
    splitH(0.5, splitV(0.5, leaf(ids[2]), leaf(ids[3])), leaf(ids[4])),
  );
}

function triptych(ids: string[]): SplitNode {
  if (ids.length < 3) return rowEqual(ids);
  return splitV(0.33, leaf(ids[0]), splitV(0.5, leaf(ids[1]), leaf(ids[2])));
}

function pinwheel4(ids: string[]): SplitNode | null {
  if (ids.length !== 4) return null;
  return splitV(
    0.5,
    splitH(0.5, leaf(ids[0]), leaf(ids[1])),
    splitH(0.5, leaf(ids[2]), leaf(ids[3])),
  );
}

function featuredCenter(ids: string[]): SplitNode | null {
  if (ids.length !== 5) return null;
  return splitH(
    0.35,
    rowEqual(ids.slice(0, 2)),
    splitH(0.5, leaf(ids[2]), rowEqual(ids.slice(3, 5))),
  );
}

function magazineLayout(ids: string[], canvasAspect: number): SplitNode {
  const heroCount = Math.min(2, Math.max(1, Math.floor(ids.length / 4)));
  return splitV(
    0.38,
    columnEqual(ids.slice(0, heroCount)),
    buildFilledGridTree(ids.slice(heroCount), canvasAspect),
  );
}

function buildTemplates(count: number): TemplateFactory[] {
  const factories: TemplateFactory[] = [
    (ids, aspect) => buildFilledGridTree(ids, aspect),
    (ids) => rowEqual(ids),
    (ids) => columnEqual(ids),
    (ids, _aspect) => heroLeft(ids),
    (ids, _aspect) => heroTop(ids),
    (ids, _aspect) => heroRight(ids),
  ];

  if (count === 3) factories.push((ids) => triptych(ids));
  if (count === 4) factories.push((ids) => pinwheel4(ids)!);
  if (count === 5) {
    factories.push((ids) => mosaic5(ids)!);
    factories.push((ids) => featuredCenter(ids)!);
  }
  if (count >= 6 && count <= 8) {
    factories.push((ids, aspect) => magazineLayout(ids, aspect));
  }
  if (count >= 9) {
    factories.push((ids, aspect) => buildFilledGridTree(ids, aspect));
    factories.push((ids) => heroTop(ids, 0.4));
    factories.push((ids) => heroLeft(ids, 0.35));
  }

  return factories;
}

export interface TemplateDefinition {
  id: string;
  name: string;
  create: TemplateFactory;
}

const TEMPLATE_NAMES = [
  "Grid",
  "Row",
  "Column",
  "Hero Left",
  "Hero Top",
  "Hero Right",
  "Triptych",
  "Quartet",
  "Mosaic",
  "Featured",
  "Magazine",
  "Gallery",
];

export function getTemplatesForCount(count: number): TemplateDefinition[] {
  const factories = buildTemplates(count);

  const seen = new Set<string>();
  const templates: TemplateDefinition[] = [];

  factories.forEach((create, i) => {
    try {
      const dummyIds = Array.from({ length: count }, (_, j) => `f${j}`);
      const tree = create(dummyIds, 1);
      const key = serializeTree(tree);
      if (seen.has(key)) return;
      seen.add(key);
      templates.push({
        id: `tpl-${count}-${i}`,
        name: TEMPLATE_NAMES[i] ?? `Layout ${templates.length + 1}`,
        create,
      });
    } catch {
      // skip invalid
    }
  });

  return templates;
}

function serializeTree(node: SplitNode): string {
  if (node.type === "leaf") return node.frameId;
  return `${node.axis}:${node.ratio.toFixed(2)}(${serializeTree(node.a)},${serializeTree(node.b)})`;
}

export function instantiateTemplate(
  template: TemplateDefinition,
  frameIds: string[],
  canvasAspect: number,
): SplitNode {
  return remapTree(template.create(frameIds, canvasAspect), frameIds);
}

function remapTree(node: SplitNode, frameIds: string[]): SplitNode {
  if (node.type === "leaf") {
    const idx = parseInt(node.frameId.replace("f", ""), 10);
    return { type: "leaf", frameId: frameIds[idx] ?? node.frameId };
  }
  return {
    ...node,
    a: remapTree(node.a, frameIds),
    b: remapTree(node.b, frameIds),
  };
}

export function createTreeFromTemplate(
  templateId: string,
  frameIds: string[],
  canvasAspect = 1,
): SplitNode | null {
  const templates = getTemplatesForCount(frameIds.length);
  const template = templates.find((t) => t.id === templateId);
  if (!template) return null;
  return instantiateTemplate(template, frameIds, canvasAspect);
}
