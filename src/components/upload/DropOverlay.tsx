export function DropOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-black/50 backdrop-blur-[1px]">
      <div className="rounded-xl border border-dashed border-zinc-400 bg-zinc-900/90 px-10 py-8 text-center shadow-2xl">
        <p className="text-[15px] font-medium text-zinc-100">Drop photos to upload</p>
        <p className="mt-1 text-[12px] text-zinc-500">Add to your collage</p>
      </div>
    </div>
  );
}
