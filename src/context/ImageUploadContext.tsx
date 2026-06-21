import { createContext, useContext } from "react";
import { useImageUpload } from "../hooks/useImageUpload";

type ImageUploadContextValue = ReturnType<typeof useImageUpload>;

const ImageUploadContext = createContext<ImageUploadContextValue | null>(null);

export function ImageUploadProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const value = useImageUpload();
  return (
    <ImageUploadContext.Provider value={value}>
      {children}
    </ImageUploadContext.Provider>
  );
}

export function useImageUploadContext() {
  const ctx = useContext(ImageUploadContext);
  if (!ctx) {
    throw new Error("useImageUploadContext must be used within ImageUploadProvider");
  }
  return ctx;
}
