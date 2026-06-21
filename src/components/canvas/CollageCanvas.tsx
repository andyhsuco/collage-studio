import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useCollageStore } from "../../store/collageStore";
import { getCanvasAspect, MIN_PHOTOS } from "../../types";
import {
  computeRatioFromPointer,
  getAllGutterHandles,
  getSplitAtPath,
  getSplitBounds,
  resolveAllRects,
} from "../../lib/layout/splitTree";
import {
  computeCoverDrawParams,
  panCrop,
  roundRectPath,
} from "../../lib/geometry/crop";
import { loadImage } from "../../lib/export/png";
import { FrameOverlays } from "./FrameOverlays";
import { SwapDragGhost, computeGhostSize } from "./SwapDragGhost";
import type { GutterHandle, Rect } from "../../types";

type DragState =
  | { kind: "gutter"; path: ("a" | "b")[]; startRatio: number }
  | { kind: "crop"; frameId: string; startX: number; startY: number; startCropX: number; startCropY: number }
  | { kind: "swap"; frameId: string; startX: number; startY: number; activated: boolean };

const SWAP_DRAG_THRESHOLD = 8;

function hitTestGutter(
  handles: GutterHandle[],
  nx: number,
  ny: number,
): GutterHandle | null {
  for (const h of handles) {
    if (
      nx >= h.x &&
      nx <= h.x + h.width &&
      ny >= h.y &&
      ny <= h.y + h.height
    ) {
      return h;
    }
  }
  return null;
}

function hitTestFrame(
  rects: Map<string, Rect>,
  nx: number,
  ny: number,
): string | null {
  for (const [id, rect] of rects) {
    if (
      nx >= rect.x &&
      nx <= rect.x + rect.width &&
      ny >= rect.y &&
      ny <= rect.y + rect.height
    ) {
      return id;
    }
  }
  return null;
}

export function CollageCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const liveRatioRef = useRef<number | null>(null);
  const cropCommitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wheelHistoryPending = useRef(false);
  const [canvasSize, setCanvasSize] = useState({ width: 600, height: 600 });
  const [cursor, setCursor] = useState<string>("default");
  const [imagesLoaded, setImagesLoaded] = useState(0);
  const [hoveredFrameId, setHoveredFrameId] = useState<string | null>(null);
  const [swapTargetFrameId, setSwapTargetFrameId] = useState<string | null>(null);
  const [swapSourceFrameId, setSwapSourceFrameId] = useState<string | null>(null);
  const [swapDragGhost, setSwapDragGhost] = useState<{
    imageSrc: string;
    x: number;
    y: number;
    width: number;
    height: number;
    cropX: number;
    cropY: number;
    zoom: number;
  } | null>(null);

  const document_ = useCollageStore((s) => s.document);
  const imageCount = Object.keys(document_.images).length;
  const needsMorePhotos = imageCount > 0 && imageCount < MIN_PHOTOS;
  const selectedFrameId = useCollageStore((s) => s.selectedFrameId);
  const cropFrameId = useCollageStore((s) => s.cropFrameId);
  const selectFrame = useCollageStore((s) => s.selectFrame);
  const enterCropMode = useCollageStore((s) => s.enterCropMode);
  const exitCropMode = useCollageStore((s) => s.exitCropMode);
  const updateSplit = useCollageStore((s) => s.updateSplit);
  const prepareHistory = useCollageStore((s) => s.prepareHistory);
  const updateCrop = useCollageStore((s) => s.updateCrop);
  const removeImage = useCollageStore((s) => s.removeImage);
  const swapFrameImages = useCollageStore((s) => s.swapFrameImages);

  const aspect = getCanvasAspect(document_);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      const maxW = width - 48;
      const maxH = height - 48;
      let w = maxW;
      let h = w / aspect;
      if (h > maxH) {
        h = maxH;
        w = h * aspect;
      }
      setCanvasSize({ width: Math.floor(w), height: Math.floor(h) });
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [aspect]);

  useEffect(() => {
    let cancelled = false;
    const imgs = Object.values(document_.images);
    Promise.all(imgs.map((img) => loadImage(img.src))).then(() => {
      if (!cancelled) setImagesLoaded((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [document_.images]);

  const draw = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !document_.layoutTree) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasSize.width * dpr;
    canvas.height = canvasSize.height * dpr;
    canvas.style.width = `${canvasSize.width}px`;
    canvas.style.height = `${canvasSize.height}px`;
    ctx.scale(dpr, dpr);

    const w = canvasSize.width;
    const h = canvasSize.height;

    ctx.fillStyle = document_.backgroundColor;
    ctx.fillRect(0, 0, w, h);

    const rects = resolveAllRects(document_.layoutTree, document_.gutter);
    const radius =
      document_.borderRadius * (w / 800);

    for (const frameId of document_.frameOrder) {
      const frame = document_.frames[frameId];
      const image = document_.images[frame?.imageId ?? ""];
      const rect = rects.get(frameId);
      if (!frame || !image || !rect) continue;

      const px = rect.x * w;
      const py = rect.y * h;
      const pw = rect.width * w;
      const ph = rect.height * h;

      try {
        const img = await loadImage(image.src);
        ctx.save();
        roundRectPath(ctx, px, py, pw, ph, radius);
        ctx.clip();

        const imgW = image.naturalWidth || img.naturalWidth;
        const imgH = image.naturalHeight || img.naturalHeight;

        const { drawX, drawY, drawW, drawH } = computeCoverDrawParams(
          imgW,
          imgH,
          pw,
          ph,
          frame.cropX,
          frame.cropY,
          frame.zoom,
        );

        ctx.drawImage(img, px + drawX, py + drawY, drawW, drawH);

        if (frameId === swapSourceFrameId) {
          ctx.fillStyle = "rgba(255,255,255,0.55)";
          roundRectPath(ctx, px, py, pw, ph, radius);
          ctx.fill();
        }

        ctx.restore();

        if (frameId === selectedFrameId) {
          ctx.strokeStyle =
            cropFrameId === frameId
              ? "rgba(255,255,255,0.9)"
              : "rgba(255,255,255,0.5)";
          ctx.lineWidth = 2;
          roundRectPath(ctx, px, py, pw, ph, radius);
          ctx.stroke();
        }
      } catch {
        ctx.fillStyle = "#27272a";
        ctx.fillRect(px, py, pw, ph);
      }
    }

    if (cropFrameId && !dragRef.current) {
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(0, 0, w, h);
      const rect = rects.get(cropFrameId);
      if (rect) {
        const px = rect.x * w;
        const py = rect.y * h;
        const pw = rect.width * w;
        const ph = rect.height * h;
        ctx.clearRect(px, py, pw, ph);
      }
    }

    const handles = getAllGutterHandles(
      document_.layoutTree,
      document_.gutter,
    );
    if (!cropFrameId) {
      for (const handle of handles) {
        const hx = handle.x * w;
        const hy = handle.y * h;
        const hw = handle.width * w;
        const hh = handle.height * h;
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fillRect(hx, hy, hw, hh);
      }
    }
  }, [
    document_,
    canvasSize,
    selectedFrameId,
    cropFrameId,
    imagesLoaded, // trigger redraw when images decode
    swapSourceFrameId,
  ]);

  useEffect(() => {
    void draw();
  }, [draw]);

  const toNormalized = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        x: (clientX - rect.left) / rect.width,
        y: (clientY - rect.top) / rect.height,
      };
    },
    [],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!document_.layoutTree) return;
      const { x, y } = toNormalized(e.clientX, e.clientY);

      if (cropFrameId) {
        const frame = document_.frames[cropFrameId];
        if (frame) {
          prepareHistory();
          dragRef.current = {
            kind: "crop",
            frameId: cropFrameId,
            startX: e.clientX,
            startY: e.clientY,
            startCropX: frame.cropX,
            startCropY: frame.cropY,
          };
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        }
        return;
      }

      const handles = getAllGutterHandles(
        document_.layoutTree,
        document_.gutter,
      );
      const gutter = hitTestGutter(handles, x, y);
      if (gutter) {
        const split = getSplitAtPath(document_.layoutTree, gutter.path);
        if (split?.type === "split") {
          prepareHistory();
          dragRef.current = {
            kind: "gutter",
            path: gutter.path,
            startRatio: split.ratio,
          };
          liveRatioRef.current = split.ratio;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          return;
        }
      }

      const rects = resolveAllRects(document_.layoutTree, document_.gutter);
      const frameId = hitTestFrame(rects, x, y);
      if (frameId) {
        selectFrame(frameId);
        dragRef.current = {
          kind: "swap",
          frameId,
          startX: e.clientX,
          startY: e.clientY,
          activated: false,
        };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      } else {
        selectFrame(null);
      }
    },
    [document_, cropFrameId, toNormalized, selectFrame, prepareHistory],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!document_.layoutTree) return;
      const { x, y } = toNormalized(e.clientX, e.clientY);

      if (dragRef.current?.kind === "gutter") {
        const bounds = getSplitBounds(
          document_.layoutTree,
          dragRef.current.path,
          document_.gutter,
        );
        const split = getSplitAtPath(
          document_.layoutTree,
          dragRef.current.path,
        );
        if (bounds && split?.type === "split") {
          const ratio = computeRatioFromPointer(
            split,
            bounds,
            document_.gutter,
            x,
            y,
          );
          liveRatioRef.current = ratio;
          updateSplit(dragRef.current.path, ratio);
        }
        return;
      }

      if (dragRef.current?.kind === "swap") {
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;

        if (!dragRef.current.activated && Math.hypot(dx, dy) >= SWAP_DRAG_THRESHOLD) {
          prepareHistory();
          dragRef.current.activated = true;
          setSwapSourceFrameId(dragRef.current.frameId);
          setCursor("grabbing");

          const frame = document_.frames[dragRef.current.frameId];
          const image = frame ? document_.images[frame.imageId] : null;
          const rects = resolveAllRects(document_.layoutTree, document_.gutter);
          const rect = rects.get(dragRef.current.frameId);
          if (image && rect) {
            const pw = rect.width * canvasSize.width;
            const ph = rect.height * canvasSize.height;
            const ghost = computeGhostSize(pw, ph);
            setSwapDragGhost({
              imageSrc: image.src,
              x: e.clientX,
              y: e.clientY,
              width: ghost.width,
              height: ghost.height,
              cropX: frame.cropX,
              cropY: frame.cropY,
              zoom: frame.zoom,
            });
          }
        }

        if (dragRef.current.activated) {
          setSwapDragGhost((prev) =>
            prev ? { ...prev, x: e.clientX, y: e.clientY } : prev,
          );
          const rects = resolveAllRects(document_.layoutTree, document_.gutter);
          const target = hitTestFrame(rects, x, y);
          setSwapTargetFrameId(
            target && target !== dragRef.current.frameId ? target : null,
          );
        }
        return;
      }

      if (dragRef.current?.kind === "crop") {
        const { frameId, startX, startY, startCropX, startCropY } =
          dragRef.current;
        const frame = document_.frames[frameId];
        const image = document_.images[frame?.imageId ?? ""];
        const rects = resolveAllRects(document_.layoutTree, document_.gutter);
        const rect = rects.get(frameId);
        if (!frame || !image || !rect) return;

        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const pw = rect.width * canvasSize.width;
        const ph = rect.height * canvasSize.height;
        const imgW = image.naturalWidth || 1;
        const imgH = image.naturalHeight || 1;

        const { cropX, cropY } = panCrop(
          startCropX,
          startCropY,
          dx,
          dy,
          imgW,
          imgH,
          pw,
          ph,
          frame.zoom,
        );
        updateCrop(frameId, cropX, cropY, frame.zoom);
        return;
      }

      if (cropFrameId) {
        setCursor("grab");
        setHoveredFrameId(null);
        return;
      }

      const handles = getAllGutterHandles(
        document_.layoutTree,
        document_.gutter,
      );
      const gutter = hitTestGutter(handles, x, y);
      if (gutter) {
        setCursor(gutter.axis === "v" ? "col-resize" : "row-resize");
        setHoveredFrameId(null);
        return;
      }

      const rects = resolveAllRects(document_.layoutTree, document_.gutter);
      const frameId = hitTestFrame(rects, x, y);
      setHoveredFrameId(frameId);
      setCursor(frameId ? "grab" : "default");
    },
    [
      document_,
      cropFrameId,
      toNormalized,
      updateSplit,
      updateCrop,
      canvasSize,
      prepareHistory,
    ],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (dragRef.current?.kind === "gutter") {
        liveRatioRef.current = null;
      }

      if (
        dragRef.current?.kind === "swap" &&
        dragRef.current.activated &&
        document_.layoutTree
      ) {
        const { x, y } = toNormalized(e.clientX, e.clientY);
        const rects = resolveAllRects(document_.layoutTree, document_.gutter);
        const target = hitTestFrame(rects, x, y);
        if (target && target !== dragRef.current.frameId) {
          swapFrameImages(dragRef.current.frameId, target);
        }
      }

      dragRef.current = null;
      setSwapSourceFrameId(null);
      setSwapTargetFrameId(null);
      setSwapDragGhost(null);
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    },
    [document_.layoutTree, document_.gutter, toNormalized, swapFrameImages],
  );

  const handlePointerLeave = useCallback((e: React.PointerEvent) => {
    if (dragRef.current?.kind === "swap" && dragRef.current.activated) {
      return;
    }
    setHoveredFrameId(null);
    setSwapDragGhost(null);
    if (dragRef.current) {
      dragRef.current = null;
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    }
  }, []);

  const onDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!document_.layoutTree) return;
      const { x, y } = toNormalized(e.clientX, e.clientY);
      const rects = resolveAllRects(document_.layoutTree, document_.gutter);
      const frameId = hitTestFrame(rects, x, y);
      if (frameId) {
        enterCropMode(frameId);
      }
    },
    [document_, toNormalized, enterCropMode],
  );

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!cropFrameId || !document_.layoutTree) return;
      e.preventDefault();
      const frame = document_.frames[cropFrameId];
      const image = document_.images[frame?.imageId ?? ""];
      const rects = resolveAllRects(document_.layoutTree, document_.gutter);
      const rect = rects.get(cropFrameId);
      if (!frame || !image || !rect) return;

      if (!wheelHistoryPending.current) {
        prepareHistory();
        wheelHistoryPending.current = true;
      }
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      const newZoom = Math.min(3, Math.max(1, frame.zoom + delta));
      updateCrop(cropFrameId, frame.cropX, frame.cropY, newZoom);

      if (cropCommitTimer.current) clearTimeout(cropCommitTimer.current);
      cropCommitTimer.current = setTimeout(() => {
        wheelHistoryPending.current = false;
        cropCommitTimer.current = null;
      }, 400);
    },
    [cropFrameId, document_, updateCrop, prepareHistory],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && cropFrameId) {
        exitCropMode();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          useCollageStore.getState().redo();
        } else {
          useCollageStore.getState().undo();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cropFrameId, exitCropMode]);

  if (!document_.layoutTree) {
    return (
      <div
        ref={containerRef}
        className="flex flex-1 items-center justify-center bg-[var(--bg-app)] p-6"
      >
        <div className="max-w-sm text-center">
          <p className="text-[15px] font-medium text-zinc-300">
            Upload photos to begin
          </p>
          <p className="mt-2 text-[13px] text-zinc-600">
            Drop photos anywhere, paste with ⌘V, or upload from the left panel.
            Layouts generate automatically with consistent gutters.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex flex-1 flex-col items-center justify-center overflow-hidden bg-[var(--bg-app)] p-6"
    >
      {needsMorePhotos && (
        <p className="mb-3 text-[12px] text-zinc-500">
          {imageCount} of {MIN_PHOTOS} photos — add one more to unlock collage layouts
        </p>
      )}
      <div
        className="relative"
        style={{ width: canvasSize.width, height: canvasSize.height }}
      >
        <canvas
          ref={canvasRef}
          className="block rounded-sm shadow-2xl shadow-black/40"
          style={{ cursor }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={handlePointerLeave}
          onDoubleClick={onDoubleClick}
          onWheel={onWheel}
        />
        <FrameOverlays
          frameOrder={document_.frameOrder}
          frames={document_.frames}
          layoutTree={document_.layoutTree}
          gutter={document_.gutter}
          canvasWidth={canvasSize.width}
          canvasHeight={canvasSize.height}
          hoveredFrameId={hoveredFrameId}
          swapSourceFrameId={swapSourceFrameId}
          swapTargetFrameId={swapTargetFrameId}
          onRemove={removeImage}
          hidden={!!cropFrameId}
        />
      </div>
      {swapDragGhost && (
        <SwapDragGhost
          imageSrc={swapDragGhost.imageSrc}
          width={swapDragGhost.width}
          height={swapDragGhost.height}
          x={swapDragGhost.x}
          y={swapDragGhost.y}
          borderRadius={document_.borderRadius}
          cropX={swapDragGhost.cropX}
          cropY={swapDragGhost.cropY}
          zoom={swapDragGhost.zoom}
        />
      )}
    </div>
  );
}
