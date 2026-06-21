const IMAGE_EXTENSION = /\.(jpe?g|png|gif|webp|heic|heif|avif|bmp|tiff?)$/i;

export function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  return IMAGE_EXTENSION.test(file.name);
}

export function filesFromList(files: FileList | File[]): File[] {
  return Array.from(files).filter(isImageFile);
}

export function filesFromDataTransfer(dataTransfer: DataTransfer): File[] {
  const fromFiles = filesFromList(dataTransfer.files);
  if (fromFiles.length > 0) return fromFiles;

  return Array.from(dataTransfer.items)
    .filter(
      (item) =>
        item.kind === "file" &&
        (item.type.startsWith("image/") || item.type === ""),
    )
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null && isImageFile(file));
}

export function filesFromClipboard(dataTransfer: DataTransfer): File[] {
  return Array.from(dataTransfer.items)
    .filter((item) => item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
}

export function dataTransferHasFiles(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes("Files");
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}
