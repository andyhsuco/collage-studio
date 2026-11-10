/** Visible fraction of an image under object-fit cover (1 = no crop). */
export function coverFillRatio(frameAspect: number, imageAspect: number): number {
  if (frameAspect <= 0 || imageAspect <= 0) return 1;
  const ratio = frameAspect / imageAspect;
  return ratio <= 1 ? ratio : 1 / ratio;
}
