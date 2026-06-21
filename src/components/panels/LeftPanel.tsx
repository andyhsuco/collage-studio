import { PanelSection } from "../ui/primitives";
import { PhotoUploader } from "../upload/PhotoUploader";
import { LayoutPresetGrid } from "./LayoutPresetGrid";

export function LeftPanel() {
  return (
    <aside className="flex w-60 shrink-0 flex-col gap-6 overflow-y-auto border-r border-zinc-800 bg-[var(--bg-panel)] p-4 lg:w-64">
      <PanelSection title="Upload">
        <PhotoUploader />
      </PanelSection>
      <PanelSection title="Layouts">
        <LayoutPresetGrid />
      </PanelSection>
    </aside>
  );
}
