import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

const DRAG_THRESHOLD = 4;
const EDGE_ZONE = 32;
const EDGE_MAX_SPEED = 12;

interface Point {
  x: number;
  y: number;
}

export interface SortableDrag {
  fromIndex: number;
  toIndex: number;
  /** Center of the dragged item in viewport coordinates. */
  ghostX: number;
  ghostY: number;
  width: number;
  height: number;
}

interface ActiveDrag extends SortableDrag {
  /** Item centers in container-content coordinates, measured at drag start. */
  slots: Point[];
  offsetX: number;
  offsetY: number;
}

/** Where `index` ends up after moving the item at `from` to `to`. */
export function movedIndex(index: number, from: number, to: number) {
  if (index === from) return to;
  if (from < index && index <= to) return index - 1;
  if (to <= index && index < from) return index + 1;
  return index;
}

function edgeSpeed(pos: number, start: number, end: number) {
  if (pos < start + EDGE_ZONE) {
    return -EDGE_MAX_SPEED * Math.min(1, (start + EDGE_ZONE - pos) / EDGE_ZONE);
  }
  if (pos > end - EDGE_ZONE) {
    return EDGE_MAX_SPEED * Math.min(1, (pos - (end - EDGE_ZONE)) / EDGE_ZONE);
  }
  return 0;
}

/**
 * Pointer-based drag-to-reorder for a list of equally sized items.
 * Spread `getItemProps(index)` on each item and attach `containerRef` to the
 * element that contains (and scrolls) them.
 */
export function useSortableDrag<T extends HTMLElement>(
  onReorder: (fromIndex: number, toIndex: number) => void,
) {
  const containerRef = useRef<T>(null);
  const onReorderRef = useRef(onReorder);
  const suppressClickRef = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);
  const [drag, setDrag] = useState<ActiveDrag | null>(null);

  useEffect(() => {
    onReorderRef.current = onReorder;
  });

  useEffect(() => () => cleanupRef.current?.(), []);

  const handlePointerDown = (
    event: ReactPointerEvent<HTMLElement>,
    index: number,
  ) => {
    if (event.button !== 0) return;
    const interactive = (event.target as Element).closest("button, a, input");
    if (interactive && interactive !== event.currentTarget) return;

    const container = containerRef.current;
    if (!container) return;

    const item = event.currentTarget;
    const { pointerId, clientX: startX, clientY: startY } = event;
    let active: ActiveDrag | null = null;
    let lastX = startX;
    let lastY = startY;
    let frame = 0;

    const toContent = (x: number, y: number): Point => {
      const rect = container.getBoundingClientRect();
      return {
        x: x - rect.left + container.scrollLeft,
        y: y - rect.top + container.scrollTop,
      };
    };

    const nearestSlot = (slots: Point[], point: Point) => {
      let best = 0;
      let bestDistance = Infinity;
      slots.forEach((slot, i) => {
        const distance = (slot.x - point.x) ** 2 + (slot.y - point.y) ** 2;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = i;
        }
      });
      return best;
    };

    const update = () => {
      if (!active) return;
      const ghostX = lastX - active.offsetX;
      const ghostY = lastY - active.offsetY;
      active = {
        ...active,
        ghostX,
        ghostY,
        toIndex: nearestSlot(active.slots, toContent(ghostX, ghostY)),
      };
      setDrag(active);
    };

    const autoScroll = () => {
      const rect = container.getBoundingClientRect();
      const dx =
        container.scrollWidth > container.clientWidth
          ? edgeSpeed(lastX, rect.left, rect.right)
          : 0;
      const dy =
        container.scrollHeight > container.clientHeight
          ? edgeSpeed(lastY, rect.top, rect.bottom)
          : 0;
      if (dx || dy) {
        container.scrollBy(dx, dy);
        update();
      }
      frame = requestAnimationFrame(autoScroll);
    };

    const start = () => {
      const slots: Point[] = [];
      container
        .querySelectorAll<HTMLElement>("[data-sortable-index]")
        .forEach((el) => {
          const rect = el.getBoundingClientRect();
          slots[Number(el.dataset.sortableIndex)] = toContent(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2,
          );
        });
      const rect = item.getBoundingClientRect();
      active = {
        fromIndex: index,
        toIndex: index,
        ghostX: 0,
        ghostY: 0,
        width: rect.width,
        height: rect.height,
        slots,
        offsetX: startX - (rect.left + rect.width / 2),
        offsetY: startY - (rect.top + rect.height / 2),
      };
      document.body.style.userSelect = "none";
      document.body.style.cursor = "grabbing";
      frame = requestAnimationFrame(autoScroll);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      lastX = e.clientX;
      lastY = e.clientY;
      if (!active) {
        if (Math.hypot(lastX - startX, lastY - startY) < DRAG_THRESHOLD) return;
        start();
      }
      update();
    };

    const finish = (commit: boolean) => {
      cleanupRef.current?.();
      if (!active) return;
      // The click that follows pointerup would otherwise select the item.
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
      if (commit && active.toIndex !== active.fromIndex) {
        onReorderRef.current(active.fromIndex, active.toIndex);
      }
      active = null;
    };

    const onUp = (e: PointerEvent) => {
      if (e.pointerId === pointerId) finish(true);
    };
    const onCancel = (e: PointerEvent) => {
      if (e.pointerId === pointerId) finish(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish(false);
    };

    cleanupRef.current?.();
    cleanupRef.current = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
      cancelAnimationFrame(frame);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      cleanupRef.current = null;
      setDrag(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
  };

  const handleClickCapture = (event: ReactMouseEvent) => {
    if (!suppressClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClickRef.current = false;
  };

  const getItemProps = (index: number) => {
    let style: CSSProperties | undefined;
    if (drag) {
      const from = drag.slots[index];
      const to = drag.slots[movedIndex(index, drag.fromIndex, drag.toIndex)];
      style = {
        transform:
          from && to
            ? `translate(${to.x - from.x}px, ${to.y - from.y}px)`
            : undefined,
        transition: "transform 160ms cubic-bezier(0.2, 0, 0, 1)",
      };
    }
    return {
      "data-sortable-index": index,
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) =>
        handlePointerDown(event, index),
      onClickCapture: handleClickCapture,
      style,
    };
  };

  const publicDrag: SortableDrag | null = drag && {
    fromIndex: drag.fromIndex,
    toIndex: drag.toIndex,
    ghostX: drag.ghostX,
    ghostY: drag.ghostY,
    width: drag.width,
    height: drag.height,
  };

  return { containerRef, drag: publicDrag, getItemProps };
}
