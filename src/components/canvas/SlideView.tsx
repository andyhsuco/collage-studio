import { useEffect, useMemo, useRef, useState } from "react";
import { dominantColor } from "../../lib/color/dominant";
import { loadImage } from "../../lib/export/png";
import {
  aspectCrop,
  editedSize,
  fitSize,
  IDENTITY_EDIT,
  rotatedSize,
  rotateEdit,
} from "../../lib/geometry/imageEdit";
import { movedIndex, useSortableDrag } from "../../hooks/useSortableDrag";
import { useCollageStore } from "../../store/collageStore";
import type { ImageAsset, ImageEdit } from "../../types";
import { Button } from "../ui/primitives";
import { EditedImage } from "./EditedImage";
import { SlideCropEditor } from "./SlideCropEditor";

const FIRST_SLIDE_EXTRA_MS = 500;
const THUMB_WIDTH = 84;
const THUMB_HEIGHT = 48;

const CROP_ASPECTS: { label: string; value: number | null }[] = [
  { label: "Free", value: null },
  { label: "16:9", value: 16 / 9 },
  { label: "1:1", value: 1 },
  { label: "4:5", value: 4 / 5 },
];

interface CropDraft {
  imageId: string;
  edit: ImageEdit;
  aspect: number | null;
}

/** Fits the edited image inside the box, upscaling small images too. */
function SlideImage({
  image,
  edit,
  boxWidth,
  boxHeight,
  borderRadius,
  onDoubleClick,
}: {
  image: ImageAsset;
  edit: ImageEdit;
  boxWidth: number;
  boxHeight: number;
  borderRadius?: number;
  onDoubleClick?: () => void;
}) {
  if (!image.naturalWidth || !image.naturalHeight) {
    return (
      <img
        src={image.src}
        alt=""
        draggable={false}
        className="object-contain"
        style={{ maxWidth: boxWidth, maxHeight: boxHeight, borderRadius }}
      />
    );
  }
  const natural = editedSize(image, edit);
  const size = fitSize(natural.width, natural.height, boxWidth, boxHeight);
  return (
    <EditedImage
      image={image}
      edit={edit}
      width={size.width}
      height={size.height}
      borderRadius={borderRadius}
      onDoubleClick={onDoubleClick}
    />
  );
}

function ReplayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M2 6a4 4 0 1 0 1.2-2.85"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M2.5 1.25v2.25h2.25"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M5 4.4v3.2L7.6 6 5 4.4Z" fill="currentColor" />
    </svg>
  );
}

function CropIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M3.5 1v8.5a1 1 0 0 0 1 1H13M1 3.5h8.5a1 1 0 0 1 1 1V13"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RotateIcon({ direction }: { direction: 1 | -1 }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden
      style={direction === 1 ? { transform: "scaleX(-1)" } : undefined}
    >
      <path
        d="M2.5 6.5a4.5 4.5 0 1 1 1.3 3.7"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M2.5 3.5v3h3"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
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
  const slideEdits = useCollageStore((s) => s.document.slideEdits);
  const settings = useCollageStore((s) => s.slideSettings);
  const reorderFrames = useCollageStore((s) => s.reorderFrames);
  const setSlideEdit = useCollageStore((s) => s.setSlideEdit);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playRun, setPlayRun] = useState(0);
  const [colors, setColors] = useState<Record<string, string>>({});
  const [cropDraft, setCropDraft] = useState<CropDraft | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [slideSize, setSlideSize] = useState({ width: 0, height: 0 });

  const slides = useMemo(
    () =>
      frameOrder.flatMap((frameId) => {
        const frame = frames[frameId];
        const image = frame ? images[frame.imageId] : undefined;
        if (!frame || !image) return [];
        return [
          { frameId, image, edit: slideEdits[image.id] ?? IDENTITY_EDIT },
        ];
      }),
    [frameOrder, frames, images, slideEdits],
  );

  const safeIndex = Math.min(index, Math.max(0, slides.length - 1));
  const current = slides[safeIndex];
  const canPlay = slides.length > 1;
  const isPlaying = playing && canPlay;
  const draft =
    cropDraft && cropDraft.imageId === current?.image.id ? cropDraft : null;
  const canEdit = !!current?.image.naturalWidth;
  const hasEdit = !!current && current.image.id in slideEdits;

  const startCrop = () => {
    if (!current || !canEdit) return;
    setPlaying(false);
    setCropDraft({
      imageId: current.image.id,
      edit: current.edit,
      aspect: null,
    });
  };

  const applyCrop = () => {
    if (!draft) return;
    setSlideEdit(draft.imageId, draft.edit);
    setCropDraft(null);
  };

  /** Refits the crop to `aspect` around its current center. */
  const withAspect = (edit: ImageEdit, aspect: number | null): ImageEdit => {
    if (!aspect || !current) return edit;
    const rotated = rotatedSize(current.image, edit.rotation);
    const { x, y, width, height } = edit.crop;
    return {
      ...edit,
      crop: aspectCrop(aspect, rotated.width / rotated.height, {
        x: x + width / 2,
        y: y + height / 2,
      }),
    };
  };

  const rotate = (direction: 1 | -1) => {
    if (!current || !canEdit) return;
    if (!draft) {
      setSlideEdit(current.image.id, rotateEdit(current.edit, direction));
      return;
    }
    const edit = rotateEdit(draft.edit, direction);
    setCropDraft({ ...draft, edit: withAspect(edit, draft.aspect) });
  };

  const setCropAspect = (aspect: number | null) => {
    if (!draft) return;
    setCropDraft({ ...draft, aspect, edit: withAspect(draft.edit, aspect) });
  };

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

  const replay = () => {
    setIndex(0);
    setPlaying(true);
    // Restarts the timer even when already playing on the first slide.
    setPlayRun((run) => run + 1);
  };

  useEffect(() => {
    if (!isPlaying) return;
    const delay =
      settings.slideDuration + (safeIndex === 0 ? FIRST_SLIDE_EXTRA_MS : 0);
    const id = window.setTimeout(
      () => setIndex((safeIndex + 1) % slides.length),
      delay,
    );
    return () => window.clearTimeout(id);
  }, [
    isPlaying,
    safeIndex,
    slides.length,
    settings.slideDuration,
    playRun,
  ]);

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
      if (draft) {
        // A focused button (e.g. Cancel) handles its own Enter.
        if (event.key === "Enter" && !(target instanceof HTMLButtonElement)) {
          event.preventDefault();
          applyCrop();
        } else if (event.key === "Escape") {
          setCropDraft(null);
        }
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        const store = useCollageStore.getState();
        if (event.shiftKey) store.redo();
        else store.undo();
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
          {draft ? (
            <SlideCropEditor
              image={current.image}
              edit={draft.edit}
              aspect={draft.aspect}
              area={slideSize}
              onChange={(crop) =>
                setCropDraft({ ...draft, edit: { ...draft.edit, crop } })
              }
            />
          ) : (
            <SlideImage
              image={current.image}
              edit={current.edit}
              boxWidth={slideSize.width * settings.imageScale}
              boxHeight={slideSize.height * settings.imageScale}
              borderRadius={settings.cornerRadius}
              onDoubleClick={canEdit ? startCrop : undefined}
            />
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-center gap-3 px-4 py-4">
        {draft ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 rounded-md bg-zinc-900 p-0.5">
              {CROP_ASPECTS.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => setCropAspect(option.value)}
                  className={`rounded px-2 py-1 text-[11px] transition-colors ${
                    draft.aspect === option.value
                      ? "bg-zinc-100 text-zinc-900"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="w-7 px-0"
                onClick={() => rotate(-1)}
                aria-label="Rotate left"
                title="Rotate left"
              >
                <RotateIcon direction={-1} />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="w-7 px-0"
                onClick={() => rotate(1)}
                aria-label="Rotate right"
                title="Rotate right"
              >
                <RotateIcon direction={1} />
              </Button>
            </div>
            <div className="h-4 w-px bg-zinc-800" />
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                setCropDraft({ ...draft, edit: IDENTITY_EDIT, aspect: null })
              }
            >
              Reset
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCropDraft(null)}
              title="Cancel (Esc)"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={applyCrop}
              title="Apply (Enter)"
            >
              Done
            </Button>
          </div>
        ) : (
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
            <Button
              size="sm"
              variant="outline"
              className="w-7 px-0"
              onClick={replay}
              disabled={!canPlay}
              aria-label="Replay from start"
              title="Replay from start"
            >
              <ReplayIcon />
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
            <div className="h-4 w-px bg-zinc-800" />
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="w-7 px-0"
                onClick={startCrop}
                disabled={!canEdit}
                aria-label="Crop image"
                title="Crop (double-click image)"
              >
                <CropIcon />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="w-7 px-0"
                onClick={() => rotate(-1)}
                disabled={!canEdit}
                aria-label="Rotate left"
                title="Rotate left"
              >
                <RotateIcon direction={-1} />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="w-7 px-0"
                onClick={() => rotate(1)}
                disabled={!canEdit}
                aria-label="Rotate right"
                title="Rotate right"
              >
                <RotateIcon direction={1} />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSlideEdit(current.image.id, null)}
                disabled={!hasEdit}
                title="Remove crop and rotation"
              >
                Reset
              </Button>
            </div>
          </div>
        )}

        <div
          ref={stripRef}
          inert={!!draft}
          className={`flex max-w-full gap-2 overflow-x-auto pb-1 transition-opacity ${
            draft ? "opacity-40" : ""
          }`}
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
                <SlideImage
                  image={slide.image}
                  edit={slide.edit}
                  boxWidth={THUMB_WIDTH}
                  boxHeight={THUMB_HEIGHT}
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
          <SlideImage
            image={draggedSlide.image}
            edit={draggedSlide.edit}
            boxWidth={drag.width}
            boxHeight={drag.height}
          />
        </div>
      )}
    </div>
  );
}
