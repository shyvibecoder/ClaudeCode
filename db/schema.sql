-- Puck — Supabase schema (price history, phase 1).
-- Run this ONCE in your Supabase project: SQL Editor → paste → Run.
--
-- Design notes:
--  • The GitHub Actions scanner writes here using the SERVICE_ROLE key (server-side only,
--    a GitHub secret — NEVER in the browser or committed code). The static dashboard does
--    NOT read Supabase; the scanner keeps exporting slim JSON for the frontend.
--  • RLS is ON with no public policies, so the anon key can neither read nor write. The
--    service_role key bypasses RLS (that's the scanner). If you ever want the dashboard to
--    read directly, add a SELECT policy for the `anon` role explicitly (see the commented
--    block at the bottom) — opt-in, never by default.

create table if not exists public.price_history (
  ticker      text         not null,
  d           date         not null,             -- trading date (UTC)
  close       double precision not null,
  source      text         not null default 'yahoo',
  inserted_at timestamptz  not null default now(),
  primary key (ticker, d)                         -- enables idempotent upsert (on_conflict=ticker,d)
);

-- Fast "give me this ticker's series" / "latest close" lookups.
create index if not exists price_history_ticker_d_idx on public.price_history (ticker, d desc);

-- Lock it down: RLS on, no policies → only the service_role key (the scanner) can touch it.
alter table public.price_history enable row level security;

-- ── OPT-IN ONLY: uncomment to let the public anon key READ price history (e.g. if you later
--    want the static dashboard to query Supabase directly). Leave commented for now. ──
-- create policy "anon can read price history"
--   on public.price_history for select to anon using (true);
