-- Sponsorship stewardship. No gift settlement, recognition publication or email dispatch.
-- provenance: staff-maintained follow-up with append-only actor/evidence history.
create table public.sponsor_stewardship_items (
  id uuid primary key,
  gift_id uuid not null references public.sponsor_gifts(id),
  kind text not null check (kind in ('receipt','recognition','badge','program_listing','social_post','personal_thanks','recognition_event','renewal','custom')),
  title text not null check (length(btrim(title)) between 1 and 160),
  due_on date,
  owner_name text not null default '' check (length(owner_name) <= 100),
  status text not null default 'open' check (status in ('open','done','waived')),
  evidence text not null default '' check (length(evidence) <= 2000),
  source text not null default 'staff_stewardship',
  updated_by_staff_id uuid not null references public.staff(id),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status = 'open' or length(btrim(evidence)) > 0)
);
create index sponsor_stewardship_due_idx on public.sponsor_stewardship_items(status, due_on);
create index sponsor_stewardship_gift_idx on public.sponsor_stewardship_items(gift_id);

create table public.sponsor_stewardship_events (
  request_id uuid primary key,
  item_id uuid not null references public.sponsor_stewardship_items(id),
  actor_staff_id uuid not null references public.staff(id),
  before_state jsonb,
  after_state jsonb not null,
  source text not null default 'staff_stewardship',
  created_at timestamptz not null default now()
);

alter table public.sponsor_stewardship_items enable row level security;
alter table public.sponsor_stewardship_events enable row level security;
revoke all on public.sponsor_stewardship_items, public.sponsor_stewardship_events from anon, authenticated;
grant select, insert, update on public.sponsor_stewardship_items to service_role;
grant select, insert on public.sponsor_stewardship_events to service_role;

create or replace function public.save_sponsor_stewardship(
  p_id uuid, p_request_id uuid, p_actor uuid, p_expected_version integer,
  p_gift_id uuid, p_kind text, p_title text, p_due_on date,
  p_owner_name text, p_status text, p_evidence text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  previous public.sponsor_stewardship_items;
  saved public.sponsor_stewardship_items;
  replay public.sponsor_stewardship_events;
  gift_status text;
begin
  if p_expected_version is null or p_expected_version < 0 then
    raise exception 'Invalid expected version' using errcode = '23514';
  end if;
  -- Serialize both initial insert and updates for an item, including retries.
  perform pg_advisory_xact_lock(hashtextextended(p_id::text, 0));
  select * into replay from public.sponsor_stewardship_events where request_id = p_request_id;
  if found then
    if replay.item_id <> p_id or replay.actor_staff_id <> p_actor
      or (replay.after_state->>'version')::integer <> p_expected_version + 1
      or replay.after_state->>'gift_id' is distinct from p_gift_id::text
      or replay.after_state->>'kind' is distinct from p_kind
      or replay.after_state->>'title' is distinct from btrim(p_title)
      or replay.after_state->>'due_on' is distinct from p_due_on::text
      or replay.after_state->>'owner_name' is distinct from btrim(p_owner_name)
      or replay.after_state->>'status' is distinct from p_status
      or replay.after_state->>'evidence' is distinct from btrim(p_evidence)
    then
      raise exception 'Request key conflict' using errcode = '23505';
    end if;
    return replay.after_state;
  end if;
  select * into previous from public.sponsor_stewardship_items where id = p_id for update;
  if found then
    if previous.version <> p_expected_version or previous.gift_id <> p_gift_id then
      raise exception 'Stewardship record changed; reload before saving' using errcode = '40001';
    end if;
  elsif p_expected_version <> 0 then
    raise exception 'Stewardship record changed; reload before saving' using errcode = '40001';
  end if;
  select status into gift_status from public.sponsor_gifts where id = p_gift_id for share;
  if gift_status is distinct from 'confirmed' then
    raise exception 'Only confirmed gifts can be used for stewardship updates' using errcode = '23514';
  end if;
  insert into public.sponsor_stewardship_items
    (id, gift_id, kind, title, due_on, owner_name, status, evidence, updated_by_staff_id)
  values (p_id, p_gift_id, p_kind, btrim(p_title), p_due_on, btrim(p_owner_name), p_status, btrim(p_evidence), p_actor)
  on conflict (id) do update set
    kind = excluded.kind, title = excluded.title, due_on = excluded.due_on,
    owner_name = excluded.owner_name, status = excluded.status, evidence = excluded.evidence,
    updated_by_staff_id = excluded.updated_by_staff_id,
    version = sponsor_stewardship_items.version + 1, updated_at = now()
  returning * into saved;
  insert into public.sponsor_stewardship_events(request_id, item_id, actor_staff_id, before_state, after_state)
  values (p_request_id, p_id, p_actor, case when previous.id is null then null else to_jsonb(previous) end, to_jsonb(saved));
  return to_jsonb(saved);
end;
$$;
revoke all on function public.save_sponsor_stewardship(uuid,uuid,uuid,integer,uuid,text,text,date,text,text,text) from public, anon, authenticated;
grant execute on function public.save_sponsor_stewardship(uuid,uuid,uuid,integer,uuid,text,text,date,text,text,text) to service_role;
