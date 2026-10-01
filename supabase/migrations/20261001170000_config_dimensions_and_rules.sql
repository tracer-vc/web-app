-- M4: save_config_draft() also syncs dimensions (with concrete prompts and
-- required Collection Prompts) and the editable rule fields.
--
-- p_config additionally accepts:
--   dimensions?: [{ id?, title, question, claim_coverage, high_score_signals,
--                   low_score_signals, disqualifying_below (1-5 | null),
--                   prompts: [{ id?, prompt }],
--                   required_prompt_positions: [int] }]   -- 1-based positions in collection_prompts
--   sufficiency_rule?: { claims_per_score: { min, max }, score_cap }
--   score_anchors?: { "0-1", "2", "3", "4", "5" }
--   classification_criteria?: { rules: [...] }
--
-- Only the editable keys of sufficiency_rule are taken; the locked rules
-- (SR1, SR3) can't be changed through this function. Required prompts are
-- given by position because prompts added in the same save have no id yet;
-- Collection Prompts are synced first, so positions refer to the saved list.
-- Shapes of the jsonb rule fields are validated by the API (lib/config.ts).

create or replace function public.save_config_draft(p_config jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_fund_id uuid := private.require_fund_admin();
  v_draft_id uuid;
  v_item jsonb;
  v_sub jsonb;
  v_pos int;
  v_sub_pos int;
  v_id uuid;
  v_dim_id uuid;
begin
  select c.id into v_draft_id
  from public.framework_configs c
  where c.fund_id = v_fund_id and c.status = 'draft'
  for update;

  if not found or v_draft_id is distinct from (p_config ->> 'id')::uuid then
    raise exception 'this draft no longer exists; reload the settings page'
      using errcode = 'no_data_found';
  end if;

  -- jsonb rule fields
  if p_config ? 'tier_definitions' then
    update public.framework_configs
    set tier_definitions = p_config -> 'tier_definitions'
    where id = v_draft_id;
  end if;

  if p_config ? 'sufficiency_rule' then
    update public.framework_configs
    set sufficiency_rule = sufficiency_rule || jsonb_build_object(
      'claims_per_score', p_config -> 'sufficiency_rule' -> 'claims_per_score',
      'score_cap', p_config -> 'sufficiency_rule' -> 'score_cap'
    )
    where id = v_draft_id;
  end if;

  if p_config ? 'score_anchors' then
    update public.framework_configs
    set score_anchors = p_config -> 'score_anchors'
    where id = v_draft_id;
  end if;

  if p_config ? 'classification_criteria' then
    update public.framework_configs
    set classification_criteria = p_config -> 'classification_criteria'
    where id = v_draft_id;
  end if;

  -- Quick Screen questions
  if p_config ? 'quick_screen_questions' then
    delete from public.quick_screen_questions q
    where q.config_id = v_draft_id
      and q.id not in (
        select (e ->> 'id')::uuid
        from jsonb_array_elements(p_config -> 'quick_screen_questions') e
        where e ->> 'id' is not null
      );

    for v_item, v_pos in
      select e, o::int from jsonb_array_elements(p_config -> 'quick_screen_questions') with ordinality as t(e, o)
    loop
      update public.quick_screen_questions
      set position = v_pos, label = v_item ->> 'label', question = v_item ->> 'question'
      where id = (v_item ->> 'id')::uuid and config_id = v_draft_id
      returning id into v_id;
      if v_id is null then
        insert into public.quick_screen_questions (config_id, position, label, question)
        values (v_draft_id, v_pos, v_item ->> 'label', v_item ->> 'question');
      end if;
      v_id := null;
    end loop;
  end if;

  -- Collection Prompts (before dimensions: required prompts refer to them)
  if p_config ? 'collection_prompts' then
    delete from public.collection_prompts p
    where p.config_id = v_draft_id
      and p.id not in (
        select (e ->> 'id')::uuid
        from jsonb_array_elements(p_config -> 'collection_prompts') e
        where e ->> 'id' is not null
      );

    for v_item, v_pos in
      select e, o::int from jsonb_array_elements(p_config -> 'collection_prompts') with ordinality as t(e, o)
    loop
      update public.collection_prompts
      set position = v_pos, question = v_item ->> 'question',
          required = coalesce((v_item ->> 'required')::boolean, true)
      where id = (v_item ->> 'id')::uuid and config_id = v_draft_id
      returning id into v_id;
      if v_id is null then
        insert into public.collection_prompts (config_id, position, question, required)
        values (v_draft_id, v_pos, v_item ->> 'question', coalesce((v_item ->> 'required')::boolean, true));
      end if;
      v_id := null;
    end loop;
  end if;

  -- Counter-Case Prompts
  if p_config ? 'counter_case_prompts' then
    delete from public.counter_case_prompts p
    where p.config_id = v_draft_id
      and p.id not in (
        select (e ->> 'id')::uuid
        from jsonb_array_elements(p_config -> 'counter_case_prompts') e
        where e ->> 'id' is not null
      );

    for v_item, v_pos in
      select e, o::int from jsonb_array_elements(p_config -> 'counter_case_prompts') with ordinality as t(e, o)
    loop
      update public.counter_case_prompts
      set position = v_pos, prompt = v_item ->> 'prompt'
      where id = (v_item ->> 'id')::uuid and config_id = v_draft_id
      returning id into v_id;
      if v_id is null then
        insert into public.counter_case_prompts (config_id, position, prompt)
        values (v_draft_id, v_pos, v_item ->> 'prompt');
      end if;
      v_id := null;
    end loop;
  end if;

  -- Dimensions, their concrete prompts and required Collection Prompts
  if p_config ? 'dimensions' then
    delete from public.dimensions d
    where d.config_id = v_draft_id
      and d.id not in (
        select (e ->> 'id')::uuid
        from jsonb_array_elements(p_config -> 'dimensions') e
        where e ->> 'id' is not null
      );

    for v_item, v_pos in
      select e, o::int from jsonb_array_elements(p_config -> 'dimensions') with ordinality as t(e, o)
    loop
      update public.dimensions
      set position = v_pos,
          title = v_item ->> 'title',
          question = v_item ->> 'question',
          claim_coverage = coalesce(v_item ->> 'claim_coverage', ''),
          high_score_signals = coalesce(v_item ->> 'high_score_signals', ''),
          low_score_signals = coalesce(v_item ->> 'low_score_signals', ''),
          disqualifying_below = (v_item ->> 'disqualifying_below')::int
      where id = (v_item ->> 'id')::uuid and config_id = v_draft_id
      returning id into v_dim_id;

      if v_dim_id is null then
        insert into public.dimensions (
          config_id, position, title, question, claim_coverage,
          high_score_signals, low_score_signals, disqualifying_below
        ) values (
          v_draft_id, v_pos, v_item ->> 'title', v_item ->> 'question',
          coalesce(v_item ->> 'claim_coverage', ''),
          coalesce(v_item ->> 'high_score_signals', ''),
          coalesce(v_item ->> 'low_score_signals', ''),
          (v_item ->> 'disqualifying_below')::int
        )
        returning id into v_dim_id;
      end if;

      -- concrete prompts
      delete from public.dimension_prompts dp
      where dp.dimension_id = v_dim_id
        and dp.id not in (
          select (e ->> 'id')::uuid
          from jsonb_array_elements(coalesce(v_item -> 'prompts', '[]'::jsonb)) e
          where e ->> 'id' is not null
        );

      for v_sub, v_sub_pos in
        select e, o::int from jsonb_array_elements(coalesce(v_item -> 'prompts', '[]'::jsonb)) with ordinality as t(e, o)
      loop
        update public.dimension_prompts
        set position = v_sub_pos, prompt = v_sub ->> 'prompt'
        where id = (v_sub ->> 'id')::uuid and dimension_id = v_dim_id
        returning id into v_id;
        if v_id is null then
          insert into public.dimension_prompts (dimension_id, position, prompt)
          values (v_dim_id, v_sub_pos, v_sub ->> 'prompt');
        end if;
        v_id := null;
      end loop;

      -- required Collection Prompts, by position in the saved list
      delete from public.dimension_required_prompts r where r.dimension_id = v_dim_id;
      insert into public.dimension_required_prompts (dimension_id, prompt_id)
      select v_dim_id, p.id
      from public.collection_prompts p
      where p.config_id = v_draft_id
        and p.position in (
          select (x #>> '{}')::int
          from jsonb_array_elements(coalesce(v_item -> 'required_prompt_positions', '[]'::jsonb)) x
        );

      v_dim_id := null;
    end loop;
  end if;
end;
$$;
