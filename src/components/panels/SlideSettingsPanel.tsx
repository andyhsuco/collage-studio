import { PanelSection, Slider } from "../ui/primitives";
import { useCollageStore, type SlideSettings } from "../../store/collageStore";

const BACKGROUND_MODES: {
  value: SlideSettings["backgroundMode"];
  label: string;
}[] = [
  { value: "auto", label: "Auto" },
  { value: "custom", label: "Custom" },
];

export function SlideSettingsPanel() {
  const settings = useCollageStore((s) => s.slideSettings);
  const update = useCollageStore((s) => s.updateSlideSettings);

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

      <PanelSection title="Background">
        <div className="flex flex-wrap gap-1">
          {BACKGROUND_MODES.map((mode) => (
            <button
              key={mode.value}
              type="button"
              onClick={() => update({ backgroundMode: mode.value })}
              className={`rounded px-2 py-1 text-[11px] transition-colors ${
                settings.backgroundMode === mode.value
                  ? "bg-zinc-100 text-zinc-900"
                  : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
        {settings.backgroundMode === "auto" ? (
          <p className="text-[11px] text-zinc-600">
            Each slide uses its photo’s dominant color.
          </p>
        ) : (
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={settings.backgroundColor}
              onChange={(e) => update({ backgroundColor: e.target.value })}
              className="h-8 w-8 cursor-pointer rounded border border-zinc-700 bg-transparent"
            />
            <input
              type="text"
              value={settings.backgroundColor}
              onChange={(e) => update({ backgroundColor: e.target.value })}
              className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[12px] text-zinc-200"
            />
          </div>
        )}
      </PanelSection>
    </>
  );
}
