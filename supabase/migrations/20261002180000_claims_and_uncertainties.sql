-- M9: Claim Table (C#), claim evidence links, claim prompt coverage, the
-- Uncertainty List (U#) and claim conflicts.
--
-- Invariant core, enforced here:
--   - three claim types; a Fact or Inference has >=1 source link with a
--     verbatim excerpt, a Speculation has none (deferred: checked at commit,
--     so a claim and its links go in one transaction)
--   - confidence is set for Fact/Inference (computed by code, R1) and absent
--     for Speculation
--   - claim conflicts: both sides are claims of the evaluation; optional parent
--     source conflict (decision 22)
-- Server-written (service role); analyst actions on claims arrive in M10.

create type public.claim_type as enum ('fact', 'inference', 'speculation');
create type public.claim_confidence as enum ('high', 'medium', 'low');
create type public.uncertainty_status as enum ('open', 'resolved');

-- ---------------------------------------------------------------------------
-- claims
-- ---------------------------------------------------------------------------

create table public.claims (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.funds (id) on delete cascade,
  evaluation_id uuid not null references public.evaluations (id) on delete cascade,
  code text not null check (code ~ '^C[1-9][0-9]*$'),
  run_id uuid references public.pipeline_runs (id) on delete set null,
  statement text not null check (length(trim(statement)) > 0),
  type public.claim_type not null,
  confidence public.claim_confidence,
  confidence_basis jsonb,
  merged_into uuid references public.claims (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  unique (evaluation_id, code),
  constraint confidence_matches_type check ((type = 'speculation') = (confidence is null))
);

create index claims_fund_id_idx on public.claims (fund_id);
create index claims_run_id_idx on public.claims (run_id);
create index claims_merged_into_idx on public.claims (merged_into);

create function private.assign_claim_code()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform 1 from public.evaluations e where e.id = new.evaluation_id for update;
  select 'C' || (count(*) + 1) into new.code from public.claims c where c.evaluation_id = new.evaluation_id;
  return new;
end;
$$;

create trigger assign_claim_code before insert on public.claims
  for each row execute function private.assign_claim_code();
create trigger set_fund_id before insert or update on public.claims
  for each row execute function private.set_fund_id('evaluations', 'evaluation_id');

-- ---------------------------------------------------------------------------
-- claim_sources: the evidence link (S# + verbatim excerpt, R4 offsets)
-- ---------------------------------------------------------------------------

create table public.claim_sources (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.funds (id) on delete cascade,
  claim_id uuid not null references public.claims (id) on delete cascade,
  source_id uuid not null references public.sources (id) on delete cascade,
  excerpt text not null check (length(trim(excerpt)) > 0),
  excerpt_start int not null check (excerpt_start >= 0),
  excerpt_end int not null,
  marked_wrong_by uuid references public.profiles (id) on delete set null,
  marked_wrong_at timestamptz,
  created_at timestamptz not null default now(),
  constraint excerpt_range check (excerpt_end > excerpt_start),
  unique (claim_id, source_id, excerpt_start)
);

create index claim_sources_source_id_idx on public.claim_sources (source_id);
create index claim_sources_fund_id_idx on public.claim_sources (fund_id);
create index claim_sources_marked_wrong_by_idx on public.claim_sources (marked_wrong_by);

-- The source belongs to the claim's evaluation and the offsets lie inside its text.
create function private.check_claim_source()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.claims c join public.sources s on s.evaluation_id = c.evaluation_id
    where c.id = new.claim_id and s.id = new.source_id and new.excerpt_end <= length(s.content_text)
  ) then
    raise exception 'the source must belong to the claim''s evaluation and the excerpt must lie inside its text'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger check_source before insert or update on public.claim_sources
  for each row execute function private.check_claim_source();
create trigger set_fund_id before insert or update on public.claim_sources
  for each row execute function private.set_fund_id('claims', 'claim_id');

-- Deferred: Fact/Inference need >=1 link, Speculation none (checked at commit).
create function private.check_claim_evidence()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- to_jsonb: the same function serves claims (id) and claim_sources (claim_id).
  v_claim_id uuid := case
    when tg_table_name = 'claims' then (to_jsonb(new) ->> 'id')::uuid
    else (coalesce(to_jsonb(new), to_jsonb(old)) ->> 'claim_id')::uuid
  end;
  v_type public.claim_type;
  v_links int;
begin
  select c.type into v_type from public.claims c where c.id = v_claim_id;
  if not found then
    return null; -- claim deleted in the same transaction
  end if;
  select count(*) into v_links from public.claim_sources cs where cs.claim_id = v_claim_id;
  if v_type <> 'speculation' and v_links = 0 then
    raise exception 'a % claim needs at least one source with an excerpt', v_type using errcode = 'check_violation';
  end if;
  if v_type = 'speculation' and v_links > 0 then
    raise exception 'a speculation claim cannot have source links' using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

create constraint trigger claim_evidence after insert or update on public.claims
  deferrable initially deferred
  for each row execute function private.check_claim_evidence();
create constraint trigger claim_evidence after insert or update or delete on public.claim_sources
  deferrable initially deferred
  for each row execute function private.check_claim_evidence();

-- ---------------------------------------------------------------------------
-- claim_prompt_coverage (R2)
-- ---------------------------------------------------------------------------

create table public.claim_prompt_coverage (
  claim_id uuid not null references public.claims (id) on delete cascade,
  prompt_id uuid not null references public.collection_prompts (id) on delete restrict,
  fund_id uuid not null references public.funds (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (claim_id, prompt_id)
);

create index claim_prompt_coverage_prompt_id_idx on public.claim_prompt_coverage (prompt_id);
create index claim_prompt_coverage_fund_id_idx on public.claim_prompt_coverage (fund_id);

create function private.check_claim_coverage_prompt()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.claims c
    join public.evaluations e on e.id = c.evaluation_id
    join public.collection_prompts p on p.config_id = e.config_id
    where c.id = new.claim_id and p.id = new.prompt_id
  ) then
    raise exception 'the Collection Prompt is not part of this evaluation''s configuration'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger check_prompt before insert or update on public.claim_prompt_coverage
  for each row execute function private.check_claim_coverage_prompt();
create trigger set_fund_id before insert or update on public.claim_prompt_coverage
  for each row execute function private.set_fund_id('claims', 'claim_id');

-- ---------------------------------------------------------------------------
-- uncertainties (U#)
-- ---------------------------------------------------------------------------

create table public.uncertainties (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.funds (id) on delete cascade,
  evaluation_id uuid not null references public.evaluations (id) on delete cascade,
  code text not null check (code ~ '^U[1-9][0-9]*$'),
  run_id uuid references public.pipeline_runs (id) on delete set null,
  question text not null check (length(trim(question)) > 0),
  why_unresolved text not null check (length(trim(why_unresolved)) > 0),
  decision_critical boolean not null,
  from_prompt_id uuid references public.collection_prompts (id) on delete restrict,
  min_evidence_to_resolve text,
  status public.uncertainty_status not null default 'open',
  created_at timestamptz not null default now(),
  unique (evaluation_id, code)
);

create index uncertainties_fund_id_idx on public.uncertainties (fund_id);
create index uncertainties_run_id_idx on public.uncertainties (run_id);
create index uncertainties_from_prompt_id_idx on public.uncertainties (from_prompt_id);

create function private.guard_uncertainty()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform 1 from public.evaluations e where e.id = new.evaluation_id for update;
    select 'U' || (count(*) + 1) into new.code from public.uncertainties u where u.evaluation_id = new.evaluation_id;
  end if;
  if new.from_prompt_id is not null and not exists (
    select 1 from public.evaluations e join public.collection_prompts p on p.config_id = e.config_id
    where e.id = new.evaluation_id and p.id = new.from_prompt_id
  ) then
    raise exception 'the Collection Prompt is not part of this evaluation''s configuration'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger guard_uncertainty before insert or update on public.uncertainties
  for each row execute function private.guard_uncertainty();
create trigger set_fund_id before insert or update on public.uncertainties
  for each row execute function private.set_fund_id('evaluations', 'evaluation_id');

-- ---------------------------------------------------------------------------
-- RLS: members read; writes by the server (analyst actions in M10)
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['claims', 'claim_sources', 'claim_prompt_coverage', 'uncertainties'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$
      create policy "members read" on public.%I for select to authenticated
        using (fund_id = (select private.current_fund_id()))
    $p$, t);
    execute format('revoke insert, update, delete on public.%I from authenticated, anon', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Conflicts: claim conflicts are now supported
-- ---------------------------------------------------------------------------

create or replace function private.guard_conflict()
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
    if new.parent_conflict_id is not null then
      raise exception 'only claim conflicts have a parent conflict' using errcode = 'check_violation';
    end if;
  else
    if (select count(*) from public.claims c
        where c.id in (new.side_a_id, new.side_b_id) and c.evaluation_id = new.evaluation_id) <> 2 then
      raise exception 'both sides of a claim conflict must be claims of this evaluation'
        using errcode = 'check_violation';
    end if;
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

-- ---------------------------------------------------------------------------
-- record_claims(): write the run's claims (array order -> C1…Cn) with their
-- evidence links and prompt coverage, the claim conflicts and the
-- prompt-derived uncertainties, and close the run. Service role only.
--   p_claims: [{statement, type, confidence?, confidence_basis?, notes?,
--               sources: [{source_id, excerpt, start, end}], prompt_ids: [uuid]}]
--   p_conflicts: [{a, b, description, passage_a, passage_b, parent_conflict_id?}]
--               a/b are 0-based positions in p_claims
--   p_uncertainties: [{question, why_unresolved, decision_critical,
--               from_prompt_id?, min_evidence_to_resolve?}]
-- ---------------------------------------------------------------------------

create function public.record_claims(
  p_evaluation_id uuid, p_run_id uuid, p_claims jsonb, p_conflicts jsonb, p_uncertainties jsonb,
  p_warnings text[], p_notes text[]
)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item jsonb;
  v_ids uuid[] := '{}';
  v_claim_id uuid;
begin
  if exists (select 1 from public.claims c where c.evaluation_id = p_evaluation_id) then
    raise exception 'this deal already has a Claim Table' using errcode = 'unique_violation';
  end if;

  for v_item in select * from jsonb_array_elements(p_claims)
  loop
    insert into public.claims (evaluation_id, code, run_id, statement, type, confidence, confidence_basis, notes)
    values (
      p_evaluation_id, 'C0', p_run_id, v_item ->> 'statement', (v_item ->> 'type')::public.claim_type,
      (v_item ->> 'confidence')::public.claim_confidence, v_item -> 'confidence_basis', v_item ->> 'notes'
    )
    returning id into v_claim_id;

    insert into public.claim_sources (claim_id, source_id, excerpt, excerpt_start, excerpt_end)
    select v_claim_id, (s ->> 'source_id')::uuid, s ->> 'excerpt', (s ->> 'start')::int, (s ->> 'end')::int
    from jsonb_array_elements(coalesce(v_item -> 'sources', '[]'::jsonb)) s;

    insert into public.claim_prompt_coverage (claim_id, prompt_id)
    select v_claim_id, (p #>> '{}')::uuid
    from jsonb_array_elements(coalesce(v_item -> 'prompt_ids', '[]'::jsonb)) p;

    v_ids := v_ids || v_claim_id;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_conflicts, '[]'::jsonb))
  loop
    insert into public.conflicts (
      evaluation_id, code, kind, side_a_id, side_b_id, description, passage_a, passage_b, parent_conflict_id, run_id
    ) values (
      p_evaluation_id, 'CR0', 'claim',
      v_ids[(v_item ->> 'a')::int + 1], v_ids[(v_item ->> 'b')::int + 1],
      v_item ->> 'description', v_item ->> 'passage_a', v_item ->> 'passage_b',
      (v_item ->> 'parent_conflict_id')::uuid, p_run_id
    );
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_uncertainties, '[]'::jsonb))
  loop
    insert into public.uncertainties (
      evaluation_id, code, run_id, question, why_unresolved, decision_critical, from_prompt_id, min_evidence_to_resolve
    ) values (
      p_evaluation_id, 'U0', p_run_id, v_item ->> 'question', v_item ->> 'why_unresolved',
      (v_item ->> 'decision_critical')::boolean, (v_item ->> 'from_prompt_id')::uuid,
      nullif(trim(v_item ->> 'min_evidence_to_resolve'), '')
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

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function private.assign_claim_code() from public, anon, authenticated;
revoke all on function private.check_claim_source() from public, anon, authenticated;
revoke all on function private.check_claim_evidence() from public, anon, authenticated;
revoke all on function private.check_claim_coverage_prompt() from public, anon, authenticated;
revoke all on function private.guard_uncertainty() from public, anon, authenticated;

revoke all on function public.record_claims(uuid, uuid, jsonb, jsonb, jsonb, text[], text[]) from public, anon, authenticated;
grant execute on function public.record_claims(uuid, uuid, jsonb, jsonb, jsonb, text[], text[]) to service_role;
