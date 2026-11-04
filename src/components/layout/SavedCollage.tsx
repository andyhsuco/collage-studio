import { useEffect, useState } from "react";
import { CollageCanvas } from "../canvas/CollageCanvas";
import { SlideView } from "../canvas/SlideView";
import { Button } from "../ui/primitives";
import type { ViewMode } from "../../store/collageStore";
import { AppShell } from "./AppShell";
import { useAutosave } from "../../hooks/useCollagePersistence";
import { loadSavedCollage } from "../../lib/persist/session";
import { useCollageStore } from "../../store/collageStore";

type LoadState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "error"; message: string }
  | { status: "edit" }
  | { status: "view"; title: string | null; banner: string | null };

function StatusScreen({
  title,
  body,
  onRetry,
}: {
  title: string;
  body?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex h-full items-center justify-center bg-[var(--bg-app)] p-6">
      <div className="max-w-sm text-center">
        <p className="text-[15px] font-medium text-zinc-300">{title}</p>
        {body && <p className="mt-2 text-[13px] text-zinc-500">{body}</p>}
        <div className="mt-4 flex items-center justify-center gap-2">
          <a
            href="/"
            className="inline-flex h-7 items-center rounded-md border border-zinc-700 px-2 text-[12px] text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
          >
            Back to editor
          </a>
          {onRetry && (
            <Button type="button" size="sm" variant="outline" onClick={onRetry}>
              Try again
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewShell({
  title,
  banner,
}: {
  title: string | null;
  banner: string | null;
}) {
  const exportPng = useCollageStore((s) => s.exportPng);
  const viewMode = useCollageStore((s) => s.viewMode);
  const setViewMode = useCollageStore((s) => s.setViewMode);
  const hasLayout = useCollageStore((s) => s.document.layoutTree !== null);
  const imageCount = useCollageStore((s) => Object.keys(s.document.images).length);
  const canExport = viewMode === "slides" ? imageCount > 0 : hasLayout;

  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} · Collage Studio` : "Collage Studio";
    return () => {
      document.title = previous;
    };
  }, [title]);

  return (
    <div className="flex h-full flex-col bg-[var(--bg-app)]">
      {banner && (
        <p className="border-b border-amber-900/70 bg-amber-950/50 px-4 py-2 text-center text-[12px] text-amber-100">
          {banner}
        </p>
      )}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-800 bg-[var(--bg-panel)] px-4">
        <div className="flex min-w-0 items-center gap-3">
          <a href="/" className="text-[14px] font-medium tracking-tight text-zinc-100">
            Collage Studio
          </a>
          {title && (
            <span className="truncate text-[13px] text-zinc-500">{title}</span>
          )}
          <span className="text-[11px] uppercase tracking-wide text-zinc-600">View</span>
          <div className="flex items-center gap-1 rounded-md bg-zinc-900 p-0.5">
            {(["collage", "slides"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={`rounded px-2.5 py-1 text-[12px] capitalize transition-colors ${
                  viewMode === mode
                    ? "bg-zinc-100 text-zinc-900"
                    : "text-zinc-500 hover:text-zinc-200"
                }`}
              >
                {mode === "collage" ? "Collage" : "Slides"}
              </button>
            ))}
          </div>
        </div>
        <Button
          size="sm"
          variant="primary"
          onClick={() => void exportPng()}
          disabled={!canExport}
        >
          Export PNG
        </Button>
      </header>
      {viewMode === "slides" ? <SlideView readOnly /> : <CollageCanvas readOnly />}
    </div>
  );
}

export function SavedCollage({
  id,
  editToken,
}: {
  id: string;
  editToken: string | null;
}) {
  const [attempt, setAttempt] = useState(0);
  const requestKey = `${id}:${editToken ?? ""}:${attempt}`;
  const [loaded, setLoaded] = useState<{ key: string; phase: LoadState } | null>(null);
  const state: LoadState =
    loaded?.key === requestKey ? loaded.phase : { status: "loading" };

  useAutosave(state.status === "edit");

  useEffect(() => {
    let cancelled = false;
    void loadSavedCollage(id, editToken)
      .then((result) => {
        if (cancelled) return;
        if (result.access === "missing") {
          setLoaded({ key: requestKey, phase: { status: "missing" } });
          return;
        }
        if (result.access === "edit") {
          setLoaded({ key: requestKey, phase: { status: "edit" } });
          return;
        }
        setLoaded({
          key: requestKey,
          phase: {
            status: "view",
            title: result.title,
            banner: result.banner,
          },
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoaded({
          key: requestKey,
          phase: {
            status: "error",
            message: error instanceof Error ? error.message : "Couldn't load this collage.",
          },
        });
      });
    return () => {
      cancelled = true;
    };
  }, [id, editToken, requestKey]);

  if (state.status === "loading") {
    return <StatusScreen title="Loading collage…" />;
  }
  if (state.status === "missing") {
    return <StatusScreen title="No collage found for this link." />;
  }
  if (state.status === "error") {
    return (
      <StatusScreen
        title="Couldn't load this collage"
        body={state.message}
        onRetry={() => setAttempt((value) => value + 1)}
      />
    );
  }
  if (state.status === "view") {
    return <ReviewShell title={state.title} banner={state.banner} />;
  }
  return <AppShell />;
}
