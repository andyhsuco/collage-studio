import { useEffect, useState } from "react";
import { Button } from "../ui/primitives";
import { closeShareDialog, editLink, viewLink } from "../../lib/persist/session";
import { usePersistSession } from "../../hooks/useCollagePersistence";

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</span>
      <div className="flex gap-1.5">
        <input
          readOnly
          value={value}
          onFocus={(event) => event.currentTarget.select()}
          className="h-8 min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-2 text-[12px] text-zinc-200"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            void navigator.clipboard
              .writeText(value)
              .then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              })
              .catch(() => {});
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </label>
  );
}

export function ShareDialog() {
  const session = usePersistSession();

  useEffect(() => {
    if (!session.shareOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeShareDialog();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session.shareOpen]);

  if (!session.shareOpen) return null;

  const id = session.collageId;
  const token = session.editToken;
  const ready = id != null && token != null && session.saveStatus !== "saving";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close share dialog"
        className="absolute inset-0 bg-black/60"
        onClick={closeShareDialog}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
        className="relative w-full max-w-md rounded-lg border border-zinc-800 bg-[var(--bg-panel)] p-4 shadow-2xl shadow-black/40"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="share-title" className="text-[14px] font-medium text-zinc-100">
            Share collage
          </h2>
          <Button type="button" size="sm" variant="ghost" onClick={closeShareDialog}>
            Close
          </Button>
        </div>

        {session.saveStatus === "saving" && (
          <p className="mt-3 text-[13px] text-zinc-400">Saving…</p>
        )}

        {session.saveError && (
          <p className="mt-3 text-[13px] text-red-300">{session.saveError}</p>
        )}

        {ready && id && token && (
          <div className="mt-4 flex flex-col gap-3">
            {session.linkNotice && (
              <p className="text-[12px] text-zinc-400">{session.linkNotice}</p>
            )}
            <CopyField label="View link" value={viewLink(id)} />
            <CopyField label="Edit link" value={editLink(id, token)} />
            <p className="text-[12px] leading-relaxed text-zinc-500">
              Anyone with the view link can see this collage. The edit link can change it.
              Uploaded photos are saved inside the collage; https image links are stored as links.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
