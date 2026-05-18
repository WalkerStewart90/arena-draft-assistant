-- Required for npm run seed:sos-premier (service role upserts).
-- Run once in Supabase SQL Editor if you see: permission denied for table card_aggregates

grant usage on schema public to service_role;

grant select, insert, update, delete on table public.card_aggregates to service_role;
