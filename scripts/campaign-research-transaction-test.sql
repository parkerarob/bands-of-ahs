-- Synthetic access-management proof. All fixture and audit writes are rolled back.
begin;
do $$
declare
 actor uuid := gen_random_uuid(); target uuid := gen_random_uuid(); result jsonb;
begin
 insert into public.staff(id,email,pin_hash,display_name,role)
 values(actor,actor::text||'@example.com','not-a-login','Synthetic campaign test director','director'),
 (target,target::text||'@example.com','not-a-login','Synthetic campaign test researcher','program_staff');
 result := public.manage_staff_access_with_audit(target,'change_role','campaign_researcher',null,null,null,'Synthetic rollback-only check',actor,'/test/campaign-research');
 if (result->>'role') <> 'campaign_researcher' then raise exception 'Role was not changed'; end if;
 if not exists(select 1 from public.audit_log where record_id=target::text and action='staff_access_change_role') then raise exception 'Audit missing'; end if;
 if has_function_privilege('anon','public.manage_staff_access_with_audit(uuid,text,text,text,text,text,text,uuid,text)','execute') then raise exception 'Anonymous access management permitted'; end if;
 begin
  perform public.manage_staff_access_with_audit(actor,'change_role','campaign_researcher',null,null,null,'Synthetic denied change',target,'/test/campaign-research');
  raise exception 'Campaign researcher managed staff access';
 exception when others then
  if SQLERRM <> 'active director actor required' then raise; end if;
 end;
end;
$$;
rollback;
select 'PASS campaign research rollback-only role checks' as result;
