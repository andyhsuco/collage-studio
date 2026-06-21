import { useMemo, useState } from "react";
import { resolveAllRects } from "../../lib/layout/splitTree";
import { ImageDeleteButton } from "../upload/ImageDeleteButton";

interface FrameOverlaysProps {
  frameOrder: string[];
  frames: Record<string, { imageId: string }>;
  layoutTree: NonNullable<import("../../types").SplitNode>;
  gutter: number;
  canvasWidth: number;
  canvasHeight: number;
  hoveredFrameId: string | null;
  swapSourceFrameId: string | null;
  swapTargetFrameId: string | null;
  onRemove: (imageId: string) => void;
  hidden?: boolean;
}

export function FrameOverlays({
  frameOrder,
  frames,
  layoutTree,
  gutter,
  canvasWidth,
  canvasHeight,
  hoveredFrameId,
  swapSourceFrameId,
  swapTargetFrameId,
  onRemove,
  hidden = false,
}: FrameOverlaysProps) {
  const [deleteHoverFrameId, setDeleteHoverFrameId] = useState<string | null>(
    null,
  );

  const rects = useMemo(
    () => resolveAllRects(layoutTree, gutter),
    [layoutTree, gutter],
  );

  if (hidden) return null;

  return (
    <>
      {frameOrder.map((frameId) => {
        const frame = frames[frameId];
        const rect = rects.get(frameId);
        if (!frame || !rect) return null;

        const px = rect.x * canvasWidth;
        const py = rect.y * canvasHeight;
        const pw = rect.width * canvasWidth;
        const ph = rect.height * canvasHeight;
        const isFrameHovered = hoveredFrameId === frameId && !swapSourceFrameId;
        const isDeleteHovered = deleteHoverFrameId === frameId;
        const showDelete = isFrameHovered || isDeleteHovered;
        const isSwapTarget = swapTargetFrameId === frameId;

        return (
          <div
            key={frameId}
            className="pointer-events-none absolute"
            style={{
              left: px,
              top: py,
              width: pw,
              height: ph,
            }}
          >
            {isSwapTarget && (
              <div className="absolute inset-0 rounded-sm ring-2 ring-white ring-offset-1 ring-offset-transparent" />
            )}
            <div
              className={`absolute inset-0 flex items-start justify-end p-1 transition-opacity ${
                showDelete ? "opacity-100" : "opacity-0"
              }`}
            >
              <div
                className="pointer-events-auto -m-1 p-2"
                onPointerEnter={() => setDeleteHoverFrameId(frameId)}
                onPointerLeave={() => setDeleteHoverFrameId(null)}
              >
                <ImageDeleteButton onDelete={() => onRemove(frame.imageId)} />
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
