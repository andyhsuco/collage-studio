import type { CSSProperties } from "react";
import { rotatedSize } from "../../lib/geometry/imageEdit";
import type { ImageAsset, ImageEdit } from "../../types";

interface EditedImageProps {
  image: ImageAsset;
  edit: ImageEdit;
  /** Display size; should match the edited image's aspect. */
  width: number;
  height: number;
  borderRadius?: number;
  className?: string;
  style?: CSSProperties;
  onDoubleClick?: () => void;
}

/** Renders an image rotated and cropped per `edit`, scaled to `width`×`height`. */
export function EditedImage({
  image,
  edit,
  width,
  height,
  borderRadius,
  className,
  style,
  onDoubleClick,
}: EditedImageProps) {
  const rotated = rotatedSize(image, edit.rotation);
  const scale = width / (rotated.width * edit.crop.width);
  const rotatedW = rotated.width * scale;
  const rotatedH = rotated.height * scale;
  const imageW = image.naturalWidth * scale;
  const imageH = image.naturalHeight * scale;

  return (
    <div
      className={className}
      onDoubleClick={onDoubleClick}
      style={{
        position: "relative",
        flexShrink: 0,
        overflow: "hidden",
        width,
        height,
        borderRadius,
        ...style,
      }}
    >
      <img
        src={image.src}
        alt=""
        draggable={false}
        style={{
          position: "absolute",
          display: "block",
          maxWidth: "none",
          width: imageW,
          height: imageH,
          left: -edit.crop.x * rotatedW + (rotatedW - imageW) / 2,
          top: -edit.crop.y * rotatedH + (rotatedH - imageH) / 2,
          transform: edit.rotation ? `rotate(${edit.rotation}deg)` : undefined,
        }}
      />
    </div>
  );
}
