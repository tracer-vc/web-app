-- M14: re-running a pipeline step (decision 20).
--
-- reset_from_step(evaluation, step) clears that step and every later step in
-- one transaction, marks their runs as superseded, moves the deal back to the
-- step and logs the reset. Codes restart cleanly because S#, C#, CR#, U#, F#
-- and D# are assigned as count + 1. Once synthesis has run, IDs are frozen:
-- a reset then needs an explicit full-reset confirmation.
--
--   step 2 (2b Source Table): sources, source conflicts
--   step 3 (claims):          claims, claim conflicts, all uncertainties
--   step 4 (counter-case):    counter arguments, falsifiers, P9 uncertainties
--   step 5 (dimensions):      dimension assessments
--   step 6 (outputs):         statements, decision

alter table public.pipeline_runs add column superseded_at timestamptz;

create function public.reset_from_step(
  p_evaluation_id uuid, p_step int, p_confirm_full_reset boolean, p_actor_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_eval public.evaluations%rowtype;
  v_counts jsonb := '{}'::jsonb;
  v_n int;
  v_status public.evaluation_status;
begin
  if p_step not between 2 and 6 then
    raise exception 'only steps 2 to 6 can be re-run' using errcode = 'check_violation';
  end if;
  select * into v_eval from public.evaluations e where e.id = p_evaluation_id for update;
  if not found then
    raise exception 'evaluation not found' using errcode = 'no_data_found';
  end if;
  if v_eval.current_step < p_step then
    raise exception 'step % has not been reached yet', p_step using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from public.pipeline_runs r
    where r.evaluation_id = p_evaluation_id and r.status in ('queued', 'running') and r.superseded_at is null
  ) then
    raise exception 'a run is in progress; wait for it to finish' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.decisions d where d.evaluation_id = p_evaluation_id) and not p_confirm_full_reset then
    raise exception 'outputs exist and their IDs are frozen; confirm a full reset to re-run'
      using errcode = 'check_violation';
  end if;

  -- step 6
  delete from public.statements where evaluation_id = p_evaluation_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('statements', v_n);
  delete from public.decisions where evaluation_id = p_evaluation_id;

  if p_step <= 5 then
    delete from public.dimension_assessments where evaluation_id = p_evaluation_id;
    get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('dimension_assessments', v_n);
  end if;

  if p_step <= 4 then
    delete from public.counter_arguments where evaluation_id = p_evaluation_id;
    get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('counter_arguments', v_n);
    delete from public.falsifiers where evaluation_id = p_evaluation_id;
    get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('falsifiers', v_n);
    -- P9 adds uncertainties without a Collection Prompt; R2 (step 3) sets one.
    delete from public.uncertainties where evaluation_id = p_evaluation_id and from_prompt_id is null;
    get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('uncertainties_p9', v_n);
  end if;

  if p_step <= 3 then
    delete from public.conflicts where evaluation_id = p_evaluation_id and kind = 'claim';
    get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('claim_conflicts', v_n);
    delete from public.uncertainties where evaluation_id = p_evaluation_id;
    get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('uncertainties', v_n);
    delete from public.claims where evaluation_id = p_evaluation_id;
    get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('claims', v_n);
  end if;

  if p_step <= 2 then
    delete from public.conflicts where evaluation_id = p_evaluation_id and kind = 'source';
    get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('source_conflicts', v_n);
    delete from public.sources where evaluation_id = p_evaluation_id;
    get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('sources', v_n);
  end if;

  update public.pipeline_runs set superseded_at = now()
  where evaluation_id = p_evaluation_id and step >= p_step and superseded_at is null;

  v_status := (array['collecting', 'extracting', 'stress_testing', 'scoring', 'synthesizing'])[p_step - 1]::public.evaluation_status;
  update public.evaluations set status = v_status, current_step = p_step where id = p_evaluation_id;

  insert into public.analyst_actions (fund_id, actor_id, action, target_table, target_id, before, after)
  values (
    v_eval.fund_id, p_actor_id, 'pipeline.reset', 'evaluations', p_evaluation_id,
    jsonb_build_object('status', v_eval.status, 'current_step', v_eval.current_step),
    jsonb_build_object('rerun_from_step', p_step, 'full_reset', p_confirm_full_reset, 'cleared', v_counts)
  );

  return v_counts;
end;
$$;

revoke all on function public.reset_from_step(uuid, int, boolean, uuid) from public, anon, authenticated;
grant execute on function public.reset_from_step(uuid, int, boolean, uuid) to service_role;
