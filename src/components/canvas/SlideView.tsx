import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { dominantColor } from "../../lib/color/dominant";
import { loadImage } from "../../lib/export/png";
import { movedIndex, useSortableDrag } from "../../hooks/useSortableDrag";
import { useCollageStore } from "../../store/collageStore";
import type { ImageAsset } from "../../types";
import { Button } from "../ui/primitives";

const FIRST_SLIDE_MS = 1500;
const SLIDE_MS = 1000;

/** Fits the image inside `scale` of the slide, upscaling small images too. */
function fitImageStyle(
  image: ImageAsset,
  slide: { width: number; height: number },
  scale: number,
): CSSProperties {
  if (!image.naturalWidth || !image.naturalHeight) {
    return { maxWidth: `${scale * 100}%`, maxHeight: `${scale * 100}%` };
  }
  const ratio = Math.min(
    (slide.width * scale) / image.naturalWidth,
    (slide.height * scale) / image.naturalHeight,
  );
  return {
    width: Math.round(image.naturalWidth * ratio),
    height: Math.round(image.naturalHeight * ratio),
  };
}

function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      <path
        d="M3 1.75v8.5a.5.5 0 0 0 .77.42l6.5-4.25a.5.5 0 0 0 0-.84l-6.5-4.25A.5.5 0 0 0 3 1.75Z"
        fill="currentColor"
      />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      <rect
        x="2.5"
        y="1.5"
        width="2.5"
        height="9"
        rx="0.5"
        fill="currentColor"
      />
      <rect x="7" y="1.5" width="2.5" height="9" rx="0.5" fill="currentColor" />
    </svg>
  );
}

export function SlideView() {
  const frameOrder = useCollageStore((s) => s.document.frameOrder);
  const frames = useCollageStore((s) => s.document.frames);
  const images = useCollageStore((s) => s.document.images);
  const settings = useCollageStore((s) => s.slideSettings);
  const reorderFrames = useCollageStore((s) => s.reorderFrames);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [colors, setColors] = useState<Record<string, string>>({});
  const stageRef = useRef<HTMLDivElement>(null);
  const [slideSize, setSlideSize] = useState({ width: 0, height: 0 });

  const slides = useMemo(
    () =>
      frameOrder.flatMap((frameId) => {
        const frame = frames[frameId];
        const image = frame ? images[frame.imageId] : undefined;
        if (!frame || !image) return [];
        return [{ frameId, image }];
      }),
    [frameOrder, frames, images],
  );

  const safeIndex = Math.min(index, Math.max(0, slides.length - 1));
  const current = slides[safeIndex];
  const canPlay = slides.length > 1;
  const isPlaying = playing && canPlay;

  const { containerRef: stripRef, drag, getItemProps } =
    useSortableDrag<HTMLDivElement>((fromIndex, toIndex) => {
      reorderFrames(fromIndex, toIndex);
      setIndex(movedIndex(safeIndex, fromIndex, toIndex));
    });
  const draggedSlide = drag ? slides[drag.fromIndex] : undefined;

  const togglePlay = () => {
    if (!isPlaying && safeIndex >= slides.length - 1) setIndex(0);
    setPlaying(!isPlaying);
  };

  useEffect(() => {
    if (!isPlaying) return;
    const delay = safeIndex === 0 ? FIRST_SLIDE_MS : SLIDE_MS;
    const id = window.setTimeout(
      () => setIndex((safeIndex + 1) % slides.length),
      delay,
    );
    return () => window.clearTimeout(id);
  }, [isPlaying, safeIndex, slides.length]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    const measure = () => {
      const style = getComputedStyle(el);
      const padX =
        parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const padY =
        parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      const width = Math.max(0, el.clientWidth - padX);
      const height = Math.max(0, el.clientHeight - padY);
      const aspect = 16 / 9;
      const slideWidth = Math.floor(Math.min(width, height * aspect));
      const slideHeight = Math.round((slideWidth * 9) / 16);
      setSlideSize({ width: slideWidth, height: slideHeight });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [slides.length]);

  useEffect(() => {
    let cancelled = false;

    void Promise.all(
      slides.map(async (slide) => {
        try {
          const img = await loadImage(slide.image.src);
          return [slide.image.id, dominantColor(img, slide.image.src)] as const;
        } catch {
          return [slide.image.id, "#18181b"] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setColors(Object.fromEntries(entries));
    });

    return () => {
      cancelled = true;
    };
  }, [slides]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      // Focused buttons already fire click on Space; toggling here too would double-toggle.
      if (event.key === " " && !(target instanceof HTMLButtonElement)) {
        event.preventDefault();
        togglePlay();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setIndex((value) => Math.min(slides.length - 1, value + 1));
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setIndex((value) => Math.max(0, value - 1));
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!current) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[var(--bg-app)] p-6">
        <div className="max-w-sm text-center">
          <p className="text-[15px] font-medium text-zinc-300">
            Upload photos to begin
          </p>
          <p className="mt-2 text-[13px] text-zinc-600">
            Slides puts one photo on each 16:9 frame, centered on that photo’s
            dominant color.
          </p>
        </div>
      </div>
    );
  }

  const backgroundFor = (imageId: string, fallback: string) =>
    settings.backgroundMode === "custom"
      ? settings.backgroundColor
      : (colors[imageId] ?? fallback);
  const background = backgroundFor(current.image.id, "#18181b");

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--bg-app)]">
      <div
        ref={stageRef}
        className="flex min-h-0 flex-1 items-center justify-center px-6 pt-6"
      >
        <div
          className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-md shadow-2xl shadow-black/40"
          style={{
            width: slideSize.width,
            height: slideSize.height,
            background,
          }}
        >
          <img
            src={current.image.src}
            alt=""
            draggable={false}
            className="object-contain"
            style={{
              ...fitImageStyle(current.image, slideSize, settings.imageScale),
              borderRadius: settings.cornerRadius,
            }}
          />
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-center gap-3 px-4 py-4">
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIndex((value) => Math.max(0, value - 1))}
            disabled={safeIndex === 0}
            aria-label="Previous slide"
          >
            ←
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="w-7 px-0"
            onClick={togglePlay}
            disabled={!canPlay}
            aria-label={isPlaying ? "Pause slideshow" : "Play slideshow"}
            title={isPlaying ? "Pause (Space)" : "Play (Space)"}
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </Button>
          <span className="min-w-16 text-center text-[12px] tabular-nums text-zinc-400">
            {safeIndex + 1} / {slides.length}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setIndex((value) => Math.min(slides.length - 1, value + 1))
            }
            disabled={safeIndex >= slides.length - 1}
            aria-label="Next slide"
          >
            →
          </Button>
        </div>

        <div
          ref={stripRef}
          className="flex max-w-full gap-2 overflow-x-auto pb-1"
        >
          {slides.map((slide, slideIndex) => {
            const selected = slideIndex === safeIndex;
            const sortable = getItemProps(slideIndex);
            return (
              <button
                key={slide.frameId}
                type="button"
                {...sortable}
                onClick={() => setIndex(slideIndex)}
                aria-label={`Slide ${slideIndex + 1}`}
                aria-current={selected ? "true" : undefined}
                className={`flex h-12 w-[5.25rem] shrink-0 cursor-grab items-center justify-center overflow-hidden rounded-sm ${
                  drag?.fromIndex === slideIndex
                    ? "opacity-30 ring-1 ring-zinc-700"
                    : selected
                      ? "ring-2 ring-zinc-100"
                      : "opacity-70 ring-1 ring-zinc-700 hover:opacity-100"
                }`}
                style={{
                  ...sortable.style,
                  background: backgroundFor(slide.image.id, "#27272a"),
                }}
              >
                <img
                  src={slide.image.src}
                  alt=""
                  draggable={false}
                  className="max-h-full max-w-full object-contain"
                />
              </button>
            );
          })}
        </div>
      </div>

      {drag && draggedSlide && (
        <div
          className="pointer-events-none fixed z-[100] flex items-center justify-center overflow-hidden rounded-sm shadow-2xl ring-2 ring-white/90"
          style={{
            left: drag.ghostX,
            top: drag.ghostY,
            width: drag.width,
            height: drag.height,
            transform: "translate(-50%, -50%)",
            background: backgroundFor(draggedSlide.image.id, "#27272a"),
          }}
        >
          <img
            src={draggedSlide.image.src}
            alt=""
            draggable={false}
            className="max-h-full max-w-full object-contain"
          />
        </div>
      )}
    </div>
  );
}
