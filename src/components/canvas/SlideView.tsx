import { useEffect, useMemo, useRef, useState } from "react";
import { dominantColor } from "../../lib/color/dominant";
import { loadImage } from "../../lib/export/png";
import { useCollageStore } from "../../store/collageStore";
import { Button } from "../ui/primitives";

export function SlideView() {
  const frameOrder = useCollageStore((s) => s.document.frameOrder);
  const frames = useCollageStore((s) => s.document.frames);
  const images = useCollageStore((s) => s.document.images);
  const [index, setIndex] = useState(0);
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
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setIndex((value) => Math.min(slides.length - 1, value + 1));
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setIndex((value) => Math.max(0, value - 1));
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slides.length]);

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

  const background = colors[current.image.id] ?? "#18181b";

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
            className="max-h-[80%] max-w-[80%] object-contain"
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

        <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
          {slides.map((slide, slideIndex) => {
            const selected = slideIndex === safeIndex;
            return (
              <button
                key={slide.frameId}
                type="button"
                onClick={() => setIndex(slideIndex)}
                aria-label={`Slide ${slideIndex + 1}`}
                aria-current={selected ? "true" : undefined}
                className={`flex h-12 w-[5.25rem] shrink-0 items-center justify-center overflow-hidden rounded-sm ${
                  selected
                    ? "ring-2 ring-zinc-100"
                    : "opacity-70 ring-1 ring-zinc-700 hover:opacity-100"
                }`}
                style={{
                  background: colors[slide.image.id] ?? "#27272a",
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
    </div>
  );
}
