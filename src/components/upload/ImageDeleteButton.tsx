interface ImageDeleteButtonProps {
  onDelete: () => void;
  className?: string;
}

export function ImageDeleteButton({
  onDelete,
  className = "",
}: ImageDeleteButtonProps) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onDelete();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className={`flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-zinc-100 backdrop-blur-sm transition-colors hover:bg-red-600/90 ${className}`}
      aria-label="Remove image"
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
        <path
          d="M2 2l6 6M8 2L2 8"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
