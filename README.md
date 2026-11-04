# Collage Studio

A minimal, editorial-style photo collage editor. Upload 2–20 photos, pick a layout, adjust spacing, resize frames with consistent gutters, crop images in-frame, and export PNG.

## Run

```bash
npm install
npm run dev
```

Open the URL shown in the terminal (typically `http://localhost:5173`). Saving a collage needs the environment variables in [Persistence](#persistence).

## Features

- Split-tree layout engine with consistent gutters
- Deterministic layout presets for 2–20 photos
- Drag gutter handles to resize frames
- Double-click a frame to pan/zoom crop
- Global spacing, radius, background, canvas ratio
- Undo/redo (⌘Z / ⌘⇧Z)
- PNG export at 2048px long edge

## Stack

React 19, TypeScript, Vite, Tailwind CSS 4, Zustand, Immer, Supabase Postgres

## Persistence

A collage can be saved and opened again from a link. `POST /api/collages` stores the `CollageDocument` and returns an id plus an edit token. `GET /api/collages/:id` is public and never returns that token. `PUT /api/collages/:id` requires it (`x-edit-token`, or `editToken` in the JSON body). The same create route accepts `source` (default `editor`) so a later bot can send `source: "bot"`.

Uploaded and pasted photos are blob URLs, which only work in the tab that created them. On save they are resized and embedded as data URLs, with a 3.5 MB cap and a clear error if the collage is still too big. `https` and `http` image URLs are stored as links. Nothing is uploaded to Supabase Storage.

- `/` is the editor, same as before.
- Share saves the current collage, copies the view link, and shows the edit link. The address bar becomes `/c/<id>?edit=<token>`, and further edits autosave.
- `/c/<id>` is a read-only view with PNG export.
- `/c/<id>?edit=<token>` opens the editor.

`npm run dev` serves those `/api` routes as well as the UI. `vercel.json` rewrites `/c/*` to `index.html` so a refresh on Vercel still loads the app. The API itself is the `/api` serverless functions, not the rewrite.

### Environment variables

Set both on the Vercel project (Production and Preview). They are server-only.

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | Project URL, `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key |

If either is missing, the API responds with `503` and Share shows that storage is not configured. For local saves, put the same names in `.env.local` (see `.env.example`). Do not commit the service role key, and do not prefix either name with `VITE_`.

### Database migration

Run `supabase/migrations/20261104120000_create_collages.sql` once in the Supabase SQL editor. That creates `public.collages`, enables row level security, adds no policies, and revokes Data API access from `anon` and `authenticated`. Only the service role, used by the API routes, can read and write the table.

The advisor warning that RLS is on with no policies is expected. If the Supabase CLI is linked to the project, `supabase db push` runs the same file.
