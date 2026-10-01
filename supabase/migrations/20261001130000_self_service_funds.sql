-- Self-service funds (replaces decision 2's "one fund, seeded accounts only").
--
-- A fund admin signs up with email confirmation; once confirmed, the app calls
-- create_fund_with_admin() with the service role, which creates the fund, the
-- admin profile and a published default config v1. Admins add analysts/admins
-- in the app (server code with the service role creates the auth user and the
-- profile).
--
-- The auth.users insert trigger is removed: public sign-up lets users write
-- their own metadata, so the database must never derive fund membership from
-- it. Profiles are only created by server code.

drop trigger on_auth_user_created on auth.users;
drop function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Default framework config (same content as the M1 seed) for a new fund.
-- ---------------------------------------------------------------------------

create function private.create_default_config(p_fund_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_config_id uuid;
  v_d1 uuid;
  v_d2 uuid;
begin
  insert into public.framework_configs (
    fund_id, version, status, is_active,
    tier_definitions, confidence_rules, sufficiency_rule, score_anchors, classification_criteria
  ) values (
    p_fund_id, 1, 'draft', false,

    jsonb_build_object(
      'primary', jsonb_build_object(
        'definition', 'Direct, first-order evidence originating from the company, underlying institution, or original event itself; typically the strongest basis for substantiating specific factual or technical claims.',
        'examples', 'Official documentation; filings; regulatory documents; patents; technical reports; benchmark methodology/results; customer case studies; public talks/interviews by founders'),
      'secondary', jsonb_build_object(
        'definition', 'Independent second-order interpretations, analyses, or reports that synthesize, evaluate, or contextualize primary information; useful for triangulation, external validation, and market framing, but less direct than primary sources.',
        'examples', 'Reputable journalism; analyst research; high quality industry reports; academic or institutional publications'),
      'tertiary', jsonb_build_object(
        'definition', 'Indirect or weakly validated summaries, opinions, or commentary that may be useful for lead generation or hypothesis formation, but usually provide limited support for high-confidence claims on their own.',
        'examples', 'Blogs; social media threads; newsletters; unverified summaries')
    ),

    jsonb_build_object(
      'evaluation', 'first_match',
      'levels', jsonb_build_array(
        jsonb_build_object(
          'level', 'high',
          'min_parties', 2,
          'min_parties_in_tiers', jsonb_build_object('tiers', jsonb_build_array('primary', 'secondary'), 'min', 1),
          'description', '≥2 independent parties, at least one Primary or Secondary.'),
        jsonb_build_object(
          'level', 'medium',
          'min_parties', 1,
          'min_parties_in_tiers', jsonb_build_object('tiers', jsonb_build_array('primary', 'secondary'), 'min', 1),
          'description', 'A single Primary or Secondary party.'),
        jsonb_build_object(
          'level', 'low',
          'min_parties', 1,
          'description', 'Tertiary only.')
      ),
      'open_conflict_downgrade', 1,
      'independence', 'Sources with the same authoring party count as one independent party.'
    ),

    jsonb_build_object(
      'locked', jsonb_build_array(
        jsonb_build_object('id', 'SR1', 'rule', 'A Fact or Inference must cite at least one source with a verbatim excerpt.'),
        jsonb_build_object('id', 'SR3', 'rule', 'A required Collection Prompt with no covering claim becomes an Uncertainty (U#).')
      ),
      'claims_per_score', jsonb_build_object('min', 2, 'max', 5),
      'score_cap', 2
    ),

    jsonb_build_object(
      '0-1', 'The dimension is not meaningfully supported: the case is missing, contradicted by evidence, or dominated by the counter-case.',
      '2', 'The dimension has some positive signals, but support remains shallow, weakly evidenced, or highly fragile.',
      '3', 'The dimension is credibly supported: a coherent case exists and is linked to some evidence, but important uncertainties remain.',
      '4', 'The dimension is strongly supported: key claims are evidenced, the mechanism is clear, and the case holds against credible counter-arguments.',
      '5', 'The dimension is exceptionally supported: evidence is strong, the underlying mechanism is compelling, and the dimension materially strengthens the outlier thesis.'
    ),

    jsonb_build_object(
      'rules', jsonb_build_array(
        jsonb_build_object(
          'outcome', 'pass',
          'match', 'any',
          'predicates', jsonb_build_array(
            jsonb_build_object('type', 'any_dimension_disqualifying')),
          'note', 'Structurally unlikely to produce an outlier outcome: (i) upside bounded by market structure, (ii) no credible entry wedge or adoption trigger, or (iii) counter-case dominates by design.'),
        jsonb_build_object(
          'outcome', 'watch',
          'match', 'any',
          'predicates', jsonb_build_array(
            jsonb_build_object('type', 'min_dimension_score', 'op', '<=', 'value', 2),
            jsonb_build_object('type', 'open_decision_critical_uncertainties', 'op', '>=', 'value', 1)),
          'note', 'Right-tail scenario is plausible but progress is constrained by an external gating variable.'),
        jsonb_build_object(
          'outcome', 'proceed',
          'match', 'all',
          'predicates', jsonb_build_array(),
          'note', 'A plausible right-tail scenario can be articulated and at least one mechanism-based moat hypothesis can be stated in testable form. No dimension rated as disqualifying.')
      )
    )
  )
  returning id into v_config_id;

  insert into public.quick_screen_questions (config_id, position, label, question) values
    (v_config_id, 1, 'Market Structure Concentration Mechanism',
      'Is this plausibly a winner-takes-most market or otherwise value-concentrating? What specific mechanism (e.g. Network Effects) would drive concentration?'),
    (v_config_id, 2, 'Value step-change',
      'What is the order-of-magnitude improvement (cost, performance, speed, reliability, capability) relative to the status quo?');

  insert into public.collection_prompts (config_id, position, question, required) values
    (v_config_id, 1, 'What exactly is the product/capability, and what is demonstrably built today?', true),
    (v_config_id, 2, 'Who are the founder and key operators, and what relevant background or track record do they have?', true),
    (v_config_id, 3, 'What is the core non-consensus assumption underpinning the thesis (i.e. what does the company believe that most informed people would disagree with), and what evidence supports it?', true),
    (v_config_id, 4, 'Who are credible users/customers/partners (if any), and what evidence exists?', true),
    (v_config_id, 5, 'What is the go-to-market path, and what evidence supports feasibility of distribution at scale?', true),
    (v_config_id, 6, 'What are concrete milestones achieved, and what milestones are explicitly next?', true),
    (v_config_id, 7, 'What is the competitive landscape and incumbent posture, and what evidence supports differentiation or defensibility?', true),
    (v_config_id, 8, 'How does the company capture value (pricing logic, business model, unit-level economics direction), and what evidence exists regarding willingness to pay?', true),
    (v_config_id, 9, 'What constraints exist (regulation, capital intensity, adoption friction), and how do they bound scaling and value capture?', true);

  insert into public.counter_case_prompts (config_id, position, prompt) values
    (v_config_id, 1, 'Competitive neutralization: What is the strongest competitor or incumbent response that would plausibly prevent the company from reaching the outlier scenario? State the mechanism.'),
    (v_config_id, 2, 'Binding constraint: What is the most plausible binding constraint that limits outcomes if the product works?'),
    (v_config_id, 3, 'Fragile assumption: Which single assumption in the thesis is most fragile, and what is the most credible way it fails?');

  insert into public.dimensions (
    config_id, position, title, question, claim_coverage, high_score_signals, low_score_signals, disqualifying_below
  ) values (
    v_config_id, 1, 'Team & Execution',
    'Does the team have credible founder-market fit and the ability to execute through the next constraint-driven phases?',
    'Relevant domain depth; evidence of execution velocity; the ability to navigate high-friction environments.',
    'Clear founder-market fit, demonstrated pace of execution, and credible ability to scale the organization through the next constraint-driven phase.',
    'Weak domain fit, slow progress without clear external blockers, or missing capability in the next bottleneck area.',
    2
  ) returning id into v_d1;

  insert into public.dimensions (
    config_id, position, title, question, claim_coverage, high_score_signals, low_score_signals, disqualifying_below
  ) values (
    v_config_id, 2, 'Monopoly Path & Moats',
    'If the product works, why does the company keep winning as the market matures?',
    'A mechanism-based moat stated as a testable hypothesis and an explicit account of competitive dynamics.',
    'Moat strengthens with time/scale, and the thesis anticipates and withstands credible incumbent responses.',
    'Easy replication, rapid commoditization, distribution lock-out by incumbents, or a "brand-only" defense.',
    2
  ) returning id into v_d2;

  insert into public.dimension_prompts (dimension_id, position, prompt) values
    (v_d1, 1, 'Justify founder-market fit (domain expertise, customer insight, credibility with buyers/partners).'),
    (v_d1, 2, 'Provide evidence of execution velocity and learning rate (shipping cadence, milestone throughput, iteration speed).'),
    (v_d1, 3, 'Identify the next organizational bottleneck (hiring, sales, manufacturing, regulatory) and assess whether the team has demonstrated capacity to address it.'),
    (v_d2, 1, 'Identify the primary moat mechanism and formulate it as a testable claim.'),
    (v_d2, 2, 'Explain why the moat should strengthen over time (switching costs, scale/cost curves, etc.).'),
    (v_d2, 3, 'Evaluate possible incumbent and competitor responses and justify why they fail to neutralize the advantage.');

  insert into public.dimension_required_prompts (dimension_id, prompt_id)
  select v_d1, p.id from public.collection_prompts p
  where p.config_id = v_config_id and p.position in (2, 6);

  insert into public.dimension_required_prompts (dimension_id, prompt_id)
  select v_d2, p.id from public.collection_prompts p
  where p.config_id = v_config_id and p.position in (7);

  update public.framework_configs
  set status = 'published', is_active = true, published_at = now()
  where id = v_config_id;

  return v_config_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_fund_with_admin(): onboarding after email confirmation.
-- Service role only (called from server code); not executable by API users.
-- ---------------------------------------------------------------------------

create function public.create_fund_with_admin(
  p_user_id uuid,
  p_fund_name text,
  p_display_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fund_id uuid;
begin
  if not exists (
    select 1 from auth.users u
    where u.id = p_user_id and u.email_confirmed_at is not null
  ) then
    raise exception 'user % does not exist or has not confirmed their email', p_user_id
      using errcode = 'check_violation';
  end if;

  if exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception 'user % already belongs to a fund', p_user_id
      using errcode = 'unique_violation';
  end if;

  if coalesce(length(trim(p_fund_name)), 0) = 0 then
    raise exception 'fund name is required' using errcode = 'check_violation';
  end if;

  insert into public.funds (name) values (trim(p_fund_name)) returning id into v_fund_id;

  insert into public.profiles (id, fund_id, display_name, role)
  values (p_user_id, v_fund_id, nullif(trim(p_display_name), ''), 'admin');

  perform private.create_default_config(v_fund_id);

  return v_fund_id;
end;
$$;

revoke all on function private.create_default_config(uuid) from public, anon, authenticated;
revoke all on function public.create_fund_with_admin(uuid, text, text) from public, anon, authenticated;
grant execute on function public.create_fund_with_admin(uuid, text, text) to service_role;
