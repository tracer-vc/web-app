-- Documents, storage and AI-drafted Quick Screen answers (decision 34).
--
-- Materials are uploaded at the start of a deal; the AI drafts the Quick
-- Screen answers from their extracted text with verbatim excerpts; the
-- analyst reviews/edits; P1 writes the memo. The same documents feed
-- Evidence Collection later (M7).
--
-- Who writes what:
--   analysts: upload files (storage), register documents (metadata only),
--             delete documents while the deal is in the Quick Screen phase
--   server (service role): extracted text + status, drafted answers, citations

create type public.extraction_status as enum ('pending', 'extracted', 'no_text', 'failed');
create type public.answer_origin as enum ('analyst', 'ai');

-- ---------------------------------------------------------------------------
-- documents
-- ---------------------------------------------------------------------------

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.funds (id) on delete cascade,
  evaluation_id uuid not null references public.evaluations (id) on delete cascade,
  storage_path text not null unique,
  filename text not null check (length(trim(filename)) > 0),
  mime_type text not null,
  bytes int not null check (bytes > 0 and bytes <= 20971520), -- 20 MB (decision 24)
  extracted_text text,
  extraction_status public.extraction_status not null default 'pending',
  extraction_error text,
  uploaded_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index documents_evaluation_id_idx on public.documents (evaluation_id, created_at);
create index documents_fund_id_idx on public.documents (fund_id);
create index documents_uploaded_by_idx on public.documents (uploaded_by);

-- Path {fund_id}/{evaluation_id}/{document_id}.{ext}; at most 20 documents
-- per evaluation; uploads and deletes only during the Quick Screen phase.
create function private.guard_document()
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
    if private.fund_is_deleted(old.fund_id) then
      return old;
    end if;
    if v_status is not null and not private.is_quick_screen_status(v_status) then
      raise exception 'documents can only be removed before Evidence Collection starts'
        using errcode = 'check_violation';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if not private.is_quick_screen_status(v_status) then
      raise exception 'documents can only be added before Evidence Collection starts'
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
  if tg_op = 'UPDATE' and (new.storage_path, new.evaluation_id, new.fund_id)
     is distinct from (old.storage_path, old.evaluation_id, old.fund_id) then
    raise exception 'a document''s file and deal cannot change' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Name order: set_fund_id runs before validate_document.
create trigger set_fund_id before insert or update on public.documents
  for each row execute function private.set_fund_id('evaluations', 'evaluation_id');
create trigger validate_document before insert or update or delete on public.documents
  for each row execute function private.guard_document();

alter table public.documents enable row level security;

create policy "members read documents" on public.documents for select to authenticated
  using (fund_id = (select private.current_fund_id()));
create policy "members register documents" on public.documents for insert to authenticated
  with check (
    fund_id = (select private.current_fund_id())
    and uploaded_by = (select auth.uid())
    and extraction_status = 'pending'
    and extracted_text is null
  );
create policy "members delete documents" on public.documents for delete to authenticated
  using (fund_id = (select private.current_fund_id()));

-- Users register metadata only; extracted text and status are server-written.
revoke insert, update on public.documents from authenticated, anon;
grant insert (id, evaluation_id, fund_id, storage_path, filename, mime_type, bytes) on public.documents to authenticated;

-- ---------------------------------------------------------------------------
-- Storage bucket deal-documents (private, 20 MB, policies mirror evaluations)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'deal-documents', 'deal-documents', false, 20971520,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/html',
    'text/plain',
    'text/markdown'
  ]
);

-- {fund_id}/{evaluation_id}/… where the evaluation is visible to the caller
-- (RLS on evaluations limits that to the caller's fund).
create function private.can_access_deal_path(p_name text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.evaluations e
    where e.id::text = split_part(p_name, '/', 2)
      and e.fund_id::text = split_part(p_name, '/', 1)
  );
$$;

create policy "members read deal documents" on storage.objects for select to authenticated
  using (bucket_id = 'deal-documents' and private.can_access_deal_path(name));
create policy "members upload deal documents" on storage.objects for insert to authenticated
  with check (bucket_id = 'deal-documents' and private.can_access_deal_path(name));
create policy "members delete deal documents" on storage.objects for delete to authenticated
  using (bucket_id = 'deal-documents' and private.can_access_deal_path(name));

-- ---------------------------------------------------------------------------
-- Quick Screen answers: AI drafts with citations (decision 34)
-- ---------------------------------------------------------------------------

alter table public.quick_screen_answers
  add column origin public.answer_origin not null default 'analyst',
  add column ai_answer text,
  add column found_in_materials boolean,
  add column updated_at timestamptz not null default now(),
  add constraint ai_answer_matches_origin
    check ((origin = 'ai') = (ai_answer is not null and found_in_materials is not null));

create table public.quick_screen_answer_citations (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.funds (id) on delete cascade,
  answer_id uuid not null references public.quick_screen_answers (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  excerpt text not null check (length(trim(excerpt)) > 0),
  created_at timestamptz not null default now()
);

create index quick_screen_answer_citations_answer_id_idx on public.quick_screen_answer_citations (answer_id);
create index quick_screen_answer_citations_document_id_idx on public.quick_screen_answer_citations (document_id);
create index quick_screen_answer_citations_fund_id_idx on public.quick_screen_answer_citations (fund_id);

create trigger set_fund_id before insert or update on public.quick_screen_answer_citations
  for each row execute function private.set_fund_id('quick_screen_answers', 'answer_id');

alter table public.quick_screen_answer_citations enable row level security;
create policy "members read citations" on public.quick_screen_answer_citations for select to authenticated
  using (fund_id = (select private.current_fund_id()));

-- record_quick_screen_drafts(): replace all answers with the AI's drafts and
-- their citations. Service role only (LLM output). Excerpts were checked
-- against the documents' extracted text by the caller.
--   p_drafts: [{question_id, answer, found, citations: [{document_id, excerpt}]}]
create function public.record_quick_screen_drafts(p_evaluation_id uuid, p_run_id uuid, p_drafts jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status public.evaluation_status;
  v_draft jsonb;
  v_answer_id uuid;
begin
  select e.status into v_status from public.evaluations e where e.id = p_evaluation_id for update;
  if not found then
    raise exception 'evaluation % not found', p_evaluation_id using errcode = 'no_data_found';
  end if;
  if not private.is_quick_screen_status(v_status) then
    raise exception 'the Quick Screen can only be redone before Evidence Collection starts'
      using errcode = 'check_violation';
  end if;

  delete from public.quick_screen_answers where evaluation_id = p_evaluation_id;

  for v_draft in select * from jsonb_array_elements(p_drafts)
  loop
    insert into public.quick_screen_answers (
      evaluation_id, question_id, answer, origin, ai_answer, found_in_materials
    ) values (
      p_evaluation_id, (v_draft ->> 'question_id')::uuid, v_draft ->> 'answer', 'ai',
      v_draft ->> 'answer', (v_draft ->> 'found')::boolean
    )
    returning id into v_answer_id;

    insert into public.quick_screen_answer_citations (answer_id, document_id, excerpt)
    select v_answer_id, (c ->> 'document_id')::uuid, c ->> 'excerpt'
    from jsonb_array_elements(coalesce(v_draft -> 'citations', '[]'::jsonb)) c;
  end loop;

  update public.pipeline_runs
  set status = 'done', progress = 100, finished_at = now(), error = null
  where id = p_run_id;
end;
$$;

-- record_quick_screen(): as before, but answers are upserted so AI drafts keep
-- their original text and citations when the analyst edits them.
create or replace function public.record_quick_screen(
  p_evaluation_id uuid, p_run_id uuid, p_llm_call_id uuid, p_answers jsonb, p_memo jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status public.evaluation_status;
begin
  select e.status into v_status from public.evaluations e where e.id = p_evaluation_id for update;
  if not found then
    raise exception 'evaluation % not found', p_evaluation_id using errcode = 'no_data_found';
  end if;
  if not private.is_quick_screen_status(v_status) then
    raise exception 'the Quick Screen can only be redone before Evidence Collection starts'
      using errcode = 'check_violation';
  end if;

  delete from public.quick_screen_answers a
  where a.evaluation_id = p_evaluation_id
    and a.question_id not in (select (x ->> 'question_id')::uuid from jsonb_array_elements(p_answers) x);

  insert into public.quick_screen_answers (evaluation_id, question_id, answer)
  select p_evaluation_id, (a ->> 'question_id')::uuid, a ->> 'answer'
  from jsonb_array_elements(p_answers) a
  on conflict (evaluation_id, question_id) do update
    set answer = excluded.answer,
        updated_at = case when quick_screen_answers.answer is distinct from excluded.answer
                          then now() else quick_screen_answers.updated_at end;

  delete from public.quick_screen_memos where evaluation_id = p_evaluation_id;
  insert into public.quick_screen_memos (
    evaluation_id, llm_call_id, preliminary_thesis, verdict, original_verdict, justification,
    uncertainties, reopen_condition, gating_variable, reeval_trigger
  ) values (
    p_evaluation_id, p_llm_call_id, p_memo ->> 'thesis',
    (p_memo ->> 'verdict')::public.verdict, (p_memo ->> 'verdict')::public.verdict,
    p_memo ->> 'justification',
    array(select jsonb_array_elements_text(p_memo -> 'uncertainties')),
    nullif(trim(p_memo ->> 'reopen_condition'), ''),
    nullif(trim(p_memo ->> 'gating_variable'), ''),
    nullif(trim(p_memo ->> 'reeval_trigger'), '')
  );

  update public.pipeline_runs
  set status = 'done', progress = 100, finished_at = now(), error = null
  where id = p_run_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function private.guard_document() from public, anon, authenticated;
revoke all on function private.can_access_deal_path(text) from public, anon, authenticated;
-- Used by storage policies, evaluated as the calling user.
grant execute on function private.can_access_deal_path(text) to authenticated, service_role;

revoke all on function public.record_quick_screen_drafts(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_quick_screen_drafts(uuid, uuid, jsonb) to service_role;
