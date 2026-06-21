export interface GridLayoutPlan {
  rows: number;
  /** Equal columns per row when exact; otherwise max columns in any row. */
  cols: number;
  exact: boolean;
}

function aspectScore(gridAspect: number, canvasAspect: number): number {
  return Math.abs(Math.log(gridAspect / canvasAspect));
}

function isStripLayout(cols: number, rows: number, count: number): boolean {
  const ratio = cols / rows;
  return ratio >= Math.min(count, 4) || ratio <= 1 / Math.min(count, 4);
}

/** Spread items across rows so row sizes differ by at most 1 (extras toward top). */
export function distributeBalancedIndices(
  count: number,
  rows: number,
): number[][] {
  const base = Math.floor(count / rows);
  let remainder = count % rows;
  const groups: number[][] = [];
  let idx = 0;

  for (let r = 0; r < rows; r++) {
    const size = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
    groups.push(Array.from({ length: size }, (_, i) => idx + i));
    idx += size;
  }

  return groups;
}

function scoreUnevenLayout(
  count: number,
  rows: number,
  canvasAspect: number,
): number {
  const groups = distributeBalancedIndices(count, rows);
  const maxCols = Math.max(...groups.map((g) => g.length));
  const minCols = Math.min(...groups.map((g) => g.length));
  const gridAspect = maxCols / rows;
  const emptyCells = rows * maxCols - count;
  const colVariance = maxCols - minCols;
  return emptyCells * 50 + aspectScore(gridAspect, canvasAspect) * 3 + colVariance * 0.75;
}

/** Pick grid dimensions that tile every photo with no unused cells when possible. */
export function computeBestGridLayout(
  count: number,
  canvasAspect: number,
): GridLayoutPlan {
  let bestExact: (GridLayoutPlan & { score: number }) | null = null;
  let bestUneven: (GridLayoutPlan & { score: number }) | null = null;

  for (let rows = 1; rows <= count; rows++) {
    if (count % rows === 0) {
      const cols = count / rows;
      const score = aspectScore(cols / rows, canvasAspect) * 2;
      if (!bestExact || score < bestExact.score) {
        bestExact = { rows, cols, exact: true, score };
      }
    } else {
      const score = scoreUnevenLayout(count, rows, canvasAspect);
      const groups = distributeBalancedIndices(count, rows);
      const maxCols = Math.max(...groups.map((g) => g.length));
      if (!bestUneven || score < bestUneven.score) {
        bestUneven = { rows, cols: maxCols, exact: false, score };
      }
    }
  }

  const squareish = canvasAspect >= 0.8 && canvasAspect <= 1.25;

  if (bestExact && squareish && isStripLayout(bestExact.cols, bestExact.rows, count) && bestUneven) {
    const unevenEmpty = bestUneven.rows * bestUneven.cols - count;
    if (unevenEmpty <= 2) {
      return {
        rows: bestUneven.rows,
        cols: bestUneven.cols,
        exact: false,
      };
    }
  }

  if (bestExact) {
    return {
      rows: bestExact.rows,
      cols: bestExact.cols,
      exact: true,
    };
  }

  return {
    rows: bestUneven!.rows,
    cols: bestUneven!.cols,
    exact: false,
  };
}

/** @deprecated use computeBestGridLayout */
export function computeBalancedGridDimensions(
  count: number,
  canvasAspect: number,
): { rows: number; maxCols: number } {
  const plan = computeBestGridLayout(count, canvasAspect);
  return { rows: plan.rows, maxCols: plan.cols };
}

export function distributeBalancedIds<T>(ids: T[], rows: number): T[][] {
  const groups = distributeBalancedIndices(ids.length, rows);
  return groups.map((indices) => indices.map((i) => ids[i]));
}

export function chunkIds<T>(ids: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    groups.push(ids.slice(i, i + size));
  }
  return groups;
}
