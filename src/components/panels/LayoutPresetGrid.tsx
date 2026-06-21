import { useMemo } from "react";
import clsx from "clsx";
import { resolveAllRects } from "../../lib/layout/splitTree";
import type { LayoutOption } from "../../types";
import { useCollageStore } from "../../store/collageStore";

function LayoutPreview({
  option,
  selected,
  onClick,
}: {
  option: LayoutOption;
  selected: boolean;
  onClick: () => void;
}) {
  const rects = useMemo(
    () => resolveAllRects(option.tree, 0.04),
    [option.tree],
  );

  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex flex-col gap-1 rounded-lg border p-2 transition-colors",
        selected
          ? "border-zinc-400 bg-zinc-800"
          : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-600",
      )}
    >
      <div className="relative aspect-square w-full overflow-hidden rounded bg-zinc-950">
        {Array.from(rects.entries()).map(([id, rect]) => (
          <div
            key={id}
            className="absolute rounded-sm bg-zinc-600"
            style={{
              left: `${rect.x * 100}%`,
              top: `${rect.y * 100}%`,
              width: `${rect.width * 100}%`,
              height: `${rect.height * 100}%`,
            }}
          />
        ))}
      </div>
      <span className="truncate text-left text-[11px] text-zinc-400">
        {option.name}
      </span>
    </button>
  );
}

export function LayoutPresetGrid() {
  const layoutOptions = useCollageStore((s) => s.layoutOptions);
  const selectedPresetId = useCollageStore((s) => s.selectedPresetId);
  const applyPreset = useCollageStore((s) => s.applyPreset);
  const imageCount = useCollageStore((s) => Object.keys(s.document.images).length);

  if (imageCount < 2) {
    return (
      <p className="text-[12px] text-zinc-600">
        Upload at least 2 photos to see layout options.
      </p>
    );
  }

  if (layoutOptions.length === 0) {
    return (
      <p className="text-[12px] text-zinc-600">Generating layouts…</p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {layoutOptions.map((option) => (
        <LayoutPreview
          key={option.id}
          option={option}
          selected={selectedPresetId === option.id}
          onClick={() => applyPreset(option)}
        />
      ))}
    </div>
  );
}
