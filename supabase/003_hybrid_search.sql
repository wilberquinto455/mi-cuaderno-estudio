-- Mejora la recuperación del RAG combinando similitud semántica y coincidencia
-- de palabras. Ejecutar una vez después de 002_rag.sql en Supabase SQL Editor.

create index if not exists study_chunks_content_fts_idx
  on public.study_chunks using gin (to_tsvector('simple', content));

create or replace function public.match_study_chunks_hybrid(
  query_embedding extensions.vector(1024),
  query_text text,
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
  source_title text,
  keyword_match boolean
)
language sql stable security invoker
set search_path = public, extensions
as $$
  with search_query as (
    select websearch_to_tsquery('simple', coalesce(query_text, '')) as terms
  ), ranked as (
    select c.id, c.content,
           1 - (c.embedding <=> query_embedding) as semantic_score,
           to_tsvector('simple', c.content) @@ q.terms as has_keyword,
           ts_rank_cd(to_tsvector('simple', c.content), q.terms) as text_score,
           c.document_id, c.note_id, c.category_id,
           coalesce(d.file_name, n.title, 'Apunte') as title
    from public.study_chunks c
    cross join search_query q
    left join public.study_documents d on d.id = c.document_id and d.user_id = c.user_id
    left join public.study_notes n on n.id = c.note_id and n.user_id = c.user_id
    where c.user_id = auth.uid()
      and (filter_category_id is null or c.category_id = filter_category_id)
  )
  select r.id, r.content,
         greatest(r.semantic_score, case when r.has_keyword then 0.25 + least(r.text_score, 0.5) else 0 end),
         r.document_id, r.note_id, r.category_id, r.title, r.has_keyword
  from ranked r
  where r.semantic_score >= 0.12 or r.has_keyword
  order by (r.semantic_score + case when r.has_keyword then 0.25 + least(r.text_score, 0.5) else 0 end) desc
  limit least(greatest(match_count, 1), 12);
$$;

grant execute on function public.match_study_chunks_hybrid(extensions.vector, text, integer, uuid) to authenticated;
