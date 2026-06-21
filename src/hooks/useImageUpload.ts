import { useCallback, useEffect, useState } from "react";
import { useCollageStore } from "../store/collageStore";
import { MAX_PHOTOS } from "../types";
import {
  dataTransferHasFiles,
  filesFromClipboard,
  filesFromDataTransfer,
  filesFromList,
  isEditableTarget,
} from "../lib/upload/extractImages";

export function useImageUpload() {
  const addImages = useCollageStore((s) => s.addImages);
  const imageCount = useCollageStore(
    (s) => Object.keys(s.document.images).length,
  );
  const [isDragging, setIsDragging] = useState(false);

  const canUpload = imageCount < MAX_PHOTOS;

  const upload = useCallback(
    async (files: File[]) => {
      const images = filesFromList(files);
      if (images.length === 0 || !canUpload) return;
      await addImages(images);
    },
    [addImages, canUpload],
  );

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if (!event.clipboardData) return;

      const files = filesFromClipboard(event.clipboardData);
      if (files.length === 0) return;

      event.preventDefault();
      void upload(files);
    };

    const onDragOver = (event: DragEvent) => {
      if (!event.dataTransfer || !dataTransferHasFiles(event.dataTransfer)) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      setIsDragging(true);
    };

    const onDragLeave = (event: DragEvent) => {
      if (event.relatedTarget !== null) return;
      setIsDragging(false);
    };

    const onDrop = (event: DragEvent) => {
      event.preventDefault();
      setIsDragging(false);
      if (!event.dataTransfer) return;
      const files = filesFromDataTransfer(event.dataTransfer);
      if (files.length > 0) void upload(files);
    };

    const onDragEnd = () => setIsDragging(false);

    window.addEventListener("paste", onPaste);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    window.addEventListener("dragend", onDragEnd);
    return () => {
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("dragend", onDragEnd);
    };
  }, [upload]);

  return {
    upload,
    canUpload,
    isDragging: isDragging && canUpload,
  };
}
