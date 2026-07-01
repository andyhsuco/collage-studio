import type { CollageDocument, GutterHandle, Rect } from "../../types";
import { getCanvasAspect } from "../../types";
import {
  chunkIds,
  computeBestGridLayout,
  distributeBalancedIds,
  gridLayoutPlanForRows,
  type GridLayoutPlan,
} from "./balancedGrid";

export interface RowDropTarget {
  rowIndex: number;
  insertIndex: number;
}

export function flattenRowGroups(groups: string[][]): string[] {
  return groups.flat();
}

export function getGridPlan(doc: CollageDocument): GridLayoutPlan {
  const count = doc.frameOrder.length;
  const aspect = getCanvasAspect(doc);
  if (doc.gridRows != null) {
    return gridLayoutPlanForRows(count, doc.gridRows);
  }
  return computeBestGridLayout(count, aspect);
}

export function deriveGridRowGroups(doc: CollageDocument): string[][] {
  const plan = getGridPlan(doc);
  if (plan.exact) {
    return chunkIds(doc.frameOrder, plan.cols);
  }
  return distributeBalancedIds(doc.frameOrder, plan.rows);
}

export function getGridRowGroups(doc: CollageDocument): string[][] {
  if (doc.gridRowGroups) {
    return doc.gridRowGroups.map((row) => [...row]);
  }
  return deriveGridRowGroups(doc);
}

function rowBoundingRect(
  frameIds: string[],
  rects: Map<string, Rect>,
): Rect | null {
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  let found = false;

  for (const id of frameIds) {
    const r = rects.get(id);
    if (!r) continue;
    found = true;
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }

  if (!found) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function sortRowLeftToRight(
  rowFrames: string[],
  rects: Map<string, Rect>,
): string[] {
  return [...rowFrames].sort(
    (a, b) => (rects.get(a)?.x ?? 0) - (rects.get(b)?.x ?? 0),
  );
}

function findInsertIndexForGutterX(
  gutterX: number,
  rowFrames: string[],
  rects: Map<string, Rect>,
): number {
  const ordered = sortRowLeftToRight(rowFrames, rects);
  for (let i = 0; i < ordered.length; i++) {
    const r = rects.get(ordered[i]);
    if (!r) continue;
    if (gutterX < r.x + r.width / 2) {
      return i;
    }
  }
  return ordered.length;
}

/** Target row + column slot from a vertical gutter inside that row. */
export function resolveVerticalGutterDrop(
  handle: GutterHandle,
  groups: string[][],
  rects: Map<string, Rect>,
): RowDropTarget | null {
  if (handle.axis !== "v") return null;

  const handleMidY = handle.y + handle.height / 2;
  const gutterX = handle.x + handle.width / 2;

  for (let rowIndex = 0; rowIndex < groups.length; rowIndex++) {
    const rowRect = rowBoundingRect(groups[rowIndex], rects);
    if (!rowRect) continue;

    const inRowVertically =
      handleMidY >= rowRect.y && handleMidY <= rowRect.y + rowRect.height;
    const inRowHorizontally =
      gutterX >= rowRect.x && gutterX <= rowRect.x + rowRect.width;

    if (!inRowVertically || !inRowHorizontally) continue;

    return {
      rowIndex,
      insertIndex: findInsertIndexForGutterX(
        gutterX,
        groups[rowIndex],
        rects,
      ),
    };
  }

  return null;
}

export function rowDropTargetsEqual(
  a: RowDropTarget,
  b: RowDropTarget,
): boolean {
  return a.rowIndex === b.rowIndex && a.insertIndex === b.insertIndex;
}

export function verticalGutterMatchesDrop(
  handle: GutterHandle,
  target: RowDropTarget,
  groups: string[][],
  rects: Map<string, Rect>,
): boolean {
  const resolved = resolveVerticalGutterDrop(handle, groups, rects);
  return resolved != null && rowDropTargetsEqual(resolved, target);
}

export function findSourceRow(
  groups: string[][],
  frameId: string,
): number {
  return groups.findIndex((row) => row.includes(frameId));
}

/**
 * Move a frame into another row at the vertical gutter's column position.
 * Returns updated row groups, or null if the move is invalid.
 */
export function moveFrameToRowAtGutter(
  groups: string[][],
  frameId: string,
  target: RowDropTarget,
  rects: Map<string, Rect>,
): string[][] | null {
  const sourceRow = findSourceRow(groups, frameId);
  if (sourceRow < 0 || sourceRow === target.rowIndex) return null;
  if (target.rowIndex < 0 || target.rowIndex >= groups.length) return null;

  const next = groups.map((row) => [...row]);
  next[sourceRow] = next[sourceRow].filter((id) => id !== frameId);

  const ordered = sortRowLeftToRight(next[target.rowIndex], rects);
  const insertAt = Math.max(0, Math.min(target.insertIndex, ordered.length));
  ordered.splice(insertAt, 0, frameId);
  next[target.rowIndex] = ordered;

  return next.filter((row) => row.length > 0);
}

export function isGridLikeLayout(presetName: string | null | undefined): boolean {
  return presetName === "Grid" || presetName === "Gallery";
}
