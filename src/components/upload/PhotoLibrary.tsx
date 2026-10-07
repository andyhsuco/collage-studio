import { useState } from "react";
import { MAX_PHOTOS } from "../../types";
import { useCollageStore } from "../../store/collageStore";
import { downloadImagesZip } from "../../lib/export/zipImages";
import { Button } from "../ui/primitives";
import { useSortableDrag } from "../../hooks/useSortableDrag";
import { SwapDragGhost } from "../canvas/SwapDragGhost";
import { ImageDeleteButton } from "./ImageDeleteButton";

export function PhotoLibrary() {
  const images = useCollageStore((s) => s.document.images);
  const document_ = useCollageStore((s) => s.document);
  const removeImage = useCollageStore((s) => s.removeImage);
  const reorderFrames = useCollageStore((s) => s.reorderFrames);
  const imageCount = Object.keys(images).length;
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [zipping, setZipping] = useState(false);
  const { containerRef, drag, getItemProps } =
    useSortableDrag<HTMLDivElement>(reorderFrames);

  const orderedImages = document_.frameOrder.flatMap((frameId) => {
    const image = images[document_.frames[frameId]?.imageId];
    return image ? [image] : [];
  });
  const draggedImage = drag ? orderedImages[drag.fromIndex] : undefined;

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
      <div ref={containerRef} className="grid grid-cols-3 gap-1.5">
        {orderedImages.map((img, index) => (
          <div
            key={img.id}
            {...getItemProps(index)}
            className={`relative aspect-square cursor-grab overflow-hidden rounded-md bg-zinc-800 ${
              drag?.fromIndex === index ? "opacity-30" : ""
            }`}
            onPointerEnter={() => setHoveredId(img.id)}
            onPointerLeave={() => setHoveredId(null)}
          >
            <img
              src={img.src}
              alt=""
              draggable={false}
              className="h-full w-full object-cover"
            />
            <div
              className={`absolute inset-0 flex items-start justify-end bg-black/35 p-1 transition-opacity ${
                !drag && hoveredId === img.id ? "opacity-100" : "opacity-0"
              }`}
            >
              <ImageDeleteButton onDelete={() => removeImage(img.id)} />
            </div>
          </div>
        ))}
      </div>
      {drag && draggedImage && (
        <SwapDragGhost
          imageSrc={draggedImage.src}
          width={drag.width}
          height={drag.height}
          x={drag.ghostX}
          y={drag.ghostY}
          borderRadius={6}
        />
      )}
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
