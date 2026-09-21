import { useState } from "react";
import clsx from "clsx";

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  format?: (value: number) => string;
  onChange: (value: number) => void;
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  unit = "",
  format,
  onChange,
}: SliderProps) {
  const display = format
    ? format(value)
    : `${Number.isInteger(step) ? value : value.toFixed(3)}${unit}`;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wide text-zinc-500">
          {label}
        </span>
        <span className="text-[11px] tabular-nums text-zinc-400">
          {display}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full"
      />
    </div>
  );
}

interface PanelSectionProps {
  title: string;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}

export function PanelSection({
  title,
  children,
  collapsible = false,
  defaultOpen = true,
}: PanelSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (!collapsible) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
          {title}
        </h2>
        {children}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
          {title}
        </h2>
        <span
          className={clsx(
            "text-[10px] text-zinc-600 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        >
          ▾
        </span>
      </button>
      {open && children}
    </section>
  );
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "outline";
  size?: "sm" | "md";
}

export function Button({
  variant = "ghost",
  size = "md",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center rounded-md font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none",
        size === "sm" && "h-7 px-2 text-[12px]",
        size === "md" && "h-8 px-3 text-[13px]",
        variant === "primary" &&
          "bg-zinc-100 text-zinc-900 hover:bg-white",
        variant === "ghost" &&
          "text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100",
        variant === "outline" &&
          "border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
