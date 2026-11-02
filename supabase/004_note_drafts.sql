-- Borradores privados sincronizados entre dispositivos.
-- Ejecutar una vez después de 001_core.sql en Supabase SQL Editor.

create table if not exists public.study_note_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  note_id uuid,
  category_id uuid,
  title text not null default '' check (char_length(title) <= 180),
  body text not null default '',
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_note_drafts_note_owner_fk
    foreign key (note_id, user_id)
    references public.study_notes(id, user_id) on delete cascade,
  constraint study_note_drafts_category_owner_fk
    foreign key (category_id, user_id)
    references public.study_categories(id, user_id) on delete set null (category_id)
);

create unique index if not exists study_note_drafts_note_unique
  on public.study_note_drafts(user_id, note_id) where note_id is not null;
create unique index if not exists study_note_drafts_new_note_unique
  on public.study_note_drafts(user_id) where note_id is null;
create index if not exists study_note_drafts_user_updated_idx
  on public.study_note_drafts(user_id, updated_at desc);

drop trigger if exists study_note_drafts_set_updated_at on public.study_note_drafts;
create trigger study_note_drafts_set_updated_at before update on public.study_note_drafts
for each row execute function public.set_updated_at();

alter table public.study_note_drafts enable row level security;
drop policy if exists "Owners manage their note drafts" on public.study_note_drafts;
create policy "Owners manage their note drafts" on public.study_note_drafts
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.study_note_drafts to authenticated;
