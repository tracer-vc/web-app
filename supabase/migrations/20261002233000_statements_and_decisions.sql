-- M13: synthesis (step 6). Output documents are rendered from rows:
-- statements written by P12 (Thesis Card) and P13 (Decision Snapshot), each
-- with typed references, and the R3 decision with its rule trace.
--
-- Invariant core (decision 11), checked at commit:
--   * a statement cites >= 1 claim, except the sections open_question and
--     research_agenda, which cite >= 1 uncertainty instead;
--   * a source reference is allowed only if the statement also cites a claim
--     linked to that source;
--   * every reference belongs to the statement's evaluation.

create type public.statement_document as enum ('thesis_card', 'decision_snapshot');
create type public.statement_section as enum (
  'thesis', 'outlier', 'base_case', 'upside_case', 'failure_case', 'moat', 'entry_wedge', 'milestone',
  'falsifier', 'open_question',
  'justification', 'supporting_arg', 'risk', 'research_agenda', 'reeval_trigger'
);
create type public.statement_ref_kind as enum ('claim', 'source', 'uncertainty', 'falsifier');

create table public.statements (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.funds (id) on delete cascade,
  evaluation_id uuid not null references public.evaluations (id) on delete cascade,
  run_id uuid references public.pipeline_runs (id) on delete set null,
  document public.statement_document not null,
  section public.statement_section not null,
  position int not null check (position >= 1),
  text text not null check (length(trim(text)) > 0),
  -- second part of an item: gating variables (base/upside case), dominant
  -- failure mode (failure case), evidence that would resolve it (research agenda)
  detail text,
  created_at timestamptz not null default now(),
  unique (evaluation_id, document, section, position),
  constraint section_fits_document check (
    (document = 'thesis_card' and section in
      ('thesis', 'outlier', 'base_case', 'upside_case', 'failure_case', 'moat', 'entry_wedge', 'milestone', 'falsifier', 'open_question'))
    or (document = 'decision_snapshot' and section in
      ('justification', 'supporting_arg', 'risk', 'research_agenda', 'reeval_trigger'))
  )
);

create index statements_fund_id_idx on public.statements (fund_id);
create index statements_run_id_idx on public.statements (run_id);

create trigger set_fund_id before insert or update on public.statements
  for each row execute function private.set_fund_id('evaluations', 'evaluation_id');

create table public.statement_refs (
  statement_id uuid not null references public.statements (id) on delete cascade,
  ref_kind public.statement_ref_kind not null,
  ref_id uuid not null,
  fund_id uuid not null references public.funds (id) on delete cascade,
  position int not null default 1,
  primary key (statement_id, ref_kind, ref_id)
);

create index statement_refs_ref_idx on public.statement_refs (ref_kind, ref_id);
create index statement_refs_fund_id_idx on public.statement_refs (fund_id);

-- The referenced row exists in the statement's evaluation.
create function private.check_statement_ref()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_evaluation_id uuid;
  v_ok boolean;
begin
  select s.evaluation_id into v_evaluation_id from public.statements s where s.id = new.statement_id;
  v_ok := case new.ref_kind
    when 'claim' then exists (select 1 from public.claims x where x.id = new.ref_id and x.evaluation_id = v_evaluation_id)
    when 'source' then exists (select 1 from public.sources x where x.id = new.ref_id and x.evaluation_id = v_evaluation_id)
    when 'uncertainty' then exists (select 1 from public.uncertainties x where x.id = new.ref_id and x.evaluation_id = v_evaluation_id)
    when 'falsifier' then exists (select 1 from public.falsifiers x where x.id = new.ref_id and x.evaluation_id = v_evaluation_id)
  end;
  if not v_ok then
    raise exception 'a statement can only cite % of its own evaluation', new.ref_kind using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger check_ref before insert or update on public.statement_refs
  for each row execute function private.check_statement_ref();
create trigger set_fund_id before insert or update on public.statement_refs
  for each row execute function private.set_fund_id('statements', 'statement_id');

-- Deferred (at commit): decision 11 and the source-alongside-claim rule.
create function private.check_statement_citations()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_row jsonb := coalesce(to_jsonb(new), to_jsonb(old));
  v_id uuid := case when tg_table_name = 'statements' then v_row ->> 'id' else v_row ->> 'statement_id' end::uuid;
  v_section public.statement_section;
begin
  select s.section into v_section from public.statements s where s.id = v_id;
  if not found then
    return null; -- deleted in the same transaction
  end if;

  if v_section in ('open_question', 'research_agenda') then
    if not exists (select 1 from public.statement_refs r where r.statement_id = v_id and r.ref_kind = 'uncertainty') then
      raise exception 'a % statement must cite at least one uncertainty', v_section using errcode = 'check_violation';
    end if;
  elsif not exists (select 1 from public.statement_refs r where r.statement_id = v_id and r.ref_kind = 'claim') then
    raise exception 'a % statement must cite at least one claim', v_section using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.statement_refs r
    where r.statement_id = v_id and r.ref_kind = 'source'
      and not exists (
        select 1 from public.statement_refs c
        join public.claim_sources cs on cs.claim_id = c.ref_id
        where c.statement_id = v_id and c.ref_kind = 'claim' and cs.source_id = r.ref_id
      )
  ) then
    raise exception 'a source can only be cited next to a claim that cites it' using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

create constraint trigger citations after insert or update on public.statements
  deferrable initially deferred for each row execute function private.check_statement_citations();
create constraint trigger citations after insert or update or delete on public.statement_refs
  deferrable initially deferred for each row execute function private.check_statement_citations();

-- ---------------------------------------------------------------------------
-- decisions: the R3 classification with the trace of which rule fired
-- ---------------------------------------------------------------------------

create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.funds (id) on delete cascade,
  evaluation_id uuid not null unique references public.evaluations (id) on delete cascade,
  run_id uuid references public.pipeline_runs (id) on delete set null,
  classification public.verdict not null,
  rule_trace jsonb not null,
  reeval_trigger text,
  created_at timestamptz not null default now()
);

create index decisions_fund_id_idx on public.decisions (fund_id);
create index decisions_run_id_idx on public.decisions (run_id);

create trigger set_fund_id before insert or update on public.decisions
  for each row execute function private.set_fund_id('evaluations', 'evaluation_id');

-- ---------------------------------------------------------------------------
-- RLS: members read; written by the pipeline (service role)
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['statements', 'statement_refs', 'decisions'] loop
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
-- record_synthesis(): one transaction for step 6. References are codes (C#,
-- S#, U#, F#) resolved within the evaluation; an unknown code fails the whole
-- write. Completes the evaluation. Service role only.
--   p_statements: [{document, section, position, text, detail?,
--                   claim_codes, source_codes, uncertainty_codes, falsifier_codes}]
-- ---------------------------------------------------------------------------

create function public.record_synthesis(
  p_evaluation_id uuid, p_run_id uuid, p_statements jsonb, p_classification public.verdict,
  p_rule_trace jsonb, p_reeval_trigger text, p_warnings text[], p_notes text[]
)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item jsonb;
  v_id uuid;
  v_code text;
  v_target uuid;
  v_kind public.statement_ref_kind;
  v_key text;
  v_n int;
begin
  if exists (select 1 from public.decisions d where d.evaluation_id = p_evaluation_id) then
    raise exception 'this deal already has outputs' using errcode = 'unique_violation';
  end if;

  for v_item in select * from jsonb_array_elements(p_statements)
  loop
    insert into public.statements (evaluation_id, run_id, document, section, position, text, detail)
    values (p_evaluation_id, p_run_id, (v_item ->> 'document')::public.statement_document,
            (v_item ->> 'section')::public.statement_section, (v_item ->> 'position')::int,
            v_item ->> 'text', nullif(trim(v_item ->> 'detail'), ''))
    returning id into v_id;

    foreach v_key in array array['claim_codes', 'source_codes', 'uncertainty_codes', 'falsifier_codes'] loop
      v_kind := (case v_key when 'claim_codes' then 'claim' when 'source_codes' then 'source'
                 when 'uncertainty_codes' then 'uncertainty' else 'falsifier' end)::public.statement_ref_kind;
      v_n := 0;
      for v_code in select jsonb_array_elements_text(coalesce(v_item -> v_key, '[]'::jsonb))
      loop
        v_target := case v_kind
          when 'claim' then (select x.id from public.claims x where x.evaluation_id = p_evaluation_id and x.code = v_code)
          when 'source' then (select x.id from public.sources x where x.evaluation_id = p_evaluation_id and x.code = v_code)
          when 'uncertainty' then (select x.id from public.uncertainties x where x.evaluation_id = p_evaluation_id and x.code = v_code)
          else (select x.id from public.falsifiers x where x.evaluation_id = p_evaluation_id and x.code = v_code)
        end;
        if v_target is null then
          raise exception 'unknown % %', v_kind, v_code using errcode = 'check_violation';
        end if;
        v_n := v_n + 1;
        insert into public.statement_refs (statement_id, ref_kind, ref_id, position)
        values (v_id, v_kind, v_target, v_n) on conflict do nothing;
      end loop;
    end loop;
  end loop;

  insert into public.decisions (evaluation_id, run_id, classification, rule_trace, reeval_trigger)
  values (p_evaluation_id, p_run_id, p_classification, p_rule_trace, nullif(trim(p_reeval_trigger), ''));

  update public.evaluations set status = 'complete' where id = p_evaluation_id;

  update public.pipeline_runs
  set status = case when coalesce(array_length(p_warnings, 1), 0) > 0 then 'done_with_warnings' else 'done' end::public.run_status,
      progress = 100, finished_at = now(),
      warnings = coalesce(p_warnings, '{}'), notes = coalesce(p_notes, '{}')
  where id = p_run_id;

  return jsonb_array_length(p_statements);
end;
$$;

revoke all on function private.check_statement_ref() from public, anon, authenticated;
revoke all on function private.check_statement_citations() from public, anon, authenticated;

revoke all on function public.record_synthesis(uuid, uuid, jsonb, public.verdict, jsonb, text, text[], text[]) from public, anon, authenticated;
grant execute on function public.record_synthesis(uuid, uuid, jsonb, public.verdict, jsonb, text, text[], text[]) to service_role;
