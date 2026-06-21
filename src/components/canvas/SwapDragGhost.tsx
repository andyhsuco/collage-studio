interface SwapDragGhostProps {
  imageSrc: string;
  width: number;
  height: number;
  x: number;
  y: number;
  borderRadius: number;
  cropX?: number;
  cropY?: number;
  zoom?: number;
}

export function SwapDragGhost({
  imageSrc,
  width,
  height,
  x,
  y,
  borderRadius,
  cropX = 0.5,
  cropY = 0.5,
  zoom = 1,
}: SwapDragGhostProps) {
  return (
    <div
      className="pointer-events-none fixed z-[100] overflow-hidden shadow-2xl ring-2 ring-white/90"
      style={{
        left: x,
        top: y,
        width,
        height,
        transform: "translate(-50%, -50%)",
        borderRadius,
        opacity: 0.95,
      }}
    >
      <img
        src={imageSrc}
        alt=""
        draggable={false}
        className="h-full w-full object-cover"
        style={{
          objectPosition: `${cropX * 100}% ${cropY * 100}%`,
          transform: `scale(${zoom})`,
        }}
      />
    </div>
  );
}

export function computeGhostSize(frameWidth: number, frameHeight: number) {
  const maxEdge = 112;
  const scale = 0.42;
  let width = frameWidth * scale;
  let height = frameHeight * scale;
  const aspect = frameWidth / frameHeight;

  if (width > maxEdge || height > maxEdge) {
    if (aspect >= 1) {
      width = maxEdge;
      height = maxEdge / aspect;
    } else {
      height = maxEdge;
      width = maxEdge * aspect;
    }
  }

  return {
    width: Math.max(48, Math.round(width)),
    height: Math.max(48, Math.round(height)),
  };
}
