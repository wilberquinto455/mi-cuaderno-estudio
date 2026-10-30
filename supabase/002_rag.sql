-- RAG index for private study notes and uploaded text/PDF documents.
-- Run after 001_core.sql in Supabase SQL Editor.

create extension if not exists vector with schema extensions;
create unique index if not exists study_documents_id_user_unique on public.study_documents(id, user_id);

create table if not exists public.study_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid,
  document_id uuid,
  note_id uuid,
  chunk_index integer not null check (chunk_index >= 0),
  content text not null check (char_length(content) between 1 and 12000),
  embedding extensions.vector(1024) not null,
  created_at timestamptz not null default now(),
  constraint study_chunks_source_check check ((document_id is null) <> (note_id is null)),
  constraint study_chunks_category_owner_fk foreign key (category_id, user_id)
    references public.study_categories(id, user_id) on delete set null (category_id),
  constraint study_chunks_document_owner_fk foreign key (document_id, user_id)
    references public.study_documents(id, user_id) on delete cascade,
  constraint study_chunks_note_owner_fk foreign key (note_id, user_id)
    references public.study_notes(id, user_id) on delete cascade
);

create index if not exists study_chunks_user_idx on public.study_chunks(user_id);
create index if not exists study_chunks_document_idx on public.study_chunks(document_id) where document_id is not null;
create index if not exists study_chunks_note_idx on public.study_chunks(note_id) where note_id is not null;
create index if not exists study_chunks_embedding_idx on public.study_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

alter table public.study_chunks enable row level security;
drop policy if exists "Owners manage their study chunks" on public.study_chunks;
create policy "Owners manage their study chunks" on public.study_chunks
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.match_study_chunks(
  query_embedding extensions.vector(1024),
  match_count integer default 6,
  filter_category_id uuid default null
)
returns table (
  id uuid,
  content text,
  similarity double precision,
  document_id uuid,
  note_id uuid,
  category_id uuid,
  source_title text
)
language sql stable security invoker
set search_path = public, extensions
as $$
  select c.id, c.content, 1 - (c.embedding <=> query_embedding),
         c.document_id, c.note_id, c.category_id,
         coalesce(d.file_name, n.title, 'Apunte') as source_title
  from public.study_chunks c
  left join public.study_documents d on d.id = c.document_id and d.user_id = c.user_id
  left join public.study_notes n on n.id = c.note_id and n.user_id = c.user_id
  where c.user_id = auth.uid()
    and (filter_category_id is null or c.category_id = filter_category_id)
  order by c.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 12);
$$;

grant execute on function public.match_study_chunks(extensions.vector, integer, uuid) to authenticated;
