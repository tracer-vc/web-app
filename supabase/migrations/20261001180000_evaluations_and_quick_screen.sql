-- M5: companies, evaluations, Quick Screen (answers + P1 memo), pipeline runs
-- and the llm_calls audit log.
--
-- Who writes what (plan RLS model):
--   analysts: companies, evaluations (via create_evaluation), uploads_only,
--             verdict overrides (memo update, column-restricted + logged by trigger)
--   server (service role): Quick Screen answers + memo together (record_quick_screen),
--             pipeline_runs, llm_calls; evaluation status follows the memo verdict.

create type public.evaluation_status as enum (
  'screening', 'passed', 'watch', 'collecting', 'extracting',
  'stress_testing', 'scoring', 'synthesizing', 'complete'
);
create type public.verdict as enum ('proceed', 'watch', 'pass');
create type public.run_status as enum ('queued', 'running', 'done', 'done_with_warnings', 'failed');

-- ---------------------------------------------------------------------------
-- companies
-- ---------------------------------------------------------------------------

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null default private.current_fund_id() references public.funds (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  stage text not null default '',
  sector text not null default '',
  website text not null default '',
  created_at timestamptz not null default now()
);

create unique index companies_fund_name_key on public.companies (fund_id, lower(trim(name)));

alter table public.companies enable row level security;

create policy "members read companies" on public.companies for select to authenticated
  using (fund_id = (select private.current_fund_id()));
create policy "members create companies" on public.companies for insert to authenticated
  with check (fund_id = (select private.current_fund_id()));
create policy "members update companies" on public.companies for update to authenticated
  using (fund_id = (select private.current_fund_id()))
  with check (fund_id = (select private.current_fund_id()));

-- ---------------------------------------------------------------------------
-- evaluations
-- ---------------------------------------------------------------------------

create table public.evaluations (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.funds (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  config_id uuid not null references public.framework_configs (id) on delete restrict,
  evaluator_id uuid references public.profiles (id) on delete set null default auth.uid(),
  status public.evaluation_status not null default 'screening',
  current_step int not null default 1 check (current_step between 1 and 6),
  uploads_only boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index evaluations_fund_id_updated_at_idx on public.evaluations (fund_id, updated_at desc);
create index evaluations_company_id_idx on public.evaluations (company_id);
create index evaluations_config_id_idx on public.evaluations (config_id);
create index evaluations_evaluator_id_idx on public.evaluations (evaluator_id);

-- Pin: a new evaluation uses its fund's active published config; company,
-- config, fund and evaluator never change afterwards.
create function private.guard_evaluation()
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
    new.updated_at := now();
  end if;
  return new;
end;
$$;

-- BEFORE triggers fire in name order: validate_evaluation must run after
-- set_fund_id, which fills in fund_id.
create trigger set_fund_id before insert or update on public.evaluations
  for each row execute function private.set_fund_id('companies', 'company_id');
create trigger validate_evaluation before insert or update on public.evaluations
  for each row execute function private.guard_evaluation();

alter table public.evaluations enable row level security;

create policy "members read evaluations" on public.evaluations for select to authenticated
  using (fund_id = (select private.current_fund_id()));
create policy "members create evaluations" on public.evaluations for insert to authenticated
  with check (
    fund_id = (select private.current_fund_id())
    and evaluator_id = (select auth.uid())
    and status = 'screening'
    and current_step = 1
  );
create policy "members update evaluations" on public.evaluations for update to authenticated
  using (fund_id = (select private.current_fund_id()))
  with check (fund_id = (select private.current_fund_id()));

-- Users may only flip uploads_only; status moves with the pipeline (server/triggers).
revoke update on public.evaluations from authenticated, anon;
grant update (uploads_only) on public.evaluations to authenticated;

-- ---------------------------------------------------------------------------
-- pipeline_runs
-- ---------------------------------------------------------------------------

create table public.pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.funds (id) on delete cascade,
  evaluation_id uuid not null references public.evaluations (id) on delete cascade,
  step int not null check (step between 1 and 6),
  status public.run_status not null default 'queued',
  progress int not null default 0 check (progress between 0 and 100),
  error text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index pipeline_runs_evaluation_id_idx on public.pipeline_runs (evaluation_id, created_at desc);
create index pipeline_runs_fund_id_idx on public.pipeline_runs (fund_id);
create index pipeline_runs_created_by_idx on public.pipeline_runs (created_by);

create trigger set_fund_id before insert or update on public.pipeline_runs
  for each row execute function private.set_fund_id('evaluations', 'evaluation_id');

alter table public.pipeline_runs enable row level security;
create policy "members read runs" on public.pipeline_runs for select to authenticated
  using (fund_id = (select private.current_fund_id()));

-- ---------------------------------------------------------------------------
-- llm_calls: one row per attempt (audit trail)
-- ---------------------------------------------------------------------------

create table public.llm_calls (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.funds (id) on delete cascade,
  run_id uuid references public.pipeline_runs (id) on delete set null,
  evaluation_id uuid references public.evaluations (id) on delete cascade,
  prompt_key text not null,
  prompt_version text not null,
  model text not null,
  attempt int not null default 1 check (attempt >= 1),
  input jsonb not null,
  output jsonb,
  validation_errors jsonb,
  error text,
  input_tokens int,
  output_tokens int,
  latency_ms int,
  created_at timestamptz not null default now()
);

create index llm_calls_fund_id_created_at_idx on public.llm_calls (fund_id, created_at desc);
create index llm_calls_run_id_idx on public.llm_calls (run_id);
create index llm_calls_evaluation_id_idx on public.llm_calls (evaluation_id);

alter table public.llm_calls enable row level security;
create policy "members read llm calls" on public.llm_calls for select to authenticated
  using (fund_id = (select private.current_fund_id()));

-- ---------------------------------------------------------------------------
-- quick_screen_answers
-- ---------------------------------------------------------------------------

create table public.quick_screen_answers (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.funds (id) on delete cascade,
  evaluation_id uuid not null references public.evaluations (id) on delete cascade,
  question_id uuid not null references public.quick_screen_questions (id) on delete restrict,
  answer text not null check (length(trim(answer)) > 0),
  created_at timestamptz not null default now(),
  unique (evaluation_id, question_id)
);

create index quick_screen_answers_fund_id_idx on public.quick_screen_answers (fund_id);
create index quick_screen_answers_question_id_idx on public.quick_screen_answers (question_id);

-- The question must belong to the evaluation's pinned configuration.
create function private.check_answer_question()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.quick_screen_questions q
    join public.evaluations e on e.config_id = q.config_id
    where q.id = new.question_id and e.id = new.evaluation_id
  ) then
    raise exception 'the question is not part of this evaluation''s configuration'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger set_fund_id before insert or update on public.quick_screen_answers
  for each row execute function private.set_fund_id('evaluations', 'evaluation_id');
create trigger check_question before insert or update on public.quick_screen_answers
  for each row execute function private.check_answer_question();

alter table public.quick_screen_answers enable row level security;
create policy "members read answers" on public.quick_screen_answers for select to authenticated
  using (fund_id = (select private.current_fund_id()));

-- ---------------------------------------------------------------------------
-- quick_screen_memos (P1 output; verdict chosen by the model, decision 13)
-- ---------------------------------------------------------------------------

create table public.quick_screen_memos (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.funds (id) on delete cascade,
  evaluation_id uuid not null unique references public.evaluations (id) on delete cascade,
  llm_call_id uuid references public.llm_calls (id) on delete set null,
  preliminary_thesis text not null check (length(trim(preliminary_thesis)) > 0),
  verdict public.verdict not null,
  original_verdict public.verdict not null,
  justification text not null check (length(trim(justification)) > 0),
  uncertainties text[] not null
    check (array_length(uncertainties, 1) = 2 and array_position(uncertainties, null) is null),
  reopen_condition text,
  gating_variable text,
  reeval_trigger text,
  verdict_overridden_by uuid references public.profiles (id) on delete set null,
  verdict_overridden_at timestamptz,
  override_reason text,
  created_at timestamptz not null default now(),
  -- P1 must give the follow-up its verdict needs. coalesce: a NULL check passes.
  constraint pass_has_reopen_condition
    check (original_verdict <> 'pass' or coalesce(length(trim(reopen_condition)), 0) > 0),
  constraint watch_has_gating_variable_and_trigger
    check (original_verdict <> 'watch'
           or (coalesce(length(trim(gating_variable)), 0) > 0
               and coalesce(length(trim(reeval_trigger)), 0) > 0)),
  constraint override_is_explained
    check (verdict_overridden_at is null or coalesce(length(trim(override_reason)), 0) > 0)
);

create index quick_screen_memos_fund_id_idx on public.quick_screen_memos (fund_id);
create index quick_screen_memos_llm_call_id_idx on public.quick_screen_memos (llm_call_id);
create index quick_screen_memos_overridden_by_idx on public.quick_screen_memos (verdict_overridden_by);

create function private.is_quick_screen_status(p_status public.evaluation_status)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_status in ('screening', 'passed', 'watch', 'collecting');
$$;

-- Users may change only the verdict (an override) with a reason; it is stamped
-- with who and when. Everything else in a memo comes from P1.
create function private.guard_memo_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - 'verdict' - 'override_reason' - 'verdict_overridden_by' - 'verdict_overridden_at')
     is distinct from
     (to_jsonb(old) - 'verdict' - 'override_reason' - 'verdict_overridden_by' - 'verdict_overridden_at') then
    raise exception 'only the verdict of a Quick Screen memo can be changed (override)'
      using errcode = 'check_violation';
  end if;

  if new.verdict is distinct from old.verdict then
    if coalesce(length(trim(new.override_reason)), 0) = 0 then
      raise exception 'an override needs a reason' using errcode = 'check_violation';
    end if;
    if not exists (
      select 1 from public.evaluations e
      where e.id = new.evaluation_id and private.is_quick_screen_status(e.status)
    ) then
      raise exception 'the verdict can only be changed before Evidence Collection starts'
        using errcode = 'check_violation';
    end if;
    new.verdict_overridden_by := auth.uid();
    new.verdict_overridden_at := now();
  else
    new.override_reason := old.override_reason;
    new.verdict_overridden_by := old.verdict_overridden_by;
    new.verdict_overridden_at := old.verdict_overridden_at;
  end if;
  return new;
end;
$$;

-- Evaluation status follows the memo verdict; overrides are logged.
-- Security definer: users have no update right on evaluations.status.
create function private.sync_status_from_memo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.evaluation_status;
begin
  if tg_op = 'DELETE' then
    update public.evaluations
    set status = 'screening', current_step = 1
    where id = old.evaluation_id and private.is_quick_screen_status(status);
    return old;
  end if;

  if tg_op = 'UPDATE' and new.verdict is not distinct from old.verdict then
    return new;
  end if;

  v_status := case new.verdict
    when 'proceed' then 'collecting'
    when 'watch' then 'watch'
    else 'passed'
  end;

  update public.evaluations
  set status = v_status, current_step = case when v_status = 'collecting' then 2 else 1 end
  where id = new.evaluation_id;

  if tg_op = 'UPDATE' then
    insert into public.analyst_actions (fund_id, actor_id, action, target_table, target_id, before, after)
    values (
      new.fund_id, new.verdict_overridden_by, 'quick_screen.verdict_overridden',
      'quick_screen_memos', new.id,
      jsonb_build_object('verdict', old.verdict),
      jsonb_build_object('verdict', new.verdict, 'reason', new.override_reason)
    );
  end if;
  return new;
end;
$$;

create trigger set_fund_id before insert or update on public.quick_screen_memos
  for each row execute function private.set_fund_id('evaluations', 'evaluation_id');
create trigger guard_update before update on public.quick_screen_memos
  for each row execute function private.guard_memo_update();
create trigger sync_status after insert or update or delete on public.quick_screen_memos
  for each row execute function private.sync_status_from_memo();

alter table public.quick_screen_memos enable row level security;
create policy "members read memos" on public.quick_screen_memos for select to authenticated
  using (fund_id = (select private.current_fund_id()));
create policy "members override verdicts" on public.quick_screen_memos for update to authenticated
  using (fund_id = (select private.current_fund_id()))
  with check (fund_id = (select private.current_fund_id()));

revoke update on public.quick_screen_memos from authenticated, anon;
grant update (verdict, override_reason) on public.quick_screen_memos to authenticated;

-- ---------------------------------------------------------------------------
-- create_evaluation(): reuse the fund's company by name (case-insensitive) or
-- create it, then open an evaluation pinned to the active config.
-- ---------------------------------------------------------------------------

create function public.create_evaluation(p_name text, p_stage text, p_sector text, p_website text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_fund_id uuid := private.current_fund_id();
  v_company_id uuid;
  v_config_id uuid;
  v_evaluation_id uuid;
begin
  if v_fund_id is null then
    raise exception 'not a member of a fund' using errcode = 'insufficient_privilege';
  end if;

  select c.id into v_config_id
  from public.framework_configs c
  where c.fund_id = v_fund_id and c.is_active;
  if not found then
    raise exception 'the fund has no active configuration' using errcode = 'check_violation';
  end if;

  select co.id into v_company_id
  from public.companies co
  where co.fund_id = v_fund_id and lower(trim(co.name)) = lower(trim(p_name));

  if found then
    update public.companies
    set stage = coalesce(nullif(trim(p_stage), ''), stage),
        sector = coalesce(nullif(trim(p_sector), ''), sector),
        website = coalesce(nullif(trim(p_website), ''), website)
    where id = v_company_id;
  else
    insert into public.companies (name, stage, sector, website)
    values (trim(p_name), coalesce(trim(p_stage), ''), coalesce(trim(p_sector), ''), coalesce(trim(p_website), ''))
    returning id into v_company_id;
  end if;

  insert into public.evaluations (company_id, config_id)
  values (v_company_id, v_config_id)
  returning id into v_evaluation_id;

  return v_evaluation_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- record_quick_screen(): store answers + P1 memo in one transaction and close
-- the run. Service role only (the memo is pipeline output).
--   p_answers: [{question_id, answer}]
--   p_memo: {thesis, verdict, justification, uncertainties[2], reopen_condition?,
--            gating_variable?, reeval_trigger?}
-- ---------------------------------------------------------------------------

create function public.record_quick_screen(
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

  delete from public.quick_screen_answers where evaluation_id = p_evaluation_id;
  insert into public.quick_screen_answers (evaluation_id, question_id, answer)
  select p_evaluation_id, (a ->> 'question_id')::uuid, a ->> 'answer'
  from jsonb_array_elements(p_answers) a;

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

revoke all on function private.guard_evaluation() from public, anon, authenticated;
revoke all on function private.check_answer_question() from public, anon, authenticated;
revoke all on function private.guard_memo_update() from public, anon, authenticated;
revoke all on function private.sync_status_from_memo() from public, anon, authenticated;
revoke all on function private.is_quick_screen_status(public.evaluation_status) from public, anon, authenticated;
-- Called from triggers that run as the invoking user.
grant execute on function private.is_quick_screen_status(public.evaluation_status) to authenticated, service_role;

revoke all on function public.create_evaluation(text, text, text, text) from public, anon;
grant execute on function public.create_evaluation(text, text, text, text) to authenticated;

revoke all on function public.record_quick_screen(uuid, uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.record_quick_screen(uuid, uuid, uuid, jsonb, jsonb) to service_role;
