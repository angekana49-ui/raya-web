-- ============================================================
-- RAYA - Migration 034: Enable Realtime for remaining tables
-- ============================================================

-- Ensure notifications stream works if social center is active
do $$
begin
  if exists (select from pg_tables where schemaname = 'public' and tablename = 'notifications') then
    execute 'ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;';
  end if;
exception when duplicate_object then null;
end $$;

-- Same for users if realtime presence names need rapid database profile syncing
do $$
begin
  if exists (select from pg_tables where schemaname = 'public' and tablename = 'users') then
    execute 'ALTER PUBLICATION supabase_realtime ADD TABLE public.users;';
  end if;
exception when duplicate_object then null;
end $$;
