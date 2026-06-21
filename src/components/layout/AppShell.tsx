import { useState } from "react";
import { TopBar } from "./TopBar";
import { LeftPanel } from "../panels/LeftPanel";
import { RightPanel } from "../panels/RightPanel";
import { CollageCanvas } from "../canvas/CollageCanvas";
import { Button } from "../ui/primitives";
import { ImageUploadProvider, useImageUploadContext } from "../../context/ImageUploadContext";
import { DropOverlay } from "../upload/DropOverlay";

function AppShellContent() {
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(false);
  const { isDragging } = useImageUploadContext();

  return (
    <div className="relative flex h-full flex-col">
      <TopBar />
      <div className="relative flex min-h-0 flex-1">
        <div
          className={`absolute inset-y-0 left-0 z-20 lg:relative lg:block ${
            showLeft ? "block" : "hidden"
          }`}
        >
          <LeftPanel />
        </div>

        <main className="relative flex min-w-0 flex-1 flex-col">
          <div className="absolute left-3 top-3 z-10 flex gap-1 lg:hidden">
            <Button size="sm" variant="outline" onClick={() => setShowLeft((v) => !v)}>
              Photos
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowRight((v) => !v)}>
              Settings
            </Button>
          </div>
          <CollageCanvas />
        </main>

        <div
          className={`absolute inset-y-0 right-0 z-20 lg:relative lg:block ${
            showRight ? "block" : "hidden"
          }`}
        >
          <RightPanel />
        </div>

        {(showLeft || showRight) && (
          <button
            type="button"
            aria-label="Close panels"
            className="absolute inset-0 z-10 bg-black/40 lg:hidden"
            onClick={() => {
              setShowLeft(false);
              setShowRight(false);
            }}
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
