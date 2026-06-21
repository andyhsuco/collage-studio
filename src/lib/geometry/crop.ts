export interface ImageDrawParams {
  drawX: number;
  drawY: number;
  drawW: number;
  drawH: number;
}

export function computeCoverDrawParams(
  imgW: number,
  imgH: number,
  frameW: number,
  frameH: number,
  cropX: number,
  cropY: number,
  zoom: number,
): ImageDrawParams {
  const frameAspect = frameW / frameH;
  const imgAspect = imgW / imgH;

  let baseScale: number;
  if (imgAspect > frameAspect) {
    baseScale = frameH / imgH;
  } else {
    baseScale = frameW / imgW;
  }

  const scale = baseScale * zoom;
  const drawW = imgW * scale;
  const drawH = imgH * scale;

  const frameCenterX = frameW / 2;
  const frameCenterY = frameH / 2;
  const imgPointX = cropX * imgW * scale;
  const imgPointY = cropY * imgH * scale;

  return {
    drawX: frameCenterX - imgPointX,
    drawY: frameCenterY - imgPointY,
    drawW,
    drawH,
  };
}

export function clampCrop(
  cropX: number,
  cropY: number,
  imgW: number,
  imgH: number,
  frameW: number,
  frameH: number,
  zoom: number,
): { cropX: number; cropY: number } {
  const { drawW, drawH } = computeCoverDrawParams(
    imgW,
    imgH,
    frameW,
    frameH,
    cropX,
    cropY,
    zoom,
  );

  const frameCenterX = frameW / 2;
  const frameCenterY = frameH / 2;

  let cx = cropX;
  let cy = cropY;

  const leftGap = frameCenterX - (cx * imgW * (drawW / imgW) - drawW / 2);
  const rightGap = cx * imgW * (drawW / imgW) + drawW / 2 - frameCenterX;
  const topGap = frameCenterY - (cy * imgH * (drawH / imgH) - drawH / 2);
  const bottomGap = cy * imgH * (drawH / imgH) + drawH / 2 - frameCenterY;

  if (drawW > frameW) {
    const minCx = (frameW / 2) / drawW;
    const maxCx = 1 - minCx;
    cx = Math.min(maxCx, Math.max(minCx, cx));
  } else {
    cx = 0.5;
  }

  if (drawH > frameH) {
    const minCy = (frameH / 2) / drawH;
    const maxCy = 1 - minCy;
    cy = Math.min(maxCy, Math.max(minCy, cy));
  } else {
    cy = 0.5;
  }

  void leftGap;
  void rightGap;
  void topGap;
  void bottomGap;

  return { cropX: cx, cropY: cy };
}

export function panCrop(
  cropX: number,
  cropY: number,
  deltaX: number,
  deltaY: number,
  imgW: number,
  imgH: number,
  frameW: number,
  frameH: number,
  zoom: number,
): { cropX: number; cropY: number } {
  const { drawW } = computeCoverDrawParams(
    imgW,
    imgH,
    frameW,
    frameH,
    cropX,
    cropY,
    zoom,
  );

  const scale = drawW / imgW;
  const newCropX = cropX - deltaX / (imgW * scale);
  const newCropY = cropY - deltaY / (imgH * scale);

  return clampCrop(newCropX, newCropY, imgW, imgH, frameW, frameH, zoom);
}

export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}
