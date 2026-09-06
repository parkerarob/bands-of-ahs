-- Read-only campaign research role; no accounts or assignments are created.
-- Source: authorized sponsorship campaign entrance, website issue #58.
alter table public.staff drop constraint if exists staff_role_check;
alter table public.staff add constraint staff_role_check check (role in
  ('director','sponsor_lead','program_staff','booster_treasurer','event_worker','campaign_researcher'));

create or replace function public.manage_staff_access_with_audit(
  p_target_staff_id uuid,
  p_action text,
  p_role text,
  p_capability text,
  p_scope_type text,
  p_scope_ref text,
  p_reason text,
  p_actor_staff_id uuid,
  p_route text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_actor_name text;
  v_target_role text;
  v_new_role text;
  v_scope_id uuid;
begin
  if v_reason = '' then raise exception 'access change reason required'; end if;

  -- Serialize access changes so two directors cannot concurrently remove the
  -- last active director after both observe the same pre-change count.
  perform pg_advisory_xact_lock(hashtextextended('staff-access-management', 0));

  select display_name into v_actor_name
  from staff
  where id = p_actor_staff_id and role = 'director' and disabled_at is null
  for share;
  if v_actor_name is null then raise exception 'active director actor required'; end if;

  select role into v_target_role
  from staff where id = p_target_staff_id for update;
  if v_target_role is null then raise exception 'staff account not found' using errcode = 'P0002'; end if;

  if v_action = 'disable' then
    if p_target_staff_id = p_actor_staff_id then raise exception 'director cannot disable the active session'; end if;
    if v_target_role = 'director' and (
      select count(*) from staff where role = 'director' and disabled_at is null
    ) <= 1 then raise exception 'cannot disable the last active director'; end if;
    update staff set disabled_at = now(), disabled_reason = v_reason,
      disabled_by_staff_id = p_actor_staff_id,
      session_token = gen_random_uuid()
    where id = p_target_staff_id;
    v_new_role := v_target_role;
  elsif v_action = 'enable' then
    update staff set disabled_at = null, disabled_reason = '', disabled_by_staff_id = null,
      session_token = gen_random_uuid()
    where id = p_target_staff_id;
    v_new_role := v_target_role;
  elsif v_action = 'change_role' then
    if p_target_staff_id = p_actor_staff_id then raise exception 'director cannot change the active session role'; end if;
    if p_role not in (
      'director','sponsor_lead','program_staff','booster_treasurer','event_worker','campaign_researcher'
    ) then raise exception 'invalid staff role'; end if;
    if v_target_role = 'director' and p_role <> 'director' and (
      select count(*) from staff where role = 'director' and disabled_at is null
    ) <= 1 then raise exception 'cannot demote the last active director'; end if;
    update staff set role = p_role, session_token = gen_random_uuid()
    where id = p_target_staff_id;
    v_new_role := p_role;
  elsif v_action = 'grant_scope' then
    if nullif(btrim(coalesce(p_capability, '')), '') is null then raise exception 'capability required'; end if;
    if p_scope_type not in ('global','student','program_group','attendance_event','asset_type','form_definition') then
      raise exception 'invalid scope type';
    end if;
    if (p_scope_type = 'global' and btrim(coalesce(p_scope_ref, '')) <> '')
      or (p_scope_type <> 'global' and btrim(coalesce(p_scope_ref, '')) = '')
    then raise exception 'invalid scope reference'; end if;

    select id into v_scope_id
    from staff_scope_assignments
    where staff_id = p_target_staff_id
      and capability = btrim(p_capability)
      and scope_type = p_scope_type
      and scope_ref = btrim(coalesce(p_scope_ref, ''))
      and ends_at is null
    for update;
    if v_scope_id is null then
      insert into staff_scope_assignments (
        staff_id, capability, scope_type, scope_ref, reason,
        source, created_by_staff_id
      ) values (
        p_target_staff_id, btrim(p_capability), p_scope_type,
        btrim(coalesce(p_scope_ref, '')), v_reason,
        'staff_access_management', p_actor_staff_id
      ) returning id into v_scope_id;
    else
      update staff_scope_assignments set reason = v_reason,
        created_by_staff_id = p_actor_staff_id
      where id = v_scope_id;
    end if;
    v_new_role := v_target_role;
  elsif v_action = 'end_scope' then
    update staff_scope_assignments set ends_at = now(), reason = v_reason
    where staff_id = p_target_staff_id
      and capability = btrim(coalesce(p_capability, ''))
      and scope_type = p_scope_type
      and scope_ref = btrim(coalesce(p_scope_ref, ''))
      and ends_at is null
    returning id into v_scope_id;
    if v_scope_id is null then raise exception 'active scope assignment not found'; end if;
    v_new_role := v_target_role;
  else
    raise exception 'invalid access action';
  end if;

  insert into audit_log (
    actor_type, actor_id, actor_name, action, table_name,
    record_id, changes, route
  ) values (
    'staff', p_actor_staff_id::text, v_actor_name,
    'staff_access_' || v_action, 'staff', p_target_staff_id::text,
    jsonb_build_object(
      'role', jsonb_build_object('old', v_target_role, 'new', v_new_role),
      'capability', p_capability,
      'scope_type', p_scope_type,
      'scope_ref', p_scope_ref,
      'scope_assignment_id', v_scope_id,
      'reason', v_reason
    ),
    nullif(btrim(coalesce(p_route, '')), '')
  );

  return jsonb_build_object(
    'staffId', p_target_staff_id,
    'action', v_action,
    'role', v_new_role,
    'scopeAssignmentId', v_scope_id
  );
end;
$$;

revoke all on function public.manage_staff_access_with_audit(uuid,text,text,text,text,text,text,uuid,text)
  from public, anon, authenticated;
grant execute on function public.manage_staff_access_with_audit(uuid,text,text,text,text,text,text,uuid,text)
  to service_role;
