import { PanelSection, Slider, Button } from "../ui/primitives";
import { useCollageStore } from "../../store/collageStore";
import {
  clampSlideIndex,
  orderedSlideImages,
  slideBackgroundFor,
} from "../../lib/slides/background";

const BACKGROUND_MODES: {
  value: "auto" | "custom";
  label: string;
}[] = [
  { value: "auto", label: "Auto" },
  { value: "custom", label: "Custom" },
];

export function SlideSettingsPanel() {
  const settings = useCollageStore((s) => s.slideSettings);
  const update = useCollageStore((s) => s.updateSlideSettings);
  const doc = useCollageStore((s) => s.document);
  const slideIndex = useCollageStore((s) => s.slideIndex);
  const setSlideBackground = useCollageStore((s) => s.setSlideBackground);
  const applyToAll = useCollageStore((s) => s.applySlideBackgroundToAll);

  const slides = orderedSlideImages(doc);
  const index = clampSlideIndex(doc, slideIndex);
  const image = slides[index];
  const background = image
    ? slideBackgroundFor(doc.slideBackgrounds, image.id)
    : null;

  return (
    <>
      <PanelSection title="Image">
        <Slider
          label="Size"
          value={settings.imageScale}
          min={0.4}
          max={1}
          step={0.01}
          format={(value) => `${Math.round(value * 100)}%`}
          onChange={(imageScale) => update({ imageScale })}
        />
        <Slider
          label="Corner radius"
          value={settings.cornerRadius}
          min={0}
          max={32}
          step={1}
          unit="px"
          onChange={(cornerRadius) => update({ cornerRadius })}
        />
      </PanelSection>

      <PanelSection title="Playback">
        <Slider
          label="Time per slide"
          value={settings.slideDuration}
          min={250}
          max={5000}
          step={250}
          format={(value) => `${(value / 1000).toFixed(2)}s`}
          onChange={(slideDuration) => update({ slideDuration })}
        />
      </PanelSection>

      <PanelSection title="Background">
        {image && background ? (
          <>
            <p className="text-[11px] text-zinc-500">
              Slide {index + 1} of {slides.length}
            </p>
            <div className="flex flex-wrap gap-1">
              {BACKGROUND_MODES.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => setSlideBackground(image.id, { mode: mode.value })}
                  className={`rounded px-2 py-1 text-[11px] transition-colors ${
                    background.mode === mode.value
                      ? "bg-zinc-100 text-zinc-900"
                      : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            {background.mode === "auto" ? (
              <p className="text-[11px] text-zinc-600">
                This slide uses its photo’s dominant color.
              </p>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={toColorInput(background.color)}
                  onChange={(e) => setSlideBackground(image.id, { color: e.target.value })}
                  className="h-8 w-8 cursor-pointer rounded border border-zinc-700 bg-transparent"
                />
                <input
                  type="text"
                  value={background.color}
                  onChange={(e) => {
                    const color = e.target.value;
                    if (!color || color.length > 64) return;
                    setSlideBackground(image.id, { color });
                  }}
                  className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[12px] text-zinc-200"
                />
              </div>
            )}
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              disabled={slides.length < 2}
              onClick={() => applyToAll(image.id)}
            >
              Apply to all slides
            </Button>
          </>
        ) : (
          <p className="text-[11px] text-zinc-600">Add a photo to set its background.</p>
        )}
      </PanelSection>
    </>
  );
}

/** `<input type="color">` only accepts #rrggbb. */
function toColorInput(color: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#18181b";
}
