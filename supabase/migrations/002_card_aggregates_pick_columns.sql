-- Optional: extend card_aggregates for Premier Draft pick stats (run in Supabase SQL Editor).
alter table public.card_aggregates
  add column if not exists pick_count integer,
  add column if not exists avg_pick_number numeric,
  add column if not exists data_source text default 'premier_draft';
