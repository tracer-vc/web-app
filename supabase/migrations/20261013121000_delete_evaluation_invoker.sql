-- delete_evaluation: keep the exposed function SECURITY INVOKER (advisor 0029)
-- and move the privileged deletion into the private schema, like set_dev_mode.

drop function public.delete_evaluation(uuid);

create function private.delete_fund_evaluation(p_evaluation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eval public.evaluations%rowtype;
  v_company public.companies%rowtype;
  v_ids uuid[];
begin
  select * into v_eval from public.evaluations e
  where e.id = p_evaluation_id and e.fund_id = private.current_fund_id()
  for update;
  if not found then
    raise exception 'deal not found' using errcode = 'no_data_found';
  end if;

  v_ids := array(select e.id from public.evaluations e where e.id = p_evaluation_id or e.study_parent_id = p_evaluation_id);

  if exists (
    select 1 from public.pipeline_runs r
    where r.evaluation_id = any (v_ids) and r.status in ('queued', 'running') and r.superseded_at is null
  ) then
    raise exception 'a pipeline step is running; wait for it to finish' using errcode = 'check_violation';
  end if;

  select * into v_company from public.companies c where c.id = v_eval.company_id;

  -- Visual blocks first: the llm_calls cascade would otherwise null their
  -- llm_call_id after the document text is gone (guard_document_visual).
  delete from public.document_visuals v
  using public.documents d
  where d.id = v.document_id and d.evaluation_id = any (v_ids);

  delete from public.evaluations e where e.id = any (v_ids);

  delete from public.companies c
  where c.id = v_eval.company_id
    and not exists (select 1 from public.evaluations e where e.company_id = c.id);

  insert into public.analyst_actions (fund_id, actor_id, action, target_table, target_id, before, after)
  values (
    v_eval.fund_id, auth.uid(), 'evaluation.deleted', 'evaluations', p_evaluation_id,
    jsonb_build_object(
      'company', v_company.name,
      'status', v_eval.status,
      'current_step', v_eval.current_step,
      'config_id', v_eval.config_id,
      'study_copies', cardinality(v_ids) - 1
    ),
    null
  );
end;
$$;

revoke all on function private.delete_fund_evaluation(uuid) from public, anon, authenticated;
grant execute on function private.delete_fund_evaluation(uuid) to authenticated, service_role;

create function public.delete_evaluation(p_evaluation_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.delete_fund_evaluation(p_evaluation_id);
end;
$$;

revoke all on function public.delete_evaluation(uuid) from public, anon;
grant execute on function public.delete_evaluation(uuid) to authenticated;
