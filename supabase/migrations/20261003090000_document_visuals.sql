-- Visual content of uploaded documents (decision 45, replaces decision 7).
--
-- After text extraction, a background job reads PDF pages, images in
-- PPTX/DOCX and uploaded images with the fund's model, and reads native
-- PowerPoint/Word charts from their data. Informative content is appended to
-- the document's text as labelled blocks, so claims can cite it verbatim (R4
-- unchanged); document_visuals records each block's position in the text and
-- the stored image, so the trace shows where an excerpt came from.
-- Document text only grows by appending, and is frozen once a Source Table
-- exists (sources copy it).

create type public.visual_status as enum ('none', 'pending', 'running', 'done', 'failed');
create type public.visual_kind as enum ('page', 'image', 'chart');

alter table public.documents
  add column visual_status public.visual_status not null default 'none',
  add column visual_error text,
  add column visual_summary text;

create table public.document_visuals (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.funds (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  position int not null check (position >= 1),
  kind public.visual_kind not null,
  locator text not null check (length(trim(locator)) > 0), -- "Page 3", "Slide 5 · image 2", "Slide 4 · chart"
  storage_path text,  -- the image as read (none for charts read from data)
  mime_type text,
  informative boolean not null,
  transcription text,
  text_start int,     -- code-point offsets of the block body in documents.extracted_text
  text_end int,
  llm_call_id uuid references public.llm_calls (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (document_id, position),
  constraint informative_has_block check (
    informative = (transcription is not null and text_start is not null and text_end is not null)
  ),
  constraint block_range check (text_end is null or text_end > text_start),
  constraint chart_has_no_image check (kind <> 'chart' or storage_path is null)
);

create index document_visuals_fund_id_idx on public.document_visuals (fund_id);
create index document_visuals_llm_call_id_idx on public.document_visuals (llm_call_id);

-- The stored image lives next to the document; the block lies inside the text.
create function private.guard_document_visual()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_doc public.documents%rowtype;
begin
  select * into v_doc from public.documents d where d.id = new.document_id;
  if new.storage_path is not null
     and new.storage_path not like v_doc.fund_id::text || '/' || v_doc.evaluation_id::text || '/visuals/' || v_doc.id::text || '/%' then
    raise exception 'visual images are stored under {fund_id}/{evaluation_id}/visuals/{document_id}/'
      using errcode = 'check_violation';
  end if;
  if new.text_end is not null and new.text_end > length(coalesce(v_doc.extracted_text, '')) then
    raise exception 'a visual block must lie inside the document text' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Name order: guard_document_visual, then set_fund_id.
create trigger guard_document_visual before insert or update on public.document_visuals
  for each row execute function private.guard_document_visual();
create trigger set_fund_id before insert or update on public.document_visuals
  for each row execute function private.set_fund_id('documents', 'document_id');

alter table public.document_visuals enable row level security;
create policy "members read document visuals" on public.document_visuals for select to authenticated
  using (fund_id = (select private.current_fund_id()));
revoke insert, update, delete on public.document_visuals from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Documents: as before, plus the text is frozen once the Source Table exists.
-- ---------------------------------------------------------------------------

create or replace function private.guard_document()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status public.evaluation_status;
begin
  select e.status into v_status from public.evaluations e
  where e.id = coalesce(new.evaluation_id, old.evaluation_id);

  if tg_op = 'DELETE' then
    -- Cascades from deleting the evaluation or the whole fund are allowed.
    if private.fund_is_deleted(old.fund_id) or v_status is null then
      return old;
    end if;
    if not private.is_quick_screen_status(v_status) or private.source_table_started(old.evaluation_id) then
      raise exception 'documents can only be removed before the Source Table is built'
        using errcode = 'check_violation';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if not private.is_quick_screen_status(v_status) or private.source_table_started(new.evaluation_id) then
      raise exception 'documents can only be added before the Source Table is built'
        using errcode = 'check_violation';
    end if;
    perform 1 from public.evaluations e where e.id = new.evaluation_id for update;
    if (select count(*) from public.documents d where d.evaluation_id = new.evaluation_id) >= 20 then
      raise exception 'a deal can have at most 20 documents' using errcode = 'check_violation';
    end if;
  end if;

  if new.storage_path not like new.fund_id::text || '/' || new.evaluation_id::text || '/' || new.id::text || '.%' then
    raise exception 'storage path must be {fund_id}/{evaluation_id}/{document_id}.{ext}'
      using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' then
    if (new.storage_path, new.evaluation_id, new.fund_id) is distinct from (old.storage_path, old.evaluation_id, old.fund_id) then
      raise exception 'a document''s file and deal cannot change' using errcode = 'check_violation';
    end if;
    if new.extracted_text is distinct from old.extracted_text and private.source_table_started(new.evaluation_id) then
      raise exception 'a document''s text cannot change once the Source Table is built' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- record_document_visuals(): append the visual section to the document text,
-- store one row per page/image/chart and close the job, in one transaction.
-- p_text is the document's full new text and must start with the current
-- text (append only). Service role only.
--   p_visuals: [{position, kind, locator, storage_path?, mime_type?, informative,
--                transcription?, text_start?, text_end?, llm_call_id?}]
-- ---------------------------------------------------------------------------

create function public.record_document_visuals(
  p_document_id uuid, p_text text, p_visuals jsonb, p_status public.visual_status, p_error text, p_summary text
)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_doc public.documents%rowtype;
  v_item jsonb;
begin
  select * into v_doc from public.documents d where d.id = p_document_id for update;
  if not found then
    raise exception 'document not found' using errcode = 'no_data_found';
  end if;
  if not starts_with(coalesce(p_text, ''), coalesce(v_doc.extracted_text, '')) then
    raise exception 'visual content can only be appended to the document text' using errcode = 'check_violation';
  end if;

  update public.documents
  set extracted_text = nullif(p_text, ''),
      extraction_status = case
        when length(trim(coalesce(p_text, ''))) > 0 and extraction_status in ('no_text', 'pending') then 'extracted'::public.extraction_status
        else extraction_status end,
      visual_status = p_status, visual_error = p_error, visual_summary = p_summary
  where id = p_document_id;

  delete from public.document_visuals where document_id = p_document_id;
  for v_item in select * from jsonb_array_elements(coalesce(p_visuals, '[]'::jsonb))
  loop
    insert into public.document_visuals (
      document_id, position, kind, locator, storage_path, mime_type, informative, transcription, text_start, text_end, llm_call_id
    ) values (
      p_document_id, (v_item ->> 'position')::int, (v_item ->> 'kind')::public.visual_kind, v_item ->> 'locator',
      v_item ->> 'storage_path', v_item ->> 'mime_type', (v_item ->> 'informative')::boolean, v_item ->> 'transcription',
      (v_item ->> 'text_start')::int, (v_item ->> 'text_end')::int, (v_item ->> 'llm_call_id')::uuid
    );
  end loop;
  return jsonb_array_length(coalesce(p_visuals, '[]'::jsonb));
end;
$$;

revoke all on function private.guard_document_visual() from public, anon, authenticated;
revoke all on function public.record_document_visuals(uuid, text, jsonb, public.visual_status, text, text) from public, anon, authenticated;
grant execute on function public.record_document_visuals(uuid, text, jsonb, public.visual_status, text, text) to service_role;

-- Uploaded images (and the images the job stores) are allowed in the bucket.
update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/html',
  'text/plain',
  'text/markdown',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif'
]
where id = 'deal-documents';
