-- M11: counter-case (P8), Uncertainty List additions (P9) and falsifiers (P10).
--
-- Invariant core: every counter argument and every falsifier cites at least
-- one claim (decision 11), checked at commit by deferred constraint triggers;
-- every link stays within one evaluation. Codes: F# per evaluation; U#
-- continues after the step-3 uncertainties.

-- ---------------------------------------------------------------------------
-- counter_arguments: the three strongest arguments against, ranked (decision 18)
-- ---------------------------------------------------------------------------

create table public.counter_arguments (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.funds (id) on delete cascade,
  evaluation_id uuid not null references public.evaluations (id) on delete cascade,
  run_id uuid references public.pipeline_runs (id) on delete set null,
  rank int not null check (rank between 1 and 3),
  -- the Counter-Case Prompt it answers (ui_design: prompt -> argument -> mechanism -> C#)
  counter_case_prompt_id uuid references public.counter_case_prompts (id) on delete restrict,
  argument text not null check (length(trim(argument)) > 0),
  mechanism text not null check (length(trim(mechanism)) > 0),
  created_at timestamptz not null default now(),
  unique (evaluation_id, rank)
);

create index counter_arguments_fund_id_idx on public.counter_arguments (fund_id);
create index counter_arguments_run_id_idx on public.counter_arguments (run_id);
create index counter_arguments_prompt_idx on public.counter_arguments (counter_case_prompt_id);

create function private.check_counter_argument_prompt()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.counter_case_prompt_id is not null and not exists (
    select 1 from public.evaluations e join public.counter_case_prompts p on p.config_id = e.config_id
    where e.id = new.evaluation_id and p.id = new.counter_case_prompt_id
  ) then
    raise exception 'the Counter-Case Prompt is not part of this evaluation''s configuration'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger check_prompt before insert or update on public.counter_arguments
  for each row execute function private.check_counter_argument_prompt();
create trigger set_fund_id before insert or update on public.counter_arguments
  for each row execute function private.set_fund_id('evaluations', 'evaluation_id');

-- ---------------------------------------------------------------------------
-- falsifiers (F#)
-- ---------------------------------------------------------------------------

create table public.falsifiers (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.funds (id) on delete cascade,
  evaluation_id uuid not null references public.evaluations (id) on delete cascade,
  code text not null check (code ~ '^F[1-9][0-9]*$'),
  run_id uuid references public.pipeline_runs (id) on delete set null,
  criterion text not null check (length(trim(criterion)) > 0),
  outcome_check text not null check (length(trim(outcome_check)) > 0),
  created_at timestamptz not null default now(),
  unique (evaluation_id, code)
);

create index falsifiers_fund_id_idx on public.falsifiers (fund_id);
create index falsifiers_run_id_idx on public.falsifiers (run_id);

create function private.assign_falsifier_code()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform 1 from public.evaluations e where e.id = new.evaluation_id for update;
  select 'F' || (count(*) + 1) into new.code from public.falsifiers f where f.evaluation_id = new.evaluation_id;
  return new;
end;
$$;

-- Name order: assign_falsifier_code, then set_fund_id.
create trigger assign_falsifier_code before insert on public.falsifiers
  for each row execute function private.assign_falsifier_code();
create trigger set_fund_id before insert or update on public.falsifiers
  for each row execute function private.set_fund_id('evaluations', 'evaluation_id');

-- ---------------------------------------------------------------------------
-- Citation links
-- ---------------------------------------------------------------------------

create table public.counter_argument_claims (
  argument_id uuid not null references public.counter_arguments (id) on delete cascade,
  claim_id uuid not null references public.claims (id) on delete cascade,
  fund_id uuid not null references public.funds (id) on delete cascade,
  primary key (argument_id, claim_id)
);
create index counter_argument_claims_claim_id_idx on public.counter_argument_claims (claim_id);
create index counter_argument_claims_fund_id_idx on public.counter_argument_claims (fund_id);

create table public.falsifier_claims (
  falsifier_id uuid not null references public.falsifiers (id) on delete cascade,
  claim_id uuid not null references public.claims (id) on delete cascade,
  fund_id uuid not null references public.funds (id) on delete cascade,
  primary key (falsifier_id, claim_id)
);
create index falsifier_claims_claim_id_idx on public.falsifier_claims (claim_id);
create index falsifier_claims_fund_id_idx on public.falsifier_claims (fund_id);

create table public.falsifier_uncertainties (
  falsifier_id uuid not null references public.falsifiers (id) on delete cascade,
  uncertainty_id uuid not null references public.uncertainties (id) on delete cascade,
  fund_id uuid not null references public.funds (id) on delete cascade,
  primary key (falsifier_id, uncertainty_id)
);
create index falsifier_uncertainties_uncertainty_id_idx on public.falsifier_uncertainties (uncertainty_id);
create index falsifier_uncertainties_fund_id_idx on public.falsifier_uncertainties (fund_id);

-- Both ends of a link belong to the same evaluation.
create function private.check_citation_link()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_row jsonb := to_jsonb(new);
  v_owner uuid;
  v_target uuid;
begin
  if tg_table_name = 'counter_argument_claims' then
    select evaluation_id into v_owner from public.counter_arguments where id = (v_row ->> 'argument_id')::uuid;
    select evaluation_id into v_target from public.claims where id = (v_row ->> 'claim_id')::uuid;
  elsif tg_table_name = 'falsifier_claims' then
    select evaluation_id into v_owner from public.falsifiers where id = (v_row ->> 'falsifier_id')::uuid;
    select evaluation_id into v_target from public.claims where id = (v_row ->> 'claim_id')::uuid;
  else
    select evaluation_id into v_owner from public.falsifiers where id = (v_row ->> 'falsifier_id')::uuid;
    select evaluation_id into v_target from public.uncertainties where id = (v_row ->> 'uncertainty_id')::uuid;
  end if;
  if v_owner is null or v_owner is distinct from v_target then
    raise exception 'a citation must stay within one evaluation' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger check_link before insert or update on public.counter_argument_claims
  for each row execute function private.check_citation_link();
create trigger set_fund_id before insert or update on public.counter_argument_claims
  for each row execute function private.set_fund_id('counter_arguments', 'argument_id');
create trigger check_link before insert or update on public.falsifier_claims
  for each row execute function private.check_citation_link();
create trigger set_fund_id before insert or update on public.falsifier_claims
  for each row execute function private.set_fund_id('falsifiers', 'falsifier_id');
create trigger check_link before insert or update on public.falsifier_uncertainties
  for each row execute function private.check_citation_link();
create trigger set_fund_id before insert or update on public.falsifier_uncertainties
  for each row execute function private.set_fund_id('falsifiers', 'falsifier_id');

-- Deferred (checked at commit): every counter argument and every falsifier
-- cites at least one claim (decision 11).
create function private.check_cites_a_claim()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_row jsonb := coalesce(to_jsonb(new), to_jsonb(old));
  v_kind text;
  v_id uuid;
begin
  if tg_table_name in ('counter_arguments', 'counter_argument_claims') then
    v_kind := 'counter argument';
    v_id := case when tg_table_name = 'counter_arguments' then (v_row ->> 'id') else (v_row ->> 'argument_id') end::uuid;
    if not exists (select 1 from public.counter_arguments where id = v_id) then
      return null; -- deleted in the same transaction
    end if;
    if not exists (select 1 from public.counter_argument_claims where argument_id = v_id) then
      raise exception 'a % must cite at least one claim', v_kind using errcode = 'check_violation';
    end if;
  else
    v_kind := 'falsifier';
    v_id := case when tg_table_name = 'falsifiers' then (v_row ->> 'id') else (v_row ->> 'falsifier_id') end::uuid;
    if not exists (select 1 from public.falsifiers where id = v_id) then
      return null;
    end if;
    if not exists (select 1 from public.falsifier_claims where falsifier_id = v_id) then
      raise exception 'a % must cite at least one claim', v_kind using errcode = 'check_violation';
    end if;
  end if;
  return null;
end;
$$;

create constraint trigger cites_a_claim after insert or update on public.counter_arguments
  deferrable initially deferred for each row execute function private.check_cites_a_claim();
create constraint trigger cites_a_claim after delete or update on public.counter_argument_claims
  deferrable initially deferred for each row execute function private.check_cites_a_claim();
create constraint trigger cites_a_claim after insert or update on public.falsifiers
  deferrable initially deferred for each row execute function private.check_cites_a_claim();
create constraint trigger cites_a_claim after delete or update on public.falsifier_claims
  deferrable initially deferred for each row execute function private.check_cites_a_claim();

-- ---------------------------------------------------------------------------
-- RLS: members read; written by the pipeline (service role)
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['counter_arguments', 'counter_argument_claims', 'falsifiers', 'falsifier_claims', 'falsifier_uncertainties'] loop
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
-- record_counter_case(): one transaction for step 4. Citations are codes
-- (C#, U#) resolved within the evaluation; an unknown code fails the whole
-- write. New uncertainties are numbered first, so P10 may cite them by the
-- codes they receive (U<existing + 1> …). Service role only.
--   p_arguments: [{rank, prompt_id?, argument, mechanism, claim_codes: [C#]}]
--   p_uncertainties: [{question, why_unresolved, decision_critical, min_evidence_to_resolve?}]
--   p_falsifiers: [{criterion, outcome_check, claim_codes: [C#], uncertainty_codes: [U#]}]
-- ---------------------------------------------------------------------------

create function public.record_counter_case(
  p_evaluation_id uuid, p_run_id uuid, p_arguments jsonb, p_uncertainties jsonb, p_falsifiers jsonb,
  p_warnings text[], p_notes text[]
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
begin
  if exists (select 1 from public.counter_arguments a where a.evaluation_id = p_evaluation_id) then
    raise exception 'this deal already has a counter-case' using errcode = 'unique_violation';
  end if;
  if jsonb_array_length(p_arguments) <> 3 then
    raise exception 'the counter-case has exactly three arguments' using errcode = 'check_violation';
  end if;
  if jsonb_array_length(p_falsifiers) not between 2 and 4 then
    raise exception 'give 2 to 4 falsifiers' using errcode = 'check_violation';
  end if;

  for v_item in select * from jsonb_array_elements(p_arguments)
  loop
    insert into public.counter_arguments (evaluation_id, run_id, rank, counter_case_prompt_id, argument, mechanism)
    values (p_evaluation_id, p_run_id, (v_item ->> 'rank')::int, (v_item ->> 'prompt_id')::uuid,
            v_item ->> 'argument', v_item ->> 'mechanism')
    returning id into v_id;
    for v_code in select jsonb_array_elements_text(v_item -> 'claim_codes')
    loop
      select c.id into v_target from public.claims c where c.evaluation_id = p_evaluation_id and c.code = v_code;
      if v_target is null then
        raise exception 'unknown claim %', v_code using errcode = 'check_violation';
      end if;
      insert into public.counter_argument_claims (argument_id, claim_id) values (v_id, v_target) on conflict do nothing;
    end loop;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_uncertainties, '[]'::jsonb))
  loop
    insert into public.uncertainties (evaluation_id, code, run_id, question, why_unresolved, decision_critical, min_evidence_to_resolve)
    values (p_evaluation_id, 'U0', p_run_id, v_item ->> 'question', v_item ->> 'why_unresolved',
            (v_item ->> 'decision_critical')::boolean, nullif(trim(v_item ->> 'min_evidence_to_resolve'), ''));
  end loop;

  for v_item in select * from jsonb_array_elements(p_falsifiers)
  loop
    insert into public.falsifiers (evaluation_id, code, run_id, criterion, outcome_check)
    values (p_evaluation_id, 'F0', p_run_id, v_item ->> 'criterion', v_item ->> 'outcome_check')
    returning id into v_id;
    for v_code in select jsonb_array_elements_text(v_item -> 'claim_codes')
    loop
      select c.id into v_target from public.claims c where c.evaluation_id = p_evaluation_id and c.code = v_code;
      if v_target is null then
        raise exception 'unknown claim %', v_code using errcode = 'check_violation';
      end if;
      insert into public.falsifier_claims (falsifier_id, claim_id) values (v_id, v_target) on conflict do nothing;
    end loop;
    for v_code in select jsonb_array_elements_text(coalesce(v_item -> 'uncertainty_codes', '[]'::jsonb))
    loop
      select u.id into v_target from public.uncertainties u where u.evaluation_id = p_evaluation_id and u.code = v_code;
      if v_target is null then
        raise exception 'unknown uncertainty %', v_code using errcode = 'check_violation';
      end if;
      insert into public.falsifier_uncertainties (falsifier_id, uncertainty_id) values (v_id, v_target) on conflict do nothing;
    end loop;
  end loop;

  update public.pipeline_runs
  set status = case when coalesce(array_length(p_warnings, 1), 0) > 0 then 'done_with_warnings' else 'done' end::public.run_status,
      progress = 100, finished_at = now(),
      warnings = coalesce(p_warnings, '{}'), notes = coalesce(p_notes, '{}')
  where id = p_run_id;

  return jsonb_array_length(p_falsifiers);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function private.check_counter_argument_prompt() from public, anon, authenticated;
revoke all on function private.assign_falsifier_code() from public, anon, authenticated;
revoke all on function private.check_citation_link() from public, anon, authenticated;
revoke all on function private.check_cites_a_claim() from public, anon, authenticated;

revoke all on function public.record_counter_case(uuid, uuid, jsonb, jsonb, jsonb, text[], text[]) from public, anon, authenticated;
grant execute on function public.record_counter_case(uuid, uuid, jsonb, jsonb, jsonb, text[], text[]) to service_role;
