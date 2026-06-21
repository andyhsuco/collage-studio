import type { GutterHandle, Rect, SplitNode } from "../../types";

export function resolveRects(
  node: SplitNode,
  bounds: Rect,
  gutter: number,
): Map<string, Rect> {
  if (node.type === "leaf") {
    return new Map([[node.frameId, bounds]]);
  }

  const result = new Map<string, Rect>();

  if (node.axis === "v") {
    const available = bounds.width - gutter;
    const leftW = available * node.ratio;
    const rightW = available * (1 - node.ratio);

    mergeRects(
      result,
      resolveRects(
        node.a,
        { x: bounds.x, y: bounds.y, width: leftW, height: bounds.height },
        gutter,
      ),
    );
    mergeRects(
      result,
      resolveRects(
        node.b,
        {
          x: bounds.x + leftW + gutter,
          y: bounds.y,
          width: rightW,
          height: bounds.height,
        },
        gutter,
      ),
    );
  } else {
    const available = bounds.height - gutter;
    const topH = available * node.ratio;
    const bottomH = available * (1 - node.ratio);

    mergeRects(
      result,
      resolveRects(
        node.a,
        { x: bounds.x, y: bounds.y, width: bounds.width, height: topH },
        gutter,
      ),
    );
    mergeRects(
      result,
      resolveRects(
        node.b,
        {
          x: bounds.x,
          y: bounds.y + topH + gutter,
          width: bounds.width,
          height: bottomH,
        },
        gutter,
      ),
    );
  }

  return result;
}

export function resolveAllRects(
  tree: SplitNode,
  gutter: number,
): Map<string, Rect> {
  const inset = gutter / 2;
  return resolveRects(
    tree,
    { x: inset, y: inset, width: 1 - gutter, height: 1 - gutter },
    gutter,
  );
}

function mergeRects(target: Map<string, Rect>, source: Map<string, Rect>) {
  for (const [key, value] of source) {
    target.set(key, value);
  }
}

export function collectGutterHandles(
  node: SplitNode,
  bounds: Rect,
  gutter: number,
  path: ("a" | "b")[] = [],
): GutterHandle[] {
  if (node.type === "leaf") return [];

  const handles: GutterHandle[] = [];

  if (node.axis === "v") {
    const available = bounds.width - gutter;
    const leftW = available * node.ratio;
    const gutterX = bounds.x + leftW;
    const hitWidth = Math.max(gutter * 2, 0.02);

    handles.push({
      path,
      axis: "v",
      x: gutterX + gutter / 2 - hitWidth / 2,
      y: bounds.y,
      width: hitWidth,
      height: bounds.height,
    });

    handles.push(
      ...collectGutterHandles(
        node.a,
        { x: bounds.x, y: bounds.y, width: leftW, height: bounds.height },
        gutter,
        [...path, "a"],
      ),
      ...collectGutterHandles(
        node.b,
        {
          x: bounds.x + leftW + gutter,
          y: bounds.y,
          width: available * (1 - node.ratio),
          height: bounds.height,
        },
        gutter,
        [...path, "b"],
      ),
    );
  } else {
    const available = bounds.height - gutter;
    const topH = available * node.ratio;
    const gutterY = bounds.y + topH;
    const hitHeight = Math.max(gutter * 2, 0.02);

    handles.push({
      path,
      axis: "h",
      x: bounds.x,
      y: gutterY + gutter / 2 - hitHeight / 2,
      width: bounds.width,
      height: hitHeight,
    });

    handles.push(
      ...collectGutterHandles(
        node.a,
        { x: bounds.x, y: bounds.y, width: bounds.width, height: topH },
        gutter,
        [...path, "a"],
      ),
      ...collectGutterHandles(
        node.b,
        {
          x: bounds.x,
          y: bounds.y + topH + gutter,
          width: bounds.width,
          height: available * (1 - node.ratio),
        },
        gutter,
        [...path, "b"],
      ),
    );
  }

  return handles;
}

export function getAllGutterHandles(
  tree: SplitNode,
  gutter: number,
): GutterHandle[] {
  const inset = gutter / 2;
  return collectGutterHandles(
    tree,
    { x: inset, y: inset, width: 1 - gutter, height: 1 - gutter },
    gutter,
  );
}

export function updateSplitRatio(
  node: SplitNode,
  path: ("a" | "b")[],
  ratio: number,
): SplitNode {
  if (path.length === 0) {
    if (node.type !== "split") {
      throw new Error("Expected split node");
    }
    return { ...node, ratio: clampRatio(ratio) };
  }

  if (node.type === "leaf") {
    throw new Error("Path leads to leaf node");
  }

  const [head, ...rest] = path;
  return {
    ...node,
    [head]: updateSplitRatio(node[head], rest, ratio),
  };
}

export function clampRatio(ratio: number): number {
  return Math.min(0.85, Math.max(0.15, ratio));
}

export function snapRatio(ratio: number, threshold = 0.02): number {
  if (Math.abs(ratio - 0.5) < threshold) return 0.5;
  return Math.round(ratio * 100) / 100;
}

export function countLeaves(node: SplitNode): number {
  if (node.type === "leaf") return 1;
  return countLeaves(node.a) + countLeaves(node.b);
}

export function getSplitAtPath(
  node: SplitNode,
  path: ("a" | "b")[],
): SplitNode | null {
  if (path.length === 0) {
    return node.type === "split" ? node : null;
  }
  if (node.type === "leaf") return null;
  const [head, ...rest] = path;
  return getSplitAtPath(node[head], rest);
}

export function getSplitBounds(
  tree: SplitNode,
  path: ("a" | "b")[],
  gutter: number,
): Rect | null {
  const inset = gutter / 2;
  return walkBounds(tree, { x: inset, y: inset, width: 1 - gutter, height: 1 - gutter }, gutter, path);
}

function walkBounds(
  node: SplitNode,
  bounds: Rect,
  gutter: number,
  path: ("a" | "b")[],
): Rect | null {
  if (path.length === 0) {
    return node.type === "split" ? bounds : null;
  }

  if (node.type === "leaf") return null;

  const [head, ...rest] = path;

  if (node.axis === "v") {
    const available = bounds.width - gutter;
    const leftW = available * node.ratio;
    if (head === "a") {
      return walkBounds(
        node.a,
        { x: bounds.x, y: bounds.y, width: leftW, height: bounds.height },
        gutter,
        rest,
      );
    }
    return walkBounds(
      node.b,
      {
        x: bounds.x + leftW + gutter,
        y: bounds.y,
        width: available * (1 - node.ratio),
        height: bounds.height,
      },
      gutter,
      rest,
    );
  }

  const available = bounds.height - gutter;
  const topH = available * node.ratio;
  if (head === "a") {
    return walkBounds(
      node.a,
      { x: bounds.x, y: bounds.y, width: bounds.width, height: topH },
      gutter,
      rest,
    );
  }
  return walkBounds(
    node.b,
    {
      x: bounds.x,
      y: bounds.y + topH + gutter,
      width: bounds.width,
      height: available * (1 - node.ratio),
    },
    gutter,
    rest,
  );
}

export function computeRatioFromPointer(
  split: Extract<SplitNode, { type: "split" }>,
  bounds: Rect,
  gutter: number,
  normX: number,
  normY: number,
): number {
  if (split.axis === "v") {
    const available = bounds.width - gutter;
    const localX = normX - bounds.x;
    return clampRatio(localX / available);
  }
  const available = bounds.height - gutter;
  const localY = normY - bounds.y;
  return clampRatio(localY / available);
}
