import { useState } from "react";
import { Button } from "../ui/primitives";
import { useCollageStore } from "../../store/collageStore";
import type { CanvasRatio } from "../../types";

const RATIOS: CanvasRatio[] = ["1:1", "4:5", "16:9", "9:16", "custom"];

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect
        x="4.5"
        y="4.5"
        width="7"
        height="7"
        rx="1.25"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M3.5 9.5H3a1.5 1.5 0 0 1-1.5-1.5V3A1.5 1.5 0 0 1 3 1.5h5A1.5 1.5 0 0 1 9.5 3v.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function TopBar() {
  const canvasRatio = useCollageStore((s) => s.document.canvasRatio);
  const setCanvasRatio = useCollageStore((s) => s.setCanvasRatio);
  const undo = useCollageStore((s) => s.undo);
  const redo = useCollageStore((s) => s.redo);
  const canUndo = useCollageStore((s) => s.canUndo());
  const canRedo = useCollageStore((s) => s.canRedo());
  const exportPng = useCollageStore((s) => s.exportPng);
  const copyPng = useCollageStore((s) => s.copyPng);
  const hasLayout = useCollageStore((s) => s.document.layoutTree !== null);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const ok = await copyPng();
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-800 bg-[var(--bg-panel)] px-4">
      <div className="flex items-center gap-6">
        <h1 className="text-[14px] font-medium tracking-tight text-zinc-100">
          Collage Studio
        </h1>
        <div className="hidden items-center gap-0.5 sm:flex">
          {RATIOS.filter((r) => r !== "custom").map((ratio) => (
            <button
              key={ratio}
              type="button"
              onClick={() => setCanvasRatio(ratio)}
              className={`rounded px-2.5 py-1 text-[12px] transition-colors ${
                canvasRatio === ratio
                  ? "bg-zinc-100 text-zinc-900"
                  : "text-zinc-500 hover:text-zinc-200"
              }`}
            >
              {ratio}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={undo}
          disabled={!canUndo}
          title="Undo (⌘Z)"
        >
          ↩
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={redo}
          disabled={!canRedo}
          title="Redo (⌘⇧Z)"
        >
          ↪
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void handleCopy()}
          disabled={!hasLayout}
          title={copied ? "Copied!" : "Copy PNG to clipboard"}
          aria-label="Copy PNG to clipboard"
          className="px-2"
        >
          {copied ? (
            <span className="text-[11px]">Copied</span>
          ) : (
            <CopyIcon />
          )}
        </Button>
        <Button
          size="sm"
          variant="primary"
          onClick={() => void exportPng()}
          disabled={!hasLayout}
        >
          Export PNG
        </Button>
      </div>
    </header>
  );
}
