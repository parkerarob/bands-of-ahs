-- provenance: harden append-only stewardship history against default Supabase grants.
revoke update, delete, truncate on public.sponsor_stewardship_events from service_role;
revoke delete, truncate on public.sponsor_stewardship_items from service_role;
revoke all on public.sponsor_stewardship_items, public.sponsor_stewardship_events from public, anon, authenticated;
