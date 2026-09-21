import { useState } from "react";
import { TopBar } from "./TopBar";
import { SidePanel } from "../panels/SidePanel";
import { CollageCanvas } from "../canvas/CollageCanvas";
import { SlideView } from "../canvas/SlideView";
import { Button } from "../ui/primitives";
import { ImageUploadProvider, useImageUploadContext } from "../../context/ImageUploadContext";
import { DropOverlay } from "../upload/DropOverlay";
import { useCollageStore } from "../../store/collageStore";

function AppShellContent() {
  const [showPanel, setShowPanel] = useState(false);
  const { isDragging } = useImageUploadContext();
  const viewMode = useCollageStore((s) => s.viewMode);

  return (
    <div className="relative flex h-full flex-col">
      <TopBar />
      <div className="relative flex min-h-0 flex-1">
        <main className="relative flex min-w-0 flex-1 flex-col">
          <div className="absolute left-3 top-3 z-10 lg:hidden">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowPanel((v) => !v)}
            >
              Panel
            </Button>
          </div>
          {viewMode === "slides" ? <SlideView /> : <CollageCanvas />}
        </main>

        <div
          className={`absolute inset-y-0 right-0 z-20 flex h-full min-h-0 lg:relative lg:block ${
            showPanel ? "block" : "hidden"
          }`}
        >
          <SidePanel />
        </div>

        {showPanel && (
          <button
            type="button"
            aria-label="Close panel"
            className="absolute inset-0 z-10 bg-black/40 lg:hidden"
            onClick={() => setShowPanel(false)}
          />
        )}
      </div>

      {isDragging && <DropOverlay />}
    </div>
  );
}

export function AppShell() {
  return (
    <ImageUploadProvider>
      <AppShellContent />
    </ImageUploadProvider>
  );
}
