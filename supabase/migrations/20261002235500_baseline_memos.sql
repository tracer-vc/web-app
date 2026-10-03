-- M15: Study 2 (decision 27). Two conditions on the same deal:
--   * baseline: the same LLM, corpus (the deal's Source Table texts) and fund
--     config write a cited memo with the output headings, without the claim
--     layer, sufficiency rule or conflict register (baseline_memos);
--   * artifact: the full pipeline again on a hidden copy of the deal (same
--     documents, Quick Screen and config version), for the 5-run protocol.
-- Study data is visible to fund admins only.

-- ---------------------------------------------------------------------------
-- Artifact re-runs: hidden copies of a deal
-- ---------------------------------------------------------------------------

alter table public.evaluations
  add column study_parent_id uuid references public.evaluations (id) on delete cascade,
  add column study_run int,
  add constraint study_copy_numbered check ((study_parent_id is null) = (study_run is null) and coalesce(study_run, 2) >= 2);

create index evaluations_study_parent_idx on public.evaluations (study_parent_id);

-- As before, plus: a study copy keeps its original's config version even if
-- the fund has published a newer one since (same fund config in every run).
create or replace function private.guard_evaluation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.study_parent_id is not null then
      if not exists (
        select 1 from public.evaluations p
        where p.id = new.study_parent_id and p.config_id = new.config_id
          and p.company_id = new.company_id and p.study_parent_id is null
      ) then
        raise exception 'a study copy uses its original''s company and configuration'
          using errcode = 'check_violation';
      end if;
    elsif not exists (
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
       or new.evaluator_id is distinct from old.evaluator_id and new.evaluator_id is not null
       or (new.study_parent_id, new.study_run) is distinct from (old.study_parent_id, old.study_run) then
      raise exception 'company, configuration, fund, evaluator and study run of an evaluation cannot change'
        using errcode = 'check_violation';
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

-- Copy a deal for another artifact run: same company, config version,
-- uploads-only switch and Quick Screen (answers and memo, which moves the copy
-- to Evidence Collection). Documents are copied by the server (storage).
-- Run 1 is the original; copies are numbered from 2. Service role only.
create function public.create_study_copy(p_parent_id uuid, p_actor_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_parent public.evaluations%rowtype;
  v_id uuid;
begin
  select * into v_parent from public.evaluations e where e.id = p_parent_id for update;
  if not found then
    raise exception 'evaluation not found' using errcode = 'no_data_found';
  end if;
  if v_parent.study_parent_id is not null then
    raise exception 'copy the original deal, not a study copy' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.quick_screen_memos m where m.evaluation_id = p_parent_id and m.verdict = 'proceed') then
    raise exception 'the deal needs a Quick Screen that proceeds' using errcode = 'check_violation';
  end if;

  insert into public.evaluations (fund_id, company_id, config_id, evaluator_id, uploads_only, study_parent_id, study_run)
  values (
    v_parent.fund_id, v_parent.company_id, v_parent.config_id, p_actor_id, v_parent.uploads_only, p_parent_id,
    1 + (select count(*) from public.evaluations c where c.study_parent_id = p_parent_id) + 1
  )
  returning id into v_id;

  insert into public.quick_screen_answers (evaluation_id, question_id, answer, ai_answer, found_in_materials, origin)
  select v_id, a.question_id, a.answer, a.ai_answer, a.found_in_materials, a.origin
  from public.quick_screen_answers a where a.evaluation_id = p_parent_id;

  insert into public.quick_screen_memos (
    evaluation_id, llm_call_id, preliminary_thesis, verdict, original_verdict, justification, uncertainties,
    reopen_condition, gating_variable, reeval_trigger
  )
  select v_id, m.llm_call_id, m.preliminary_thesis, m.verdict, m.original_verdict, m.justification, m.uncertainties,
         m.reopen_condition, m.gating_variable, m.reeval_trigger
  from public.quick_screen_memos m where m.evaluation_id = p_parent_id;

  return v_id;
end;
$$;

revoke all on function public.create_study_copy(uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_study_copy(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- baseline_memos
-- ---------------------------------------------------------------------------

create table public.baseline_memos (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.funds (id) on delete cascade,
  evaluation_id uuid not null references public.evaluations (id) on delete cascade,
  run_number int not null check (run_number >= 1),
  status public.run_status not null default 'queued',
  error text,
  -- the memo, by output heading; each item {text, refs: [n]} (refs into "refs")
  content jsonb,
  -- the corpus as numbered for the model: [{n, source_code, title, origin, url}]
  refs jsonb,
  recommendation public.verdict,
  model text,
  prompt_key text,
  prompt_version text,
  llm_call_id uuid references public.llm_calls (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (evaluation_id, run_number),
  constraint done_has_memo check (status not in ('done', 'done_with_warnings') or (content is not null and recommendation is not null))
);

create index baseline_memos_fund_id_idx on public.baseline_memos (fund_id);
create index baseline_memos_llm_call_id_idx on public.baseline_memos (llm_call_id);
create index baseline_memos_created_by_idx on public.baseline_memos (created_by);

create function private.assign_baseline_run()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform 1 from public.evaluations e where e.id = new.evaluation_id for update;
  select coalesce(max(b.run_number), 0) + 1 into new.run_number
  from public.baseline_memos b where b.evaluation_id = new.evaluation_id;
  return new;
end;
$$;

-- Name order: assign_baseline_run, then set_fund_id.
create trigger assign_baseline_run before insert on public.baseline_memos
  for each row execute function private.assign_baseline_run();
create trigger set_fund_id before insert or update on public.baseline_memos
  for each row execute function private.set_fund_id('evaluations', 'evaluation_id');

alter table public.baseline_memos enable row level security;
create policy "fund admins read baseline memos" on public.baseline_memos for select to authenticated
  using (fund_id = (select private.current_fund_id()) and (select private.is_fund_admin()));
revoke insert, update, delete on public.baseline_memos from authenticated, anon;

revoke all on function private.assign_baseline_run() from public, anon, authenticated;
