import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { current } from "immer";
import { nanoid } from "nanoid";
import type {
  CanvasRatio,
  CollageDocument,
  LayoutOption,
} from "../types";
import {
  createDefaultDocument,
  MAX_PHOTOS,
  MIN_PHOTOS,
} from "../types";
import { generateLayoutOptions } from "../lib/layout/autoLayout";
import { applyLayoutForImages, canvasAspect } from "../lib/layout/applyLayout";
import { buildFilledGridTree } from "../lib/layout/templates";
import {
  flattenRowGroups,
  getGridRowGroups,
  moveFrameToRowAtGutter,
  type RowDropTarget,
} from "../lib/layout/gridRows";
import { resolveAllRects } from "../lib/layout/splitTree";
import { isImageFile } from "../lib/upload/extractImages";
import { updateSplitRatio, snapRatio } from "../lib/layout/splitTree";
import { copyCollagePngToClipboard, exportCollagePng } from "../lib/export/png";
import { computeSmartOrganizePlan } from "../lib/layout/smartOrganize";

const HISTORY_LIMIT = 50;

export type ViewMode = "collage" | "slides";

interface CollageState {
  document: CollageDocument;
  viewMode: ViewMode;
  selectedFrameId: string | null;
  cropFrameId: string | null;
  selectedPresetId: string | null;
  layoutOptions: LayoutOption[];
  past: CollageDocument[];
  future: CollageDocument[];

  addImages: (files: File[]) => Promise<void>;
  removeImage: (imageId: string) => void;
  swapFrameImages: (frameIdA: string, frameIdB: string) => void;
  moveFrameToRow: (frameId: string, target: RowDropTarget) => boolean;
  selectFrame: (frameId: string | null) => void;
  enterCropMode: (frameId: string) => void;
  exitCropMode: () => void;
  updateCrop: (
    frameId: string,
    cropX: number,
    cropY: number,
    zoom: number,
  ) => void;
  applyPreset: (option: LayoutOption) => void;
  updateSplit: (path: ("a" | "b")[], ratio: number) => void;
  prepareHistory: () => void;
  setGutter: (value: number) => void;
  setCanvasPadding: (value: number) => void;
  setBorderRadius: (value: number) => void;
  setBackgroundColor: (value: string) => void;
  setCanvasRatio: (ratio: CanvasRatio) => void;
  setCustomDimensions: (width: number, height: number) => void;
  setGridRows: (rows: number | null) => void;
  smartOrganize: () => void;
  refreshLayoutOptions: () => void;
  undo: () => void;
  redo: () => void;
  setViewMode: (mode: ViewMode) => void;
  exportPng: () => Promise<void>;
  copyPng: () => Promise<boolean>;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

function cloneDocument(doc: CollageDocument): CollageDocument {
  return structuredClone(current(doc));
}

function pushHistory(state: CollageState) {
  state.past.push(cloneDocument(state.document));
  if (state.past.length > HISTORY_LIMIT) {
    state.past.shift();
  }
  state.future = [];
}

function applyGridLayout(state: CollageState) {
  const { document: doc } = state;
  if (doc.frameOrder.length < MIN_PHOTOS) return;

  const aspect = canvasAspect(doc);
  const tree = buildFilledGridTree(
    doc.frameOrder,
    aspect,
    doc.gridRows,
    doc.gridRowGroups,
  );
  doc.layoutTree = tree;

  const gridOption = state.layoutOptions.find((o) => o.name === "Grid");
  if (gridOption) {
    state.selectedPresetId = gridOption.id;
    state.layoutOptions = state.layoutOptions.map((o) =>
      o.name === "Grid" ? { ...o, tree } : o,
    );
  }
}

function clearManualGridLayout(doc: CollageDocument) {
  doc.gridRowGroups = null;
}

function clampGridRows(doc: CollageDocument) {
  const count = doc.frameOrder.length;
  if (doc.gridRows != null && doc.gridRows > count) {
    doc.gridRows = count;
  }
}

function rebuildFramesForImages(
  doc: CollageDocument,
  imageIds: string[],
): void {
  const newFrames: CollageDocument["frames"] = {};
  const newOrder: string[] = [];

  imageIds.forEach((imageId) => {
    const existing = Object.values(doc.frames).find((f) => f.imageId === imageId);
    const frameId = existing?.id ?? nanoid();
    newFrames[frameId] = existing ?? {
      id: frameId,
      imageId,
      cropX: 0.5,
      cropY: 0.5,
      zoom: 1,
    };
    newOrder.push(frameId);
  });

  doc.frames = newFrames;
  doc.frameOrder = newOrder;
}

export const useCollageStore = create<CollageState>()(
  immer((set, get) => ({
    document: createDefaultDocument(),
    viewMode: "collage",
    selectedFrameId: null,
    cropFrameId: null,
    selectedPresetId: null,
    layoutOptions: [],
    past: [],
    future: [],

    addImages: async (files: File[]) => {
      const imageFiles = files.filter(isImageFile);
      if (imageFiles.length === 0) return;

      set((state) => {
        const currentCount = Object.keys(state.document.images).length;
        const remaining = MAX_PHOTOS - currentCount;
        const toAdd = imageFiles.slice(0, remaining);

        if (toAdd.length === 0) return;

        pushHistory(state);

        const newImageIds: string[] = [];

        for (const file of toAdd) {
          const id = nanoid();
          const src = URL.createObjectURL(file);

          state.document.images[id] = {
            id,
            src,
            name: file.name || `photo-${id}.png`,
            naturalWidth: 0,
            naturalHeight: 0,
          };
          newImageIds.push(id);
        }

        const allImageIds = [
          ...Object.keys(state.document.images).filter(
            (id) => !newImageIds.includes(id),
          ),
          ...newImageIds,
        ];

        rebuildFramesForImages(state.document, allImageIds);
        clampGridRows(state.document);

        const previousPresetId = state.selectedPresetId;
        const previousPresetName =
          state.layoutOptions.find((o) => o.id === previousPresetId)?.name ??
          null;
        const hadPhotos = currentCount >= MIN_PHOTOS;

        const layout = applyLayoutForImages(state.document, {
          rebalance: hadPhotos,
          previousPresetId: hadPhotos ? null : previousPresetId,
          previousPresetName: hadPhotos ? null : previousPresetName,
        });
        if (hadPhotos) clearManualGridLayout(state.document);
        state.document.layoutTree = layout.layoutTree;
        state.layoutOptions = layout.layoutOptions;
        state.selectedPresetId = layout.selectedPresetId;
      });

      const doc = get().document;
      await Promise.all(
        Object.values(doc.images).map(
          (asset) =>
            new Promise<void>((resolve) => {
              if (asset.naturalWidth > 0) {
                resolve();
                return;
              }
              const img = new Image();
              img.onload = () => {
                set((state) => {
                  const a = state.document.images[asset.id];
                  if (a) {
                    a.naturalWidth = img.naturalWidth;
                    a.naturalHeight = img.naturalHeight;
                  }
                });
                resolve();
              };
              img.onerror = () => resolve();
              img.src = asset.src;
            }),
        ),
      );
    },

    removeImage: (imageId: string) => {
      set((state) => {
        pushHistory(state);
        const asset = state.document.images[imageId];
        if (asset) URL.revokeObjectURL(asset.src);
        delete state.document.images[imageId];

        const remainingIds = Object.keys(state.document.images);
        rebuildFramesForImages(state.document, remainingIds);
        clampGridRows(state.document);
        clearManualGridLayout(state.document);

        const layout = applyLayoutForImages(state.document);
        state.document.layoutTree = layout.layoutTree;
        state.layoutOptions = layout.layoutOptions;
        state.selectedPresetId = layout.selectedPresetId;

        if (state.selectedFrameId) {
          const frame = state.document.frames[state.selectedFrameId];
          if (!frame) state.selectedFrameId = null;
        }
        if (state.cropFrameId) {
          const frame = state.document.frames[state.cropFrameId];
          if (!frame) state.cropFrameId = null;
        }
      });
    },

    swapFrameImages: (frameIdA, frameIdB) => {
      if (frameIdA === frameIdB) return;
      set((state) => {
        const a = state.document.frames[frameIdA];
        const b = state.document.frames[frameIdB];
        if (!a || !b) return;

        pushHistory(state);

        const temp = {
          imageId: a.imageId,
          cropX: a.cropX,
          cropY: a.cropY,
          zoom: a.zoom,
        };
        a.imageId = b.imageId;
        a.cropX = b.cropX;
        a.cropY = b.cropY;
        a.zoom = b.zoom;
        b.imageId = temp.imageId;
        b.cropX = temp.cropX;
        b.cropY = temp.cropY;
        b.zoom = temp.zoom;
      });
    },

    moveFrameToRow: (frameId, target) => {
      let moved = false;
      set((state) => {
        if (!state.document.layoutTree) return;

        const rects = resolveAllRects(
          state.document.layoutTree,
          state.document.gutter,
          state.document.canvasPadding,
        );
        const groups = getGridRowGroups(state.document);
        const nextGroups = moveFrameToRowAtGutter(
          groups,
          frameId,
          target,
          rects,
        );
        if (!nextGroups) return;

        pushHistory(state);

        state.document.gridRowGroups = nextGroups;
        state.document.gridRows = nextGroups.length;
        state.document.frameOrder = flattenRowGroups(nextGroups);
        applyGridLayout(state);
        moved = true;
      });
      return moved;
    },

    selectFrame: (frameId) => {
      set((state) => {
        state.selectedFrameId = frameId;
        if (frameId !== state.cropFrameId) {
          state.cropFrameId = null;
        }
      });
    },

    enterCropMode: (frameId) => {
      set((state) => {
        state.cropFrameId = frameId;
        state.selectedFrameId = frameId;
      });
    },

    exitCropMode: () => {
      set((state) => {
        state.cropFrameId = null;
      });
    },

    updateCrop: (frameId, cropX, cropY, zoom) => {
      set((state) => {
        const frame = state.document.frames[frameId];
        if (!frame) return;
        frame.cropX = cropX;
        frame.cropY = cropY;
        frame.zoom = zoom;
      });
    },

    applyPreset: (option) => {
      set((state) => {
        pushHistory(state);
        state.document.layoutTree = option.tree;
        state.selectedPresetId = option.id;
        if (option.name !== "Grid" && option.name !== "Gallery") {
          clearManualGridLayout(state.document);
        }
      });
    },

    updateSplit: (path, ratio) => {
      set((state) => {
        if (!state.document.layoutTree) return;
        const snapped = snapRatio(ratio);
        state.document.layoutTree = updateSplitRatio(
          state.document.layoutTree,
          path,
          snapped,
        );
      });
    },

    prepareHistory: () => {
      set((state) => {
        pushHistory(state);
      });
    },

    setGutter: (value) => {
      set((state) => {
        pushHistory(state);
        state.document.gutter = value;
      });
    },

    setCanvasPadding: (value) => {
      set((state) => {
        pushHistory(state);
        state.document.canvasPadding = Math.min(0.2, Math.max(0, value));
      });
    },

    setBorderRadius: (value) => {
      set((state) => {
        pushHistory(state);
        state.document.borderRadius = value;
      });
    },

    setBackgroundColor: (color) => {
      set((state) => {
        pushHistory(state);
        state.document.backgroundColor = color;
      });
    },

    setCanvasRatio: (ratio) => {
      set((state) => {
        pushHistory(state);
        state.document.canvasRatio = ratio;
        if (state.document.frameOrder.length >= MIN_PHOTOS) {
          state.layoutOptions = generateLayoutOptions(
            state.document.frameOrder,
            ratio,
            state.document.customWidth,
            state.document.customHeight,
          );
        }
      });
    },

    setCustomDimensions: (width, height) => {
      set((state) => {
        pushHistory(state);
        state.document.customWidth = width;
        state.document.customHeight = height;
        if (state.document.frameOrder.length >= MIN_PHOTOS) {
          state.layoutOptions = generateLayoutOptions(
            state.document.frameOrder,
            state.document.canvasRatio,
            width,
            height,
          );
        }
      });
    },

    setGridRows: (rows) => {
      set((state) => {
        const count = state.document.frameOrder.length;
        if (count < MIN_PHOTOS) return;

        pushHistory(state);

        if (rows == null) {
          state.document.gridRows = null;
        } else {
          state.document.gridRows = Math.max(1, Math.min(count, Math.round(rows)));
        }

        clearManualGridLayout(state.document);
        applyGridLayout(state);
      });
    },

    smartOrganize: () => {
      set((state) => {
        const doc = state.document;
        if (doc.frameOrder.length < MIN_PHOTOS) return;

        const plan = computeSmartOrganizePlan(doc);
        if (!plan) return;

        pushHistory(state);

        doc.gridRows = plan.rows;
        doc.gridRowGroups = plan.rowGroups.map((row) => [...row]);
        doc.frameOrder = flattenRowGroups(doc.gridRowGroups);

        for (const frameId of doc.frameOrder) {
          const frame = doc.frames[frameId];
          if (!frame) continue;
          frame.cropX = 0.5;
          frame.cropY = 0.5;
          frame.zoom = 1;
        }

        applyGridLayout(state);
      });
    },

    refreshLayoutOptions: () => {
      set((state) => {
        if (state.document.frameOrder.length < MIN_PHOTOS) return;
        state.layoutOptions = generateLayoutOptions(
          state.document.frameOrder,
          state.document.canvasRatio,
          state.document.customWidth,
          state.document.customHeight,
        );
      });
    },

    undo: () => {
      set((state) => {
        if (state.past.length === 0) return;
        state.future.push(cloneDocument(state.document));
        state.document = state.past.pop()!;
      });
    },

    redo: () => {
      set((state) => {
        if (state.future.length === 0) return;
        state.past.push(cloneDocument(state.document));
        state.document = state.future.pop()!;
      });
    },

    setViewMode: (mode) => {
      set((state) => {
        state.viewMode = mode;
      });
    },

    exportPng: async () => {
      await exportCollagePng(get().document);
    },

    copyPng: async () => {
      return copyCollagePngToClipboard(get().document);
    },

    canUndo: () => get().past.length > 0,
    canRedo: () => get().future.length > 0,
  })),
);
