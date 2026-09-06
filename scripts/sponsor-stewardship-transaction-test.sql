-- Run through the production wrapper db query --linked --file only after schema review.
-- Synthetic fixtures and all changes are rolled back. No app send/capture routes are invoked.
begin;
do $$
declare
  actor uuid := gen_random_uuid(); gift uuid := gen_random_uuid(); item uuid := gen_random_uuid();
  request uuid := gen_random_uuid(); result jsonb; replay jsonb;
begin
  insert into public.staff(id,email,pin_hash,display_name,role)
    values(actor,actor::text||'@example.com','not-a-login','Synthetic stewardship test','sponsor_lead');
  insert into public.sponsor_gifts(id,business_name,status,method,amount_cents)
    values(gift,'Synthetic rollback-only sponsor','confirmed','other',100);
  result := public.save_sponsor_stewardship(item,request,actor,0,gift,'renewal','Review renewal','2027-09-06','','open','');
  replay := public.save_sponsor_stewardship(item,request,actor,0,gift,'renewal','Review renewal','2027-09-06','','open','');
  if result <> replay then raise exception 'Retry changed saved result'; end if;
  if (select count(*) from public.sponsor_stewardship_events where item_id=item) <> 1 then raise exception 'Retry duplicated event'; end if;
  begin
    perform public.save_sponsor_stewardship(item,request,actor,0,gift,'renewal','Different payload','2027-09-06','','open','');
    raise exception 'Changed payload reused request key';
  exception when unique_violation then null; end;
  begin
    perform public.save_sponsor_stewardship(item,gen_random_uuid(),actor,0,gift,'renewal','Stale edit',null,'','open','');
    raise exception 'Stale version accepted';
  exception when serialization_failure then null; end;
  begin
    perform public.save_sponsor_stewardship(item,gen_random_uuid(),actor,1,gift,'renewal','No evidence',null,'','done','');
    raise exception 'Completion without evidence accepted';
  exception when check_violation then null; end;
  result := public.save_sponsor_stewardship(item,gen_random_uuid(),actor,1,gift,'renewal','Review renewal','2027-09-06','','done','Synthetic evidence');
  if (result->>'version')::integer <> 2 then raise exception 'Version did not increment'; end if;
  if (select count(*) from public.sponsor_stewardship_events where item_id=item) <> 2 then raise exception 'Missing history'; end if;
  update public.sponsor_gifts set status='refunded' where id=gift;
  begin
    perform public.save_sponsor_stewardship(item,gen_random_uuid(),actor,2,gift,'renewal','Inactive gift',null,'','open','');
    raise exception 'Inactive gift accepted';
  exception when check_violation then null; end;
  if has_table_privilege('service_role','public.sponsor_stewardship_events','update') or has_table_privilege('service_role','public.sponsor_stewardship_events','delete') then raise exception 'Mutable history grants'; end if;
  if has_table_privilege('anon','public.sponsor_stewardship_items','select') or has_table_privilege('authenticated','public.sponsor_stewardship_items','select') then raise exception 'Public table access'; end if;
  if has_function_privilege('anon','public.save_sponsor_stewardship(uuid,uuid,uuid,integer,uuid,text,text,date,text,text,text)','execute') then raise exception 'Public RPC access'; end if;
end;
$$;
rollback;
select 'PASS stewardship rollback-only transaction checks' as result;
