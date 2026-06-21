import { useCallback, useRef, useState } from "react";
import clsx from "clsx";
import { MAX_PHOTOS, MIN_PHOTOS } from "../../types";
import { useCollageStore } from "../../store/collageStore";
import { useImageUploadContext } from "../../context/ImageUploadContext";
import { filesFromDataTransfer, filesFromList } from "../../lib/upload/extractImages";
import { ImageDeleteButton } from "./ImageDeleteButton";

export function PhotoUploader() {
  const inputRef = useRef<HTMLInputElement>(null);
  const { upload, canUpload } = useImageUploadContext();
  const imageCount = useCollageStore((s) => Object.keys(s.document.images).length);
  const images = useCollageStore((s) => s.document.images);
  const removeImage = useCollageStore((s) => s.removeImage);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      await upload(filesFromList(files));
    },
    [upload],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      void upload(filesFromDataTransfer(e.dataTransfer));
    },
    [upload],
  );

  return (
    <div className="flex flex-col gap-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={onDrop}
        onClick={() => canUpload && inputRef.current?.click()}
        className={clsx(
          "flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-zinc-700 bg-zinc-900/50 px-4 py-6 transition-colors hover:border-zinc-500 hover:bg-zinc-900",
          !canUpload && "pointer-events-none opacity-50",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <span className="text-zinc-400">Drop photos or click to upload</span>
        <span className="mt-1 text-center text-[11px] text-zinc-600">
          {MIN_PHOTOS}–{MAX_PHOTOS} images · {imageCount}/{MAX_PHOTOS}
          <br />
          Paste with ⌘V anywhere
        </span>
      </div>

      {imageCount > 0 && (
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
      )}
    </div>
  );
}
