import { useEffect, useSyncExternalStore } from "react";
import { useCollageStore } from "../store/collageStore";
import {
  getPersistSession,
  scheduleAutosave,
  subscribePersistSession,
} from "../lib/persist/session";

export function usePersistSession() {
  return useSyncExternalStore(subscribePersistSession, getPersistSession, getPersistSession);
}

export function useAutosave(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    return useCollageStore.subscribe((next, prev) => {
      if (getPersistSession().hydrating) return;
      if (next.document === prev.document) return;
      if (!getPersistSession().collageId || !getPersistSession().editToken) return;
      scheduleAutosave();
    });
  }, [enabled]);
}
