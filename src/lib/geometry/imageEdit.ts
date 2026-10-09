import type { ImageAsset, ImageEdit, Rect, Rotation } from "../../types";

export const FULL_CROP: Rect = { x: 0, y: 0, width: 1, height: 1 };

export const IDENTITY_EDIT: ImageEdit = { rotation: 0, crop: FULL_CROP };

export function isIdentityEdit(edit: ImageEdit): boolean {
  const { x, y, width, height } = edit.crop;
  return (
    edit.rotation === 0 &&
    x <= 0.0005 &&
    y <= 0.0005 &&
    width >= 0.999 &&
    height >= 0.999
  );
}

/** Natural size of the image after rotation. */
export function rotatedSize(image: ImageAsset, rotation: Rotation) {
  const swap = rotation === 90 || rotation === 270;
  return {
    width: swap ? image.naturalHeight : image.naturalWidth,
    height: swap ? image.naturalWidth : image.naturalHeight,
  };
}

/** Natural size of the image after rotation and crop. */
export function editedSize(image: ImageAsset, edit: ImageEdit) {
  const rotated = rotatedSize(image, edit.rotation);
  return {
    width: rotated.width * edit.crop.width,
    height: rotated.height * edit.crop.height,
  };
}

/** Rotates by 90° (1 = clockwise), carrying the crop rect along with the image. */
export function rotateEdit(edit: ImageEdit, direction: 1 | -1): ImageEdit {
  const { x, y, width, height } = edit.crop;
  const crop =
    direction === 1
      ? { x: 1 - y - height, y: x, width: height, height: width }
      : { x: y, y: 1 - x - width, width: height, height: width };
  const rotation = (((edit.rotation + direction * 90) % 360) + 360) % 360;
  return { rotation: rotation as Rotation, crop };
}

/**
 * Largest crop with the given pixel aspect that fits the image, centered on
 * `center` where possible. `imageAspect` is the rotated image's aspect.
 */
export function aspectCrop(
  aspect: number,
  imageAspect: number,
  center: { x: number; y: number } = { x: 0.5, y: 0.5 },
): Rect {
  const k = imageAspect / aspect;
  let width = 1;
  let height = k;
  if (height > 1) {
    height = 1;
    width = 1 / k;
  }
  const x = Math.min(1 - width, Math.max(0, center.x - width / 2));
  const y = Math.min(1 - height, Math.max(0, center.y - height / 2));
  return { x, y, width, height };
}

/** Size of content scaled (up or down) to fit inside a box. */
export function fitSize(
  contentWidth: number,
  contentHeight: number,
  boxWidth: number,
  boxHeight: number,
) {
  if (contentWidth <= 0 || contentHeight <= 0) return { width: 0, height: 0 };
  const ratio = Math.min(boxWidth / contentWidth, boxHeight / contentHeight);
  return {
    width: Math.round(contentWidth * ratio),
    height: Math.round(contentHeight * ratio),
  };
}
