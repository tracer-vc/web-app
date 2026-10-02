-- M8: Conflict Register (CR#). Source conflicts come from P4 in step 2b;
-- claim conflicts arrive with claims (M9) and link to a parent source
-- conflict when one exists (decision 22).
--
-- Invariant core: every conflict has a status; it can only leave `open` with a
-- non-empty rationale, who resolved it and when. Both sides belong to the same
-- evaluation and match the conflict's kind.

create type public.conflict_kind as enum ('source', 'claim');
create type public.conflict_status as enum ('open', 'resolved_a', 'resolved_b', 'unresolvable');

create table public.conflicts (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.funds (id) on delete cascade,
  evaluation_id uuid not null references public.evaluations (id) on delete cascade,
  code text not null check (code ~ '^CR[1-9][0-9]*$'),
  kind public.conflict_kind not null,
  side_a_id uuid not null,
  side_b_id uuid not null,
  description text not null check (length(trim(description)) > 0),
  passage_a text not null check (length(trim(passage_a)) > 0),
  passage_b text not null check (length(trim(passage_b)) > 0),
  status public.conflict_status not null default 'open',
  rationale text,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  parent_conflict_id uuid references public.conflicts (id) on delete set null,
  run_id uuid references public.pipeline_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (evaluation_id, code),
  constraint sides_differ check (side_a_id <> side_b_id),
  -- coalesce: a NULL check passes. resolved_by is required when a conflict
  -- leaves `open` (trigger) but may later become null if that profile is deleted.
  constraint resolution_is_explained check (
    status = 'open' or (coalesce(length(trim(rationale)), 0) > 0 and resolved_at is not null)
  )
);

create index conflicts_fund_id_idx on public.conflicts (fund_id);
create index conflicts_side_a_idx on public.conflicts (side_a_id);
create index conflicts_side_b_idx on public.conflicts (side_b_id);
create index conflicts_parent_idx on public.conflicts (parent_conflict_id);
create index conflicts_run_id_idx on public.conflicts (run_id);
create index conflicts_resolved_by_idx on public.conflicts (resolved_by);

-- CR# in insertion order; sides exist in this evaluation and match the kind.
create function private.guard_conflict()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform 1 from public.evaluations e where e.id = new.evaluation_id for update;
    select 'CR' || (count(*) + 1) into new.code
    from public.conflicts c where c.evaluation_id = new.evaluation_id;
  elsif (new.evaluation_id, new.code, new.kind, new.side_a_id, new.side_b_id, new.passage_a, new.passage_b)
        is distinct from (old.evaluation_id, old.code, old.kind, old.side_a_id, old.side_b_id, old.passage_a, old.passage_b) then
    raise exception 'a conflict''s sides and passages cannot change' using errcode = 'check_violation';
  end if;

  if new.status <> 'open' and (tg_op = 'INSERT' or old.status = 'open') and new.resolved_by is null then
    raise exception 'resolving a conflict needs a rationale, who resolved it and when'
      using errcode = 'check_violation';
  end if;

  if new.kind = 'source' then
    if (select count(*) from public.sources s
        where s.id in (new.side_a_id, new.side_b_id) and s.evaluation_id = new.evaluation_id) <> 2 then
      raise exception 'both sides of a source conflict must be sources of this evaluation'
        using errcode = 'check_violation';
    end if;
  else
    raise exception 'claim conflicts are not supported yet' using errcode = 'check_violation';
  end if;

  if new.parent_conflict_id is not null and not exists (
    select 1 from public.conflicts p
    where p.id = new.parent_conflict_id and p.evaluation_id = new.evaluation_id and p.kind = 'source'
  ) then
    raise exception 'a parent conflict must be a source conflict of the same evaluation'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Name order: guard_conflict, then set_fund_id.
create trigger guard_conflict before insert or update on public.conflicts
  for each row execute function private.guard_conflict();
create trigger set_fund_id before insert or update on public.conflicts
  for each row execute function private.set_fund_id('evaluations', 'evaluation_id');

alter table public.conflicts enable row level security;
create policy "members read conflicts" on public.conflicts for select to authenticated
  using (fund_id = (select private.current_fund_id()));
-- Resolution by analysts arrives in M10; until then conflicts are server-written.
revoke insert, update, delete on public.conflicts from authenticated, anon;

-- ---------------------------------------------------------------------------
-- record_sources(): now also records the run's source conflicts (P4).
--   p_conflicts: [{a, b, description, passage_a, passage_b}] where a and b are
--   0-based positions in p_sources.
-- ---------------------------------------------------------------------------

drop function public.record_sources(uuid, uuid, jsonb, text[], text[]);

create function public.record_sources(
  p_evaluation_id uuid, p_run_id uuid, p_sources jsonb, p_conflicts jsonb, p_warnings text[], p_notes text[]
)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item jsonb;
  v_ids uuid[] := '{}';
  v_source_id uuid;
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

    v_ids := v_ids || v_source_id;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_conflicts, '[]'::jsonb))
  loop
    insert into public.conflicts (
      evaluation_id, code, kind, side_a_id, side_b_id, description, passage_a, passage_b, run_id
    ) values (
      p_evaluation_id, 'CR0', 'source',
      v_ids[(v_item ->> 'a')::int + 1], v_ids[(v_item ->> 'b')::int + 1],
      v_item ->> 'description', v_item ->> 'passage_a', v_item ->> 'passage_b', p_run_id
    );
  end loop;

  update public.pipeline_runs
  set status = case when coalesce(array_length(p_warnings, 1), 0) > 0 then 'done_with_warnings' else 'done' end::public.run_status,
      progress = 100, finished_at = now(),
      warnings = coalesce(p_warnings, '{}'), notes = coalesce(p_notes, '{}')
  where id = p_run_id;

  return coalesce(array_length(v_ids, 1), 0);
end;
$$;

revoke all on function private.guard_conflict() from public, anon, authenticated;
revoke all on function public.record_sources(uuid, uuid, jsonb, jsonb, text[], text[]) from public, anon, authenticated;
grant execute on function public.record_sources(uuid, uuid, jsonb, jsonb, text[], text[]) to service_role;
