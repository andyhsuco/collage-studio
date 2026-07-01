import type { CollageDocument, ImageAsset, Rect } from "../../types";
import { getCanvasAspect } from "../../types";
import { coverFillRatio } from "../geometry/crop";
import { distributeBalancedIndices } from "./balancedGrid";
import { buildGridTreeFromRowGroups } from "./templates";
import { resolveAllRects } from "./splitTree";

export interface SmartOrganizePlan {
  rows: number;
  rowGroups: string[][];
  totalCropLoss: number;
}

export function frameAspectFromRect(
  rect: Rect,
  canvasAspect: number,
): number {
  return canvasAspect * (rect.width / rect.height);
}

export function cropLossForCell(
  canvasAspect: number,
  rows: number,
  colsInRow: number,
  imageAspect: number,
): number {
  if (colsInRow <= 0) return 1;
  const frameAspect = (canvasAspect * rows) / colsInRow;
  return 1 - coverFillRatio(frameAspect, imageAspect);
}

function imageAspect(
  asset: ImageAsset | undefined,
  fallback = 1,
): number {
  if (!asset || asset.naturalWidth <= 0 || asset.naturalHeight <= 0) {
    return fallback;
  }
  return asset.naturalWidth / asset.naturalHeight;
}

function assignPhotosToRows(
  frameIds: string[],
  rowSizes: number[],
  doc: CollageDocument,
  canvasAspect: number,
): string[][] {
  const items = frameIds.map((id) => ({
    id,
    aspect: imageAspect(doc.images[doc.frames[id]?.imageId]),
  }));
  items.sort((a, b) => b.aspect - a.aspect);

  const rows = rowSizes.length;
  const slots = rowSizes.map((size, index) => ({
    index,
    size,
    targetAspect: (canvasAspect * rows) / size,
  }));
  slots.sort((a, b) => b.targetAspect - a.targetAspect);

  const rowGroups: string[][] = rowSizes.map(() => []);
  let itemIdx = 0;

  for (const slot of slots) {
    const group: string[] = [];
    for (let i = 0; i < slot.size; i++) {
      if (itemIdx < items.length) {
        group.push(items[itemIdx++].id);
      }
    }
    rowGroups[slot.index] = group;
  }

  return rowGroups;
}

function scoreRowGroups(
  doc: CollageDocument,
  rowGroups: string[][],
  canvasAspect: number,
): number {
  const tree = buildGridTreeFromRowGroups(rowGroups);
  const rects = resolveAllRects(tree, doc.gutter);
  let totalLoss = 0;

  for (const row of rowGroups) {
    for (const frameId of row) {
      const rect = rects.get(frameId);
      const img = doc.images[doc.frames[frameId]?.imageId];
      if (!rect || !img) continue;

      const frameAspect = frameAspectFromRect(rect, canvasAspect);
      const imgAsp = imageAspect(img);
      totalLoss += 1 - coverFillRatio(frameAspect, imgAsp);
    }
  }

  return totalLoss;
}

/** Pick row count + photo distribution that minimizes cover-mode cropping. */
export function computeSmartOrganizePlan(
  doc: CollageDocument,
): SmartOrganizePlan | null {
  const count = doc.frameOrder.length;
  if (count < 2) return null;

  const canvasAspect = getCanvasAspect(doc);
  const frameIds = doc.frameOrder;

  let best: SmartOrganizePlan | null = null;

  for (let rows = 1; rows <= count; rows++) {
    const indexGroups = distributeBalancedIndices(count, rows);
    const rowSizes = indexGroups.map((g) => g.length);
    const rowGroups = assignPhotosToRows(
      frameIds,
      rowSizes,
      doc,
      canvasAspect,
    );
    const totalCropLoss = scoreRowGroups(doc, rowGroups, canvasAspect);

    const isBetter =
      !best ||
      totalCropLoss < best.totalCropLoss - 1e-9 ||
      (Math.abs(totalCropLoss - best.totalCropLoss) <= 1e-9 && rows < best.rows);

    if (isBetter) {
      best = { rows, rowGroups, totalCropLoss };
    }
  }

  return best;
}
