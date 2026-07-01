import type { CanvasRatio } from "../../types";
import { getCanvasAspect, MIN_PHOTOS } from "../../types";
import { computeBestGridLayout } from "../../lib/layout/balancedGrid";
import { PanelSection, Slider, Button } from "../ui/primitives";
import { useCollageStore } from "../../store/collageStore";

const RATIO_OPTIONS: { value: CanvasRatio; label: string }[] = [
  { value: "1:1", label: "1:1" },
  { value: "4:5", label: "4:5" },
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
  { value: "custom", label: "Custom" },
];

export function RightPanel() {
  const doc = useCollageStore((s) => s.document);
  const setGutter = useCollageStore((s) => s.setGutter);
  const setBorderRadius = useCollageStore((s) => s.setBorderRadius);
  const setBackgroundColor = useCollageStore((s) => s.setBackgroundColor);
  const setCanvasRatio = useCollageStore((s) => s.setCanvasRatio);
  const setCustomDimensions = useCollageStore((s) => s.setCustomDimensions);
  const setGridRows = useCollageStore((s) => s.setGridRows);
  const smartOrganize = useCollageStore((s) => s.smartOrganize);
  const imageCount = useCollageStore((s) => s.document.frameOrder.length);
  const enterCropMode = useCollageStore((s) => s.enterCropMode);
  const exitCropMode = useCollageStore((s) => s.exitCropMode);
  const selectedFrameId = useCollageStore((s) => s.selectedFrameId);
  const cropFrameId = useCollageStore((s) => s.cropFrameId);

  return (
    <aside className="flex w-60 shrink-0 flex-col gap-6 overflow-y-auto border-l border-zinc-800 bg-[var(--bg-panel)] p-4 lg:w-64">
      <PanelSection title="Canvas">
        <div className="flex flex-wrap gap-1">
          {RATIO_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setCanvasRatio(opt.value)}
              className={`rounded px-2 py-1 text-[11px] transition-colors ${
                doc.canvasRatio === opt.value
                  ? "bg-zinc-100 text-zinc-900"
                  : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {doc.canvasRatio === "custom" && (
          <div className="mt-2 flex gap-2">
            <label className="flex flex-1 flex-col gap-1 text-[11px] text-zinc-500">
              W
              <input
                type="number"
                value={doc.customWidth}
                min={100}
                max={4096}
                onChange={(e) =>
                  setCustomDimensions(
                    parseInt(e.target.value, 10) || doc.customWidth,
                    doc.customHeight,
                  )
                }
                className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-200"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-[11px] text-zinc-500">
              H
              <input
                type="number"
                value={doc.customHeight}
                min={100}
                max={4096}
                onChange={(e) =>
                  setCustomDimensions(
                    doc.customWidth,
                    parseInt(e.target.value, 10) || doc.customHeight,
                  )
                }
                className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-200"
              />
            </label>
          </div>
        )}
      </PanelSection>

      {imageCount >= MIN_PHOTOS && (
        <PanelSection title="Grid">
          <Button
            variant="primary"
            className="w-full"
            onClick={smartOrganize}
          >
            Smart organize
          </Button>
          <p className="text-[11px] text-zinc-600">
            Keeps the full-bleed grid and picks the best row count and photo
            order to reduce cropping.
          </p>
          {(() => {
            const autoRows = computeBestGridLayout(
              imageCount,
              getCanvasAspect(doc),
            ).rows;
            const effectiveRows = doc.gridRows ?? autoRows;
            const isAuto = doc.gridRows === null;

            return (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-zinc-400">Rows</span>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-7 px-0"
                      disabled={effectiveRows <= 1}
                      onClick={() => setGridRows(effectiveRows - 1)}
                      aria-label="Fewer rows"
                    >
                      −
                    </Button>
                    <span className="w-8 text-center text-[12px] tabular-nums text-zinc-200">
                      {effectiveRows}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-7 px-0"
                      disabled={effectiveRows >= imageCount}
                      onClick={() => setGridRows(effectiveRows + 1)}
                      aria-label="More rows"
                    >
                      +
                    </Button>
                  </div>
                </div>
                <p className="text-[11px] text-zinc-600">
                  {isAuto
                    ? `${autoRows} rows chosen automatically`
                    : "Manual row count"}
                </p>
                {!isAuto && (
                  <button
                    type="button"
                    onClick={() => setGridRows(null)}
                    className="self-start text-[11px] text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
                  >
                    Reset to auto
                  </button>
                )}
              </>
            );
          })()}
        </PanelSection>
      )}

      <PanelSection title="Spacing">
        <Slider
          label="Gutter"
          value={doc.gutter}
          min={0.004}
          max={0.04}
          step={0.001}
          onChange={setGutter}
        />
        <Slider
          label="Corner radius"
          value={doc.borderRadius}
          min={0}
          max={32}
          step={1}
          unit="px"
          onChange={setBorderRadius}
        />
      </PanelSection>

      <PanelSection title="Background">
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={doc.backgroundColor}
            onChange={(e) => setBackgroundColor(e.target.value)}
            className="h-8 w-8 cursor-pointer rounded border border-zinc-700 bg-transparent"
          />
          <input
            type="text"
            value={doc.backgroundColor}
            onChange={(e) => setBackgroundColor(e.target.value)}
            className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[12px] text-zinc-200"
          />
        </div>
      </PanelSection>

      {selectedFrameId && (
        <PanelSection title="Selected frame">
          {cropFrameId === selectedFrameId ? (
            <div className="flex flex-col gap-2">
              <p className="text-[12px] text-zinc-500">
                Drag to pan · Scroll to zoom · Esc to exit
              </p>
              <button
                type="button"
                onClick={exitCropMode}
                className="rounded border border-zinc-700 px-3 py-1.5 text-[12px] text-zinc-300 hover:border-zinc-500"
              >
                Done cropping
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => enterCropMode(selectedFrameId)}
              className="rounded border border-zinc-700 px-3 py-1.5 text-[12px] text-zinc-300 hover:border-zinc-500"
            >
              Crop image
            </button>
          )}
        </PanelSection>
      )}
    </aside>
  );
}
