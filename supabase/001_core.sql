-- Biblioteca personal de estudio: núcleo inicial para Supabase.
-- Ejecuta este archivo en Supabase Dashboard > SQL Editor > New query.
-- Las notas son privadas por defecto. Solo las marcadas como public se leen sin iniciar sesión.
-- Los documentos subidos permanecen privados incluso cuando una nota se publica.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.study_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '',
  color text not null default '#5d7fa9',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, name)
);

create table if not exists public.study_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid,
  title text not null check (char_length(title) between 1 and 180),
  body text not null default '',
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  constraint study_notes_category_owner_fk
    foreign key (category_id, user_id)
    references public.study_categories(id, user_id)
    on delete set null (category_id)
);

create table if not exists public.study_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid,
  note_id uuid,
  file_name text not null,
  storage_path text not null unique,
  mime_type text,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  processing_status text not null default 'uploaded'
    check (processing_status in ('uploaded', 'processing', 'ready', 'error')),
  processing_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_documents_category_owner_fk
    foreign key (category_id, user_id)
    references public.study_categories(id, user_id)
    on delete set null (category_id),
  constraint study_documents_note_owner_fk
    foreign key (note_id, user_id)
    references public.study_notes(id, user_id)
    on delete set null (note_id)
);

create index if not exists study_categories_user_idx on public.study_categories(user_id);
create index if not exists study_notes_user_category_idx on public.study_notes(user_id, category_id);
create index if not exists study_notes_public_idx on public.study_notes(visibility, published_at desc)
  where visibility = 'public';
create index if not exists study_documents_user_category_idx on public.study_documents(user_id, category_id);

-- Keep updated_at current on edits.
drop trigger if exists study_categories_set_updated_at on public.study_categories;
create trigger study_categories_set_updated_at before update on public.study_categories
for each row execute function public.set_updated_at();
drop trigger if exists study_notes_set_updated_at on public.study_notes;
create trigger study_notes_set_updated_at before update on public.study_notes
for each row execute function public.set_updated_at();
drop trigger if exists study_documents_set_updated_at on public.study_documents;
create trigger study_documents_set_updated_at before update on public.study_documents
for each row execute function public.set_updated_at();

-- Row Level Security: categories/documents are owner-only; notes may be read publicly
-- only after the owner explicitly changes visibility to 'public'.
alter table public.study_categories enable row level security;
alter table public.study_notes enable row level security;
alter table public.study_documents enable row level security;

drop policy if exists "Owners manage their categories" on public.study_categories;
create policy "Owners manage their categories" on public.study_categories
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Owners read categories with public notes" on public.study_categories;
create policy "Owners read categories with public notes" on public.study_categories
for select to anon, authenticated
using (
  exists (
    select 1 from public.study_notes n
    where n.category_id = study_categories.id
      and n.visibility = 'public'
  )
);

drop policy if exists "Read own or published notes" on public.study_notes;
create policy "Read own or published notes" on public.study_notes
for select to anon, authenticated
using (auth.uid() = user_id or visibility = 'public');

drop policy if exists "Owners create notes" on public.study_notes;
create policy "Owners create notes" on public.study_notes
for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Owners update notes" on public.study_notes;
create policy "Owners update notes" on public.study_notes
for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Owners delete notes" on public.study_notes;
create policy "Owners delete notes" on public.study_notes
for delete to authenticated
using (auth.uid() = user_id);

drop policy if exists "Owners manage document records" on public.study_documents;
create policy "Owners manage document records" on public.study_documents
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Private file bucket. File paths must begin with the owner's auth user id:
-- <auth.uid()>/<document-id>/<filename>
insert into storage.buckets (id, name, public)
values ('study-files', 'study-files', false)
on conflict (id) do update set public = false;

drop policy if exists "Owners read their study files" on storage.objects;
create policy "Owners read their study files" on storage.objects
for select to authenticated
using (
  bucket_id = 'study-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Owners upload their study files" on storage.objects;
create policy "Owners upload their study files" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'study-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Owners update their study files" on storage.objects;
create policy "Owners update their study files" on storage.objects
for update to authenticated
using (
  bucket_id = 'study-files'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'study-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Owners delete their study files" on storage.objects;
create policy "Owners delete their study files" on storage.objects
for delete to authenticated
using (
  bucket_id = 'study-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);
