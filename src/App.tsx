import { useMemo } from "react";
import { AppShell } from "./components/layout/AppShell";
import { SavedCollage } from "./components/layout/SavedCollage";
import { useAutosave } from "./hooks/useCollagePersistence";
import { parseRoute } from "./lib/route";

function HomeEditor() {
  useAutosave(true);
  return <AppShell />;
}

export default function App() {
  const route = useMemo(() => parseRoute(window.location.href), []);
  if (route.kind === "collage") {
    return <SavedCollage id={route.id} editToken={route.editToken} />;
  }
  return <HomeEditor />;
}
