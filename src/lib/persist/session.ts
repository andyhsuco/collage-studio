import { useCollageStore } from "../../store/collageStore";
import { PersistRequestError, fetchCollage, createCollage, updateCollage } from "./api.ts";
import { prepareDocumentForPersistence } from "./prepareDocument.ts";
import { collageEditPath, collageViewPath } from "../route.ts";
import type { CollageDocument } from "../../types/index.ts";

const AUTOSAVE_MS = 800;

export interface PersistSession {
  collageId: string | null;
  editToken: string | null;
  saveStatus: "idle" | "saving" | "saved" | "error";
  saveError: string | null;
  linkNotice: string | null;
  shareOpen: boolean;
  hydrating: boolean;
}

const listeners = new Set<() => void>();

let snapshot: PersistSession = {
  collageId: null,
  editToken: null,
  saveStatus: "idle",
  saveError: null,
  linkNotice: null,
  shareOpen: false,
  hydrating: false,
};

let lastSaved = "";
let chain: Promise<void> = Promise.resolve();
let timer: ReturnType<typeof setTimeout> | null = null;

function emit() {
  for (const listener of listeners) listener();
}

function patch(partial: Partial<PersistSession>) {
  snapshot = { ...snapshot, ...partial };
  emit();
}

export function getPersistSession(): PersistSession {
  return snapshot;
}

export function subscribePersistSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function closeShareDialog() {
  patch({ shareOpen: false });
}

export function runHydrated(fn: () => void) {
  patch({ hydrating: true });
  try {
    fn();
  } finally {
    patch({ hydrating: false });
  }
}

export function viewLink(id: string): string {
  return `${window.location.origin}${collageViewPath(id)}`;
}

export function editLink(id: string, editToken: string): string {
  return `${window.location.origin}${collageEditPath(id, editToken)}`;
}

function syncEditUrl(id: string, editToken: string) {
  const next = collageEditPath(id, editToken);
  const current = `${window.location.pathname}${window.location.search}`;
  if (current !== next) window.history.replaceState(null, "", next);
}

function remember(doc: CollageDocument) {
  lastSaved = JSON.stringify(doc);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Could not save the collage.";
}

function enqueue(task: () => Promise<void>): Promise<void> {
  const run = chain.then(task, task);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function scheduleAutosave() {
  if (timer != null) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void enqueue(() => performSave("auto"));
  }, AUTOSAVE_MS);
}

async function performSave(kind: "auto" | "share"): Promise<void> {
  const session = getPersistSession();
  const imageCount = Object.keys(useCollageStore.getState().document.images).length;
  if (kind === "share" && imageCount === 0) {
    patch({
      shareOpen: true,
      saveStatus: "error",
      saveError: "Add photos before sharing.",
      linkNotice: null,
    });
    return;
  }
  if (kind === "auto" && (!session.collageId || !session.editToken)) return;

  patch({ saveStatus: "saving", saveError: null, shareOpen: kind === "share" ? true : session.shareOpen });

  const before = useCollageStore.getState().document;
  try {
    const prepared = await prepareDocumentForPersistence(before);
    const payload = JSON.stringify(prepared);
    let collageId = getPersistSession().collageId;
    let editToken = getPersistSession().editToken;

    if (payload !== lastSaved || !collageId || !editToken) {
      if (!collageId || !editToken) {
        const created = await createCollage(prepared);
        collageId = created.id;
        editToken = created.editToken;
        patch({ collageId, editToken });
      } else {
        await updateCollage(collageId, editToken, prepared);
      }
      remember(prepared);
    }

    const changedDuring = useCollageStore.getState().document !== before;
    runHydrated(() => {
      useCollageStore.getState().adoptImageSources(prepared.images);
    });

    if (!collageId || !editToken) {
      throw new Error("Could not save the collage.");
    }

    patch({
      saveStatus: "saved",
      saveError: null,
      collageId,
      editToken,
    });
    syncEditUrl(collageId, editToken);

    if (kind === "share") {
      let linkNotice: string | null = null;
      try {
        await navigator.clipboard.writeText(viewLink(collageId));
        linkNotice = "View link copied.";
      } catch {
        linkNotice = null;
      }
      patch({ shareOpen: true, linkNotice });
    }

    if (changedDuring) scheduleAutosave();
  } catch (error) {
    patch({
      saveStatus: "error",
      saveError: errorMessage(error),
      shareOpen: kind === "share" ? true : getPersistSession().shareOpen,
    });
  }
}

export function shareCollage(): Promise<void> {
  if (timer != null) {
    clearTimeout(timer);
    timer = null;
  }
  patch({ shareOpen: true, linkNotice: null });
  return enqueue(() => performSave("share"));
}

export async function loadSavedCollage(id: string, editToken: string | null) {
  if (editToken) {
    try {
      const saved = await fetchCollage(id, editToken);
      if (saved.canEdit) {
        runHydrated(() => useCollageStore.getState().loadDocument(saved.doc));
        remember(saved.doc);
        patch({
          collageId: id,
          editToken,
          saveStatus: "saved",
          saveError: null,
          shareOpen: false,
          linkNotice: null,
        });
        return { access: "edit" as const, title: saved.title, banner: null };
      }
    } catch (error) {
      const status = error instanceof PersistRequestError ? error.status : 0;
      if (status !== 403 && status !== 404) throw error;
      if (status === 404) {
        return { access: "missing" as const, title: null, banner: null };
      }
    }
  }

  let saved;
  try {
    saved = await fetchCollage(id);
  } catch (error) {
    if (error instanceof PersistRequestError && error.status === 404) {
      return { access: "missing" as const, title: null, banner: null };
    }
    throw error;
  }
  runHydrated(() => useCollageStore.getState().loadDocument(saved.doc));
  patch({
    collageId: null,
    editToken: null,
    saveStatus: "idle",
    saveError: null,
    shareOpen: false,
    linkNotice: null,
  });
  if (editToken) {
    const viewPath = collageViewPath(id);
    if (`${window.location.pathname}${window.location.search}` !== viewPath) {
      window.history.replaceState(null, "", viewPath);
    }
  }
  return {
    access: "view" as const,
    title: saved.title,
    banner: editToken
      ? "This edit link isn't valid. You're viewing the collage read-only."
      : null,
  };
}
