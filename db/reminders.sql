-- DAVELE — reminders (one-time, safe to re-run)
--
-- Why: the live public.notes table has no reminder_at column, so reminders
-- could never be stored. This adds ONLY that column (plus an index) to
-- public.notes. It does not touch any other table, does not change or delete
-- existing rows, and does not change Row Level Security: the column belongs
-- to the notes row, so the existing owner-only policies on notes
-- ((select auth.uid()) = user_id) already restrict who can read or change it.
--
-- Run it in Supabase Dashboard -> SQL Editor.

alter table public.notes
  add column if not exists reminder_at timestamptz default null;

-- Speeds up "my upcoming reminders" lookups.
create index if not exists notes_user_reminder_idx
  on public.notes (user_id, reminder_at)
  where reminder_at is not null;

-- Make the new column visible to the API immediately.
notify pgrst, 'reload schema';

-- Verify (should return one row: reminder_at | timestamp with time zone)
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'notes' and column_name = 'reminder_at';
