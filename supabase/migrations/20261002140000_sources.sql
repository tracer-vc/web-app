-- M7: Source Table (S#) built from the uploads by a background run (Inngest).
--
-- Who writes what:
--   server (service role): sources + prompt coverage (record_sources), run
--             progress/warnings/notes
--   analysts: tier and party of a source only (decision 23), logged by trigger
--
-- Once sources exist, or a Source Table run is active, the deal's documents
-- and the uploads-only switch are frozen ("delete only before 2b ran").

create type public.source_origin as enum ('upload', 'web');

-- ---------------------------------------------------------------------------
-- pipeline_runs: warnings (failures that don't fail the run, decision 25) and
-- notes (informational, e.g. skipped as not relevant); one active run per step
-- ---------------------------------------------------------------------------

alter table public.pipeline_runs
  add column warnings text[] not null default '{}',
  add column notes text[] not null default '{}';

create unique index pipeline_runs_one_active_per_step
  on public.pipeline_runs (evaluation_id, step) where status in ('queued', 'running');

-- ---------------------------------------------------------------------------
-- sources
-- ---------------------------------------------------------------------------

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.funds (id) on delete cascade,
  evaluation_id uuid not null references public.evaluations (id) on delete cascade,
  code text not null check (code ~ '^S[1-9][0-9]*$'),
  run_id uuid references public.pipeline_runs (id) on delete set null,
  -- cascade: documents can't be deleted once sources exist, except in fund/deal cascades
  document_id uuid references public.documents (id) on delete cascade,
  origin public.source_origin not null,
  title text not null check (length(trim(title)) > 0),
  url text,
  tier public.source_tier not null,
  party text not null check (length(trim(party)) > 0),
  published_at date,
  accessed_at date not null default current_date,
  relevance_note text not null default '',
  content_text text not null check (length(trim(content_text)) > 0),
  created_at timestamptz not null default now(),
  unique (evaluation_id, code),
  constraint upload_has_document check (origin <> 'upload' or document_id is not null),
  constraint web_has_url check (origin <> 'web' or coalesce(length(trim(url)), 0) > 0)
);

create index sources_fund_id_idx on public.sources (fund_id);
create index sources_run_id_idx on public.sources (run_id);
create index sources_document_id_idx on public.sources (document_id);

-- S# in insertion order, gap-free per evaluation.
create function private.assign_source_code()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform 1 from public.evaluations e where e.id = new.evaluation_id for update;
  select 'S' || (count(*) + 1) into new.code
  from public.sources s where s.evaluation_id = new.evaluation_id;
  return new;
end;
$$;

-- Analysts may change tier and party only; every change is logged.
create function private.log_source_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.tier, new.party) is distinct from (old.tier, old.party) then
    insert into public.analyst_actions (fund_id, actor_id, action, target_table, target_id, before, after)
    values (
      new.fund_id, auth.uid(), 'source.edited', 'sources', new.id,
      jsonb_build_object('code', old.code, 'tier', old.tier, 'party', old.party),
      jsonb_build_object('code', new.code, 'tier', new.tier, 'party', new.party)
    );
  end if;
  return new;
end;
$$;

-- Name order: assign_source_code, then set_fund_id.
create trigger assign_source_code before insert on public.sources
  for each row execute function private.assign_source_code();
create trigger set_fund_id before insert or update on public.sources
  for each row execute function private.set_fund_id('evaluations', 'evaluation_id');
create trigger log_edit after update on public.sources
  for each row execute function private.log_source_edit();

alter table public.sources enable row level security;
create policy "members read sources" on public.sources for select to authenticated
  using (fund_id = (select private.current_fund_id()));
create policy "members edit tier and party" on public.sources for update to authenticated
  using (fund_id = (select private.current_fund_id()))
  with check (fund_id = (select private.current_fund_id()));

revoke insert, update, delete on public.sources from authenticated, anon;
grant update (tier, party) on public.sources to authenticated;

-- ---------------------------------------------------------------------------
-- source_prompt_coverage: which Collection Prompts a source can inform (P2)
-- ---------------------------------------------------------------------------

create table public.source_prompt_coverage (
  source_id uuid not null references public.sources (id) on delete cascade,
  prompt_id uuid not null references public.collection_prompts (id) on delete restrict,
  fund_id uuid not null references public.funds (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (source_id, prompt_id)
);

create index source_prompt_coverage_prompt_id_idx on public.source_prompt_coverage (prompt_id);
create index source_prompt_coverage_fund_id_idx on public.source_prompt_coverage (fund_id);

-- The prompt must belong to the evaluation's pinned configuration.
create function private.check_coverage_prompt()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.sources s
    join public.evaluations e on e.id = s.evaluation_id
    join public.collection_prompts p on p.config_id = e.config_id
    where s.id = new.source_id and p.id = new.prompt_id
  ) then
    raise exception 'the Collection Prompt is not part of this evaluation''s configuration'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger check_prompt before insert or update on public.source_prompt_coverage
  for each row execute function private.check_coverage_prompt();
create trigger set_fund_id before insert or update on public.source_prompt_coverage
  for each row execute function private.set_fund_id('sources', 'source_id');

alter table public.source_prompt_coverage enable row level security;
create policy "members read coverage" on public.source_prompt_coverage for select to authenticated
  using (fund_id = (select private.current_fund_id()));

-- ---------------------------------------------------------------------------
-- Freeze documents and uploads_only once the Source Table is started
-- ---------------------------------------------------------------------------

create function private.source_table_started(p_evaluation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.sources s where s.evaluation_id = p_evaluation_id)
      or exists (
        select 1 from public.pipeline_runs r
        where r.evaluation_id = p_evaluation_id and r.step = 2 and r.status in ('queued', 'running')
      );
$$;

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
  if tg_op = 'UPDATE' and (new.storage_path, new.evaluation_id, new.fund_id)
     is distinct from (old.storage_path, old.evaluation_id, old.fund_id) then
    raise exception 'a document''s file and deal cannot change' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create or replace function private.guard_evaluation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if not exists (
      select 1 from public.framework_configs c
      where c.id = new.config_id and c.fund_id = new.fund_id
        and c.status = 'published' and c.is_active
    ) then
      raise exception 'an evaluation must use its fund''s active published configuration'
        using errcode = 'check_violation';
    end if;
  else
    if new.company_id is distinct from old.company_id
       or new.config_id is distinct from old.config_id
       or new.fund_id is distinct from old.fund_id
       or new.evaluator_id is distinct from old.evaluator_id and new.evaluator_id is not null then
      raise exception 'company, configuration, fund and evaluator of an evaluation cannot change'
        using errcode = 'check_violation';
    end if;
    if new.uploads_only is distinct from old.uploads_only
       and (not private.is_quick_screen_status(old.status) or private.source_table_started(old.id)) then
      raise exception 'the uploads-only switch can only change before the Source Table is built'
        using errcode = 'check_violation';
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- record_sources(): write the run's sources (in array order -> S1…Sn) and
-- their prompt coverage, and close the run. Service role only.
--   p_sources: [{document_id?, origin, title, url?, tier, party, published_at?,
--               accessed_at, relevance_note, content_text, prompt_ids: [uuid]}]
-- ---------------------------------------------------------------------------

create function public.record_sources(
  p_evaluation_id uuid, p_run_id uuid, p_sources jsonb, p_warnings text[], p_notes text[]
)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item jsonb;
  v_source_id uuid;
  v_count int := 0;
begin
  if exists (select 1 from public.sources s where s.evaluation_id = p_evaluation_id) then
    raise exception 'this deal already has a Source Table' using errcode = 'unique_violation';
  end if;

  for v_item in select * from jsonb_array_elements(p_sources)
  loop
    insert into public.sources (
      evaluation_id, code, run_id, document_id, origin, title, url, tier, party,
      published_at, accessed_at, relevance_note, content_text
    ) values (
      p_evaluation_id, 'S0', p_run_id, (v_item ->> 'document_id')::uuid,
      (v_item ->> 'origin')::public.source_origin, v_item ->> 'title', nullif(v_item ->> 'url', ''),
      (v_item ->> 'tier')::public.source_tier, v_item ->> 'party',
      (v_item ->> 'published_at')::date, coalesce((v_item ->> 'accessed_at')::date, current_date),
      coalesce(v_item ->> 'relevance_note', ''), v_item ->> 'content_text'
    )
    returning id into v_source_id;

    insert into public.source_prompt_coverage (source_id, prompt_id)
    select v_source_id, (p #>> '{}')::uuid
    from jsonb_array_elements(coalesce(v_item -> 'prompt_ids', '[]'::jsonb)) p;

    v_count := v_count + 1;
  end loop;

  update public.pipeline_runs
  set status = case when coalesce(array_length(p_warnings, 1), 0) > 0 then 'done_with_warnings' else 'done' end::public.run_status,
      progress = 100, finished_at = now(),
      warnings = coalesce(p_warnings, '{}'), notes = coalesce(p_notes, '{}')
  where id = p_run_id;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function private.assign_source_code() from public, anon, authenticated;
revoke all on function private.log_source_edit() from public, anon, authenticated;
revoke all on function private.check_coverage_prompt() from public, anon, authenticated;
revoke all on function private.source_table_started(uuid) from public, anon, authenticated;
-- Called from document/evaluation triggers that run as the invoking user.
grant execute on function private.source_table_started(uuid) to authenticated, service_role;

revoke all on function public.record_sources(uuid, uuid, jsonb, text[], text[]) from public, anon, authenticated;
grant execute on function public.record_sources(uuid, uuid, jsonb, text[], text[]) to service_role;
