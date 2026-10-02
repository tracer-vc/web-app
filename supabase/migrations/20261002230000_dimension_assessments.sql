-- M12: Dimension Assessment Table (D#), step 5.
--
-- One assessment per dimension of the evaluation's pinned config: answers to
-- the dimension's concrete prompts (citing C#), the strongest counter-signal,
-- and a 0-5 score that cites claims within the config's sufficiency range
-- (decision 16, default 2-5; checked at commit). The score cap (decision 15)
-- is applied here, in the database: if a required Collection Prompt of the
-- dimension has an open prompt-derived U#, the score is capped at the
-- config's score_cap and score_capped_by records that U#. The proposed score
-- is kept. Analysts may override a score (decision 14); the original stays,
-- and the override is stamped and logged.

create table public.dimension_assessments (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.funds (id) on delete cascade,
  evaluation_id uuid not null references public.evaluations (id) on delete cascade,
  dimension_id uuid not null references public.dimensions (id) on delete restrict,
  code text not null check (code ~ '^D[1-9][0-9]*$'),
  run_id uuid references public.pipeline_runs (id) on delete set null,
  -- [{prompt_id, prompt, answer, claim_codes: [C#]}], one per concrete prompt
  answers jsonb not null check (jsonb_typeof(answers) = 'array'),
  counter_signal text not null check (length(trim(counter_signal)) > 0),
  proposed_score int not null check (proposed_score between 0 and 5),
  score int not null check (score between 0 and 5),
  -- cascade: removing the U# invalidates the step-5 scores (decision 20)
  score_capped_by uuid references public.uncertainties (id) on delete cascade,
  override_score int check (override_score between 0 and 5),
  override_reason text,
  override_by uuid references public.profiles (id) on delete set null,
  override_at timestamptz,
  created_at timestamptz not null default now(),
  unique (evaluation_id, dimension_id),
  unique (evaluation_id, code),
  constraint score_not_above_proposed check (score <= proposed_score),
  constraint cap_is_recorded check (score = proposed_score or score_capped_by is not null)
);

create index dimension_assessments_fund_id_idx on public.dimension_assessments (fund_id);
create index dimension_assessments_dimension_id_idx on public.dimension_assessments (dimension_id);
create index dimension_assessments_run_id_idx on public.dimension_assessments (run_id);
create index dimension_assessments_capped_by_idx on public.dimension_assessments (score_capped_by);
create index dimension_assessments_override_by_idx on public.dimension_assessments (override_by);

create table public.dimension_assessment_claims (
  assessment_id uuid not null references public.dimension_assessments (id) on delete cascade,
  claim_id uuid not null references public.claims (id) on delete cascade,
  fund_id uuid not null references public.funds (id) on delete cascade,
  primary key (assessment_id, claim_id)
);
create index dimension_assessment_claims_claim_id_idx on public.dimension_assessment_claims (claim_id);
create index dimension_assessment_claims_fund_id_idx on public.dimension_assessment_claims (fund_id);

-- D# in dimension order of insertion; the dimension belongs to the pinned
-- config; the scored fields are fixed once written. Analysts change only the
-- override (column grants); who and when are stamped here.
create function private.guard_dimension_assessment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform 1 from public.evaluations e where e.id = new.evaluation_id for update;
    select 'D' || (count(*) + 1) into new.code
    from public.dimension_assessments d where d.evaluation_id = new.evaluation_id;
    if not exists (
      select 1 from public.evaluations e join public.dimensions dm on dm.config_id = e.config_id
      where e.id = new.evaluation_id and dm.id = new.dimension_id
    ) then
      raise exception 'the dimension is not part of this evaluation''s configuration'
        using errcode = 'check_violation';
    end if;
  else
    if (new.evaluation_id, new.dimension_id, new.code, new.answers, new.counter_signal, new.proposed_score, new.score)
       is distinct from (old.evaluation_id, old.dimension_id, old.code, old.answers, old.counter_signal, old.proposed_score, old.score) then
      raise exception 'an assessment''s answers and scores cannot change; override the score instead'
        using errcode = 'check_violation';
    end if;
    if auth.uid() is not null and (new.override_score, new.override_reason) is distinct from (old.override_score, old.override_reason) then
      if new.override_score is null then
        new.override_reason := null;
        new.override_by := null;
        new.override_at := null;
      else
        new.override_by := auth.uid();
        new.override_at := now();
      end if;
    end if;
  end if;
  return new;
end;
$$;

create function private.log_score_override()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and (new.override_score, new.override_reason) is distinct from (old.override_score, old.override_reason) then
    insert into public.analyst_actions (fund_id, actor_id, action, target_table, target_id, before, after)
    values (
      new.fund_id, auth.uid(),
      case when new.override_score is null then 'dimension.override_cleared' else 'dimension.score_overridden' end,
      'dimension_assessments', new.id,
      jsonb_build_object('code', old.code, 'score', old.score, 'override_score', old.override_score, 'reason', old.override_reason),
      jsonb_build_object('code', new.code, 'score', new.score, 'override_score', new.override_score, 'reason', new.override_reason)
    );
  end if;
  return null;
end;
$$;

-- Name order: guard_dimension_assessment, then set_fund_id.
create trigger guard_dimension_assessment before insert or update on public.dimension_assessments
  for each row execute function private.guard_dimension_assessment();
create trigger set_fund_id before insert or update on public.dimension_assessments
  for each row execute function private.set_fund_id('evaluations', 'evaluation_id');
create trigger log_override after update on public.dimension_assessments
  for each row execute function private.log_score_override();

-- Cited claims belong to the same evaluation.
create function private.check_assessment_claim()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.dimension_assessments a join public.claims c on c.evaluation_id = a.evaluation_id
    where a.id = new.assessment_id and c.id = new.claim_id
  ) then
    raise exception 'a citation must stay within one evaluation' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger check_link before insert or update on public.dimension_assessment_claims
  for each row execute function private.check_assessment_claim();
create trigger set_fund_id before insert or update on public.dimension_assessment_claims
  for each row execute function private.set_fund_id('dimension_assessments', 'assessment_id');

-- Deferred (at commit): the number of cited claims lies within the pinned
-- config's claims_per_score range (decision 16).
create function private.check_assessment_claim_count()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid := case when tg_table_name = 'dimension_assessments'
    then (coalesce(to_jsonb(new), to_jsonb(old)) ->> 'id')
    else (coalesce(to_jsonb(new), to_jsonb(old)) ->> 'assessment_id') end::uuid;
  v_rule jsonb;
  v_count int;
begin
  select fc.sufficiency_rule -> 'claims_per_score' into v_rule
  from public.dimension_assessments a
  join public.evaluations e on e.id = a.evaluation_id
  join public.framework_configs fc on fc.id = e.config_id
  where a.id = v_id;
  if not found then
    return null; -- deleted in the same transaction
  end if;
  select count(*) into v_count from public.dimension_assessment_claims where assessment_id = v_id;
  if v_count < (v_rule ->> 'min')::int or v_count > (v_rule ->> 'max')::int then
    raise exception 'a dimension score must cite % to % claims (got %)', v_rule ->> 'min', v_rule ->> 'max', v_count
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

create constraint trigger claim_count after insert or update on public.dimension_assessments
  deferrable initially deferred for each row execute function private.check_assessment_claim_count();
create constraint trigger claim_count after insert or delete or update on public.dimension_assessment_claims
  deferrable initially deferred for each row execute function private.check_assessment_claim_count();

-- ---------------------------------------------------------------------------
-- RLS: members read; analysts override scores; the pipeline writes the rest
-- ---------------------------------------------------------------------------

alter table public.dimension_assessments enable row level security;
create policy "members read" on public.dimension_assessments for select to authenticated
  using (fund_id = (select private.current_fund_id()));
create policy "members override scores" on public.dimension_assessments for update to authenticated
  using (fund_id = (select private.current_fund_id()))
  with check (fund_id = (select private.current_fund_id()));
revoke insert, update, delete on public.dimension_assessments from authenticated, anon;
grant update (override_score, override_reason) on public.dimension_assessments to authenticated;

alter table public.dimension_assessment_claims enable row level security;
create policy "members read" on public.dimension_assessment_claims for select to authenticated
  using (fund_id = (select private.current_fund_id()));
revoke insert, update, delete on public.dimension_assessment_claims from authenticated, anon;

-- ---------------------------------------------------------------------------
-- record_dimension_assessments(): one transaction for step 5. Every dimension
-- of the pinned config is assessed exactly once. Citations are C# codes
-- resolved within the evaluation. The score cap is applied here. Service role
-- only.
--   p_assessments: [{dimension_id, answers: [{prompt_id, prompt, answer, claim_codes}],
--                    counter_signal, proposed_score, claim_codes: [C#]}]
-- ---------------------------------------------------------------------------

create function public.record_dimension_assessments(
  p_evaluation_id uuid, p_run_id uuid, p_assessments jsonb, p_warnings text[], p_notes text[]
)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item jsonb;
  v_answer jsonb;
  v_id uuid;
  v_code text;
  v_target uuid;
  v_cap int;
  v_capped_by uuid;
  v_proposed int;
  v_missing int;
begin
  if exists (select 1 from public.dimension_assessments a where a.evaluation_id = p_evaluation_id) then
    raise exception 'this deal already has dimension scores' using errcode = 'unique_violation';
  end if;

  select (fc.sufficiency_rule ->> 'score_cap')::int into v_cap
  from public.evaluations e join public.framework_configs fc on fc.id = e.config_id
  where e.id = p_evaluation_id;

  select count(*) into v_missing
  from public.evaluations e join public.dimensions d on d.config_id = e.config_id
  where e.id = p_evaluation_id
    and d.id not in (select (x ->> 'dimension_id')::uuid from jsonb_array_elements(p_assessments) x);
  if v_missing > 0 or jsonb_array_length(p_assessments) <> (
    select count(*) from public.evaluations e join public.dimensions d on d.config_id = e.config_id where e.id = p_evaluation_id
  ) then
    raise exception 'assess every dimension of the configuration exactly once' using errcode = 'check_violation';
  end if;

  for v_item in
    select x from jsonb_array_elements(p_assessments) x
    join public.dimensions d on d.id = (x ->> 'dimension_id')::uuid
    order by d.position
  loop
    -- Answer citations must name claims of this evaluation.
    for v_answer in select * from jsonb_array_elements(v_item -> 'answers')
    loop
      for v_code in select jsonb_array_elements_text(coalesce(v_answer -> 'claim_codes', '[]'::jsonb))
      loop
        if not exists (select 1 from public.claims c where c.evaluation_id = p_evaluation_id and c.code = v_code) then
          raise exception 'unknown claim %', v_code using errcode = 'check_violation';
        end if;
      end loop;
    end loop;

    -- Decision 15: an open prompt-derived U# for a required prompt caps the score.
    select u.id into v_capped_by
    from public.uncertainties u
    join public.dimension_required_prompts r on r.prompt_id = u.from_prompt_id
    where u.evaluation_id = p_evaluation_id and u.status = 'open'
      and r.dimension_id = (v_item ->> 'dimension_id')::uuid
    order by substring(u.code from 2)::int
    limit 1;
    v_proposed := (v_item ->> 'proposed_score')::int;
    if v_capped_by is null or v_proposed <= v_cap then
      v_capped_by := null;
    end if;

    insert into public.dimension_assessments (
      evaluation_id, dimension_id, code, run_id, answers, counter_signal, proposed_score, score, score_capped_by
    ) values (
      p_evaluation_id, (v_item ->> 'dimension_id')::uuid, 'D0', p_run_id, v_item -> 'answers', v_item ->> 'counter_signal',
      v_proposed, case when v_capped_by is null then v_proposed else v_cap end, v_capped_by
    )
    returning id into v_id;

    for v_code in select jsonb_array_elements_text(v_item -> 'claim_codes')
    loop
      select c.id into v_target from public.claims c where c.evaluation_id = p_evaluation_id and c.code = v_code;
      if v_target is null then
        raise exception 'unknown claim %', v_code using errcode = 'check_violation';
      end if;
      insert into public.dimension_assessment_claims (assessment_id, claim_id) values (v_id, v_target) on conflict do nothing;
    end loop;
  end loop;

  update public.pipeline_runs
  set status = case when coalesce(array_length(p_warnings, 1), 0) > 0 then 'done_with_warnings' else 'done' end::public.run_status,
      progress = 100, finished_at = now(),
      warnings = coalesce(p_warnings, '{}'), notes = coalesce(p_notes, '{}')
  where id = p_run_id;

  return jsonb_array_length(p_assessments);
end;
$$;

revoke all on function private.guard_dimension_assessment() from public, anon, authenticated;
revoke all on function private.log_score_override() from public, anon, authenticated;
revoke all on function private.check_assessment_claim() from public, anon, authenticated;
revoke all on function private.check_assessment_claim_count() from public, anon, authenticated;

revoke all on function public.record_dimension_assessments(uuid, uuid, jsonb, text[], text[]) from public, anon, authenticated;
grant execute on function public.record_dimension_assessments(uuid, uuid, jsonb, text[], text[]) to service_role;
