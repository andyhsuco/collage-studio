import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { FULL_CROP, fitSize, rotatedSize } from "../../lib/geometry/imageEdit";
import type { ImageAsset, ImageEdit, Rect } from "../../types";
import { EditedImage } from "./EditedImage";

const MIN_CROP_PX = 32;
const STAGE_INSET = 24;

type Side = -1 | 0 | 1;

interface Handle {
  hx: Side;
  hy: Side;
  cursor: string;
}

const HANDLES: Handle[] = [
  { hx: -1, hy: -1, cursor: "nwse-resize" },
  { hx: 1, hy: -1, cursor: "nesw-resize" },
  { hx: -1, hy: 1, cursor: "nesw-resize" },
  { hx: 1, hy: 1, cursor: "nwse-resize" },
  { hx: 0, hy: -1, cursor: "ns-resize" },
  { hx: 0, hy: 1, cursor: "ns-resize" },
  { hx: -1, hy: 0, cursor: "ew-resize" },
  { hx: 1, hy: 0, cursor: "ew-resize" },
];

interface DragState {
  handle: Handle | null;
  start: Rect;
  startX: number;
  startY: number;
  box: DOMRect;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

interface SlideCropEditorProps {
  image: ImageAsset;
  edit: ImageEdit;
  /** Locked pixel aspect (width / height), or null for freeform. */
  aspect: number | null;
  area: { width: number; height: number };
  onChange: (crop: Rect) => void;
}

export function SlideCropEditor({
  image,
  edit,
  aspect,
  area,
  onChange,
}: SlideCropEditorProps) {
  const dragRef = useRef<DragState | null>(null);

  const rotated = rotatedSize(image, edit.rotation);
  const box = fitSize(
    rotated.width,
    rotated.height,
    Math.max(0, area.width - STAGE_INSET * 2),
    Math.max(0, area.height - STAGE_INSET * 2),
  );
  // Normalized crop height per unit of normalized width at the locked aspect.
  const aspectK = aspect ? rotated.width / rotated.height / aspect : null;
  const { crop } = edit;

  const cropFor = (drag: DragState, clientX: number, clientY: number): Rect => {
    const px = (clientX - drag.box.left) / drag.box.width;
    const py = (clientY - drag.box.top) / drag.box.height;
    const { start, handle } = drag;

    if (!handle) {
      const dx = px - (drag.startX - drag.box.left) / drag.box.width;
      const dy = py - (drag.startY - drag.box.top) / drag.box.height;
      return {
        ...start,
        x: clamp(start.x + dx, 0, 1 - start.width),
        y: clamp(start.y + dy, 0, 1 - start.height),
      };
    }

    const minW = MIN_CROP_PX / drag.box.width;
    const minH = MIN_CROP_PX / drag.box.height;
    const { hx, hy } = handle;
    const ax = hx > 0 ? start.x : start.x + start.width;
    const ay = hy > 0 ? start.y : start.y + start.height;
    const availW = hx > 0 ? 1 - ax : ax;
    const availH = hy > 0 ? 1 - ay : ay;

    if (aspectK && hx !== 0 && hy !== 0) {
      const maxW = Math.min(availW, availH / aspectK);
      const minLocked = Math.min(Math.max(minW, minH / aspectK), maxW);
      const width = clamp(
        Math.max(hx * (px - ax), (hy * (py - ay)) / aspectK),
        minLocked,
        maxW,
      );
      const height = width * aspectK;
      return {
        x: hx > 0 ? ax : ax - width,
        y: hy > 0 ? ay : ay - height,
        width,
        height,
      };
    }

    const next = { ...start };
    if (hx !== 0) {
      next.width = clamp(hx * (px - ax), Math.min(minW, availW), availW);
      next.x = hx > 0 ? ax : ax - next.width;
    }
    if (hy !== 0) {
      next.height = clamp(hy * (py - ay), Math.min(minH, availH), availH);
      next.y = hy > 0 ? ay : ay - next.height;
    }
    return next;
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = (event.target as Element).closest<HTMLElement>(
      "[data-crop-drag]",
    );
    if (event.button !== 0 || !target) return;
    event.preventDefault();
    const { hx, hy } = target.dataset;
    const handle =
      HANDLES.find((h) => `${h.hx}` === hx && `${h.hy}` === hy) ?? null;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      handle,
      start: crop,
      startX: event.clientX,
      startY: event.clientY,
      box: event.currentTarget.getBoundingClientRect(),
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    onChange(cropFor(drag, event.clientX, event.clientY));
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const handles = aspectK ? HANDLES.filter((h) => h.hx && h.hy) : HANDLES;
  const cropStyle = {
    left: `${crop.x * 100}%`,
    top: `${crop.y * 100}%`,
    width: `${crop.width * 100}%`,
    height: `${crop.height * 100}%`,
  };

  return (
    <div
      className="relative touch-none select-none"
      style={{ width: box.width, height: box.height }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <EditedImage
        image={image}
        edit={{ rotation: edit.rotation, crop: FULL_CROP }}
        width={box.width}
        height={box.height}
      />

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]"
          style={cropStyle}
        />
      </div>

      <div
        className="absolute cursor-move outline outline-1 outline-white/90"
        style={cropStyle}
        data-crop-drag
      >
        <div className="pointer-events-none absolute inset-0">
          {[1, 2].map((i) => (
            <div key={`v${i}`}>
              <div
                className="absolute inset-y-0 w-px bg-white/30"
                style={{ left: `${(i * 100) / 3}%` }}
              />
              <div
                className="absolute inset-x-0 h-px bg-white/30"
                style={{ top: `${(i * 100) / 3}%` }}
              />
            </div>
          ))}
        </div>

        {handles.map((handle) => {
          const corner = handle.hx !== 0 && handle.hy !== 0;
          return (
            <div
              key={`${handle.hx},${handle.hy}`}
              className="absolute flex items-center justify-center"
              style={{
                left: `${(handle.hx + 1) * 50}%`,
                top: `${(handle.hy + 1) * 50}%`,
                width: 24,
                height: 24,
                transform: "translate(-50%, -50%)",
                cursor: handle.cursor,
              }}
              data-crop-drag
              data-hx={handle.hx}
              data-hy={handle.hy}
            >
              <div
                className="rounded-[1px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
                style={
                  corner
                    ? { width: 10, height: 10 }
                    : handle.hx === 0
                      ? { width: 16, height: 4 }
                      : { width: 4, height: 16 }
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
