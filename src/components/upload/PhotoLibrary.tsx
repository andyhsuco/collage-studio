import { useState } from "react";
import { MAX_PHOTOS } from "../../types";
import { useCollageStore } from "../../store/collageStore";
import { downloadImagesZip } from "../../lib/export/zipImages";
import { Button } from "../ui/primitives";
import { ImageDeleteButton } from "./ImageDeleteButton";

export function PhotoLibrary() {
  const images = useCollageStore((s) => s.document.images);
  const document_ = useCollageStore((s) => s.document);
  const removeImage = useCollageStore((s) => s.removeImage);
  const imageCount = Object.keys(images).length;
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [zipping, setZipping] = useState(false);

  if (imageCount === 0) {
    return (
      <p className="text-[12px] text-zinc-600">
        Drop or paste photos on the canvas to add them · 0/{MAX_PHOTOS}
      </p>
    );
  }

  const handleDownloadZip = async () => {
    if (zipping) return;
    setZipping(true);
    try {
      await downloadImagesZip(document_);
    } finally {
      setZipping(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] text-zinc-600">
        {imageCount}/{MAX_PHOTOS} photos
      </p>
      <div className="grid grid-cols-3 gap-1.5">
        {Object.values(images).map((img) => (
          <div
            key={img.id}
            className="relative aspect-square overflow-hidden rounded-md bg-zinc-800"
            onPointerEnter={() => setHoveredId(img.id)}
            onPointerLeave={() => setHoveredId(null)}
          >
            <img
              src={img.src}
              alt=""
              className="h-full w-full object-cover"
            />
            <div
              className={`absolute inset-0 flex items-start justify-end bg-black/35 p-1 transition-opacity ${
                hoveredId === img.id ? "opacity-100" : "opacity-0"
              }`}
            >
              <ImageDeleteButton onDelete={() => removeImage(img.id)} />
            </div>
          </div>
        ))}
      </div>
      <Button
        variant="outline"
        className="w-full"
        disabled={zipping}
        onClick={() => void handleDownloadZip()}
      >
        {zipping ? "Preparing zip…" : "Download all as ZIP"}
      </Button>
    </div>
  );
}
