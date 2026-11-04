-- Saved collages. The browser never talks to Postgres directly.
-- Server routes use the service role, which bypasses RLS.
-- anon/authenticated keep no grants and there are no policies, so the
-- Data API cannot read or write this table. The Supabase advisor may warn
-- that RLS is enabled with no policies; that is intentional.
--
-- A later ingest bot can insert through POST /api/collages with source = 'bot'.
-- updated_at is set by those routes (no trigger, so no function is exposed).

create table public.collages (
  id text primary key,
  doc jsonb not null,
  title text,
  source text not null default 'editor',
  edit_token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collages_id_format check (id ~ '^[A-Za-z0-9_-]{8,32}$'),
  constraint collages_doc_object check (jsonb_typeof(doc) = 'object'),
  constraint collages_doc_size check (octet_length(doc::text) <= 4500000),
  constraint collages_source_format check (source ~ '^[a-z][a-z0-9_-]{0,31}$'),
  constraint collages_title_length check (title is null or char_length(title) <= 200),
  constraint collages_edit_token_length check (char_length(edit_token) between 16 and 128)
);

comment on table public.collages is
  'Collage documents. Writes are service-role only; edit_token is the capability for updates.';

comment on column public.collages.doc is
  'CollageDocument JSON. https image URLs are stored as links; local photos are data URLs.';

comment on column public.collages.edit_token is
  'Unguessable capability secret. Returned once on create and never by public reads.';

comment on column public.collages.source is
  'Who created the row: editor today, bot from a later ingest endpoint.';

alter table public.collages enable row level security;

revoke all on table public.collages from public;
revoke all on table public.collages from anon, authenticated;
grant select, insert, update, delete on table public.collages to service_role;
