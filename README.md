# Collage Studio

A minimal, editorial-style photo collage editor. Upload 2–20 photos, pick a layout, adjust spacing, resize frames with consistent gutters, crop images in-frame, and export PNG.

## Run

```bash
npm install
npm run dev
```

Open the URL shown in the terminal (typically `http://localhost:5173`).

## Features

- Split-tree layout engine with consistent gutters
- Deterministic layout presets for 2–20 photos
- Drag gutter handles to resize frames
- Double-click a frame to pan/zoom crop
- Global spacing, radius, background, canvas ratio
- Undo/redo (⌘Z / ⌘⇧Z)
- PNG export at 2048px long edge

## Stack

React 19, TypeScript, Vite, Tailwind CSS 4, Zustand, Immer
