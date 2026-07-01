export type CanvasRatio = "1:1" | "4:5" | "16:9" | "9:16" | "custom";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageAsset {
  id: string;
  src: string;
  naturalWidth: number;
  naturalHeight: number;
}

export interface Frame {
  id: string;
  imageId: string;
  cropX: number;
  cropY: number;
  zoom: number;
}

export type SplitNode =
  | { type: "leaf"; frameId: string }
  | {
      type: "split";
      axis: "h" | "v";
      ratio: number;
      a: SplitNode;
      b: SplitNode;
    };

export interface CollageDocument {
  images: Record<string, ImageAsset>;
  frames: Record<string, Frame>;
  frameOrder: string[];
  layoutTree: SplitNode | null;
  gutter: number;
  borderRadius: number;
  backgroundColor: string;
  canvasRatio: CanvasRatio;
  customWidth: number;
  customHeight: number;
  /** Manual grid row count; null uses automatic layout. */
  gridRows: number | null;
  /** Explicit grid row grouping; null derives rows from frame order. */
  gridRowGroups: string[][] | null;
}

export interface LayoutOption {
  id: string;
  name: string;
  tree: SplitNode;
  score: number;
}

export interface GutterHandle {
  path: ("a" | "b")[];
  axis: "h" | "v";
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MIN_PHOTOS = 2;
export const MAX_PHOTOS = 20;

export const RATIO_VALUES: Record<Exclude<CanvasRatio, "custom">, number> = {
  "1:1": 1,
  "4:5": 4 / 5,
  "16:9": 16 / 9,
  "9:16": 9 / 16,
};

export function getCanvasAspect(doc: CollageDocument): number {
  if (doc.canvasRatio === "custom") {
    return doc.customWidth / doc.customHeight;
  }
  return RATIO_VALUES[doc.canvasRatio];
}

export function createDefaultDocument(): CollageDocument {
  return {
    images: {},
    frames: {},
    frameOrder: [],
    layoutTree: null,
    gutter: 0.012,
    borderRadius: 4,
    backgroundColor: "#ffffff",
    canvasRatio: "1:1",
    customWidth: 1080,
    customHeight: 1080,
    gridRows: null,
    gridRowGroups: null,
  };
}
