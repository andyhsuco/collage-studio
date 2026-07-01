import type { CollageDocument, SplitNode } from "../../types";
import { MIN_PHOTOS, RATIO_VALUES } from "../../types";
import { generateLayoutOptions } from "../layout/autoLayout";
import {
  buildFilledGridTree,
  createTreeFromTemplate,
} from "../layout/templates";

export function singleFrameLayout(frameId: string): SplitNode {
  return { type: "leaf", frameId };
}

export function canvasAspect(doc: CollageDocument): number {
  if (doc.canvasRatio === "custom") {
    return doc.customWidth / doc.customHeight;
  }
  return RATIO_VALUES[doc.canvasRatio];
}

function filledGridOption(
  doc: CollageDocument,
  options: ReturnType<typeof generateLayoutOptions>,
) {
  const aspect = canvasAspect(doc);
  const tree = buildFilledGridTree(
    doc.frameOrder,
    aspect,
    doc.gridRows,
    doc.gridRowGroups,
  );
  const base =
    options.find((o) => o.name === "Grid") ??
    options.find((o) => o.name === "Gallery") ??
    options[0];

  if (base) {
    return { ...base, tree };
  }

  return {
    id: `grid-${doc.frameOrder.length}`,
    name: "Grid",
    tree,
    score: 100,
  };
}

function pickPreservedLayout(
  options: ReturnType<typeof generateLayoutOptions>,
  previousPresetId: string | null,
  previousPresetName: string | null,
) {
  if (previousPresetId) {
    const byId = options.find((o) => o.id === previousPresetId);
    if (byId) return byId;
  }
  if (previousPresetName) {
    const byName = options.find((o) => o.name === previousPresetName);
    if (byName) return byName;
  }
  return null;
}

export interface ApplyLayoutOptions {
  /** When true, rebuild as a width-filling grid (e.g. after adding photos). */
  rebalance?: boolean;
  previousPresetId?: string | null;
  previousPresetName?: string | null;
}

export function applyLayoutForImages(
  doc: CollageDocument,
  opts: ApplyLayoutOptions = {},
): {
  layoutTree: SplitNode | null;
  layoutOptions: ReturnType<typeof generateLayoutOptions>;
  selectedPresetId: string | null;
} {
  const count = doc.frameOrder.length;

  if (count >= MIN_PHOTOS) {
    const options = generateLayoutOptions(
      doc.frameOrder,
      doc.canvasRatio,
      doc.customWidth,
      doc.customHeight,
    );

    let selected = options[0] ?? null;

    if (opts.rebalance) {
      selected = filledGridOption(doc, options);
    } else {
      const preserved = pickPreservedLayout(
        options,
        opts.previousPresetId ?? null,
        opts.previousPresetName ?? null,
      );
      if (preserved) selected = preserved;
    }

    return {
      layoutTree: selected?.tree ?? null,
      layoutOptions: options,
      selectedPresetId: selected?.id ?? null,
    };
  }

  if (count === 1) {
    return {
      layoutTree: singleFrameLayout(doc.frameOrder[0]),
      layoutOptions: [],
      selectedPresetId: null,
    };
  }

  return {
    layoutTree: null,
    layoutOptions: [],
    selectedPresetId: null,
  };
}

export function rebalanceGridTree(
  frameIds: string[],
  doc: CollageDocument,
): SplitNode {
  return buildFilledGridTree(
    frameIds,
    canvasAspect(doc),
    doc.gridRows,
    doc.gridRowGroups,
  );
}

export { createTreeFromTemplate };
