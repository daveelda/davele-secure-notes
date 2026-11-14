-- ==============================================================================
-- DAVELE — Account isolation / Row Level Security hardening
-- Safe to run more than once. Does NOT delete or modify any user data.
--
-- Run in the Supabase SQL editor (as the project owner).
--
-- What it does
--   1. Enables RLS on every private DAVELE table that exists.
--   2. (Re)creates owner-only policies: auth.uid() = user_id for
--      select / insert / update / delete.
--   3. Removes the old "Public access to shared notes" policy, which let ANY
--      visitor (and any signed-in user) list every shared note of every user.
--   4. Replaces it with get_shared_note(token): returns exactly one shared note
--      for a known token, and nothing else.
--   5. Removes direct table access for the anonymous role.
-- ==============================================================================

-- ---------------------------------------------------------------------------
-- notes
-- ---------------------------------------------------------------------------
alter table public.notes enable row level security;

drop policy if exists "Public access to shared notes" on public.notes;

drop policy if exists "Users see their own notes" on public.notes;
create policy "Users see their own notes" on public.notes
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users add notes as themselves" on public.notes;
create policy "Users add notes as themselves" on public.notes
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users change their own notes" on public.notes;
create policy "Users change their own notes" on public.notes
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users delete their own notes" on public.notes;
create policy "Users delete their own notes" on public.notes
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Anonymous visitors never need direct access to the notes table.
revoke all on public.notes from anon;
grant select, insert, update, delete on public.notes to authenticated;

-- ---------------------------------------------------------------------------
-- Other private tables (only if they exist — they are created by
-- migration_davele.sql). Owner-only access, and child rows must point at a
-- note the user owns.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  -- Simple owner-only tables
  foreach t in array array['folders', 'tags'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all on public.%I from anon', t);

      execute format('drop policy if exists "Users see their own %s" on public.%I', t, t);
      execute format('create policy "Users see their own %s" on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t, t);
      execute format('drop policy if exists "Users add %s as themselves" on public.%I', t, t);
      execute format('create policy "Users add %s as themselves" on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t, t);
      execute format('drop policy if exists "Users change their own %s" on public.%I', t, t);
      execute format('create policy "Users change their own %s" on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t, t);
      execute format('drop policy if exists "Users delete their own %s" on public.%I', t, t);
      execute format('create policy "Users delete their own %s" on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t, t);
    end if;
  end loop;

  -- Tables whose rows belong to a note (no update policy: rows are immutable)
  foreach t in array array['note_versions', 'note_attachments', 'note_tags'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all on public.%I from anon', t);

      execute format('drop policy if exists "Users see their own %s" on public.%I', t, t);
      execute format('create policy "Users see their own %s" on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t, t);

      execute format('drop policy if exists "Users add %s as themselves" on public.%I', t, t);
      execute format(
        'create policy "Users add %s as themselves" on public.%I for insert to authenticated with check ('
        || '(select auth.uid()) = user_id and exists (select 1 from public.notes n where n.id = note_id and n.user_id = (select auth.uid())))',
        t, t);

      execute format('drop policy if exists "Users delete their own %s" on public.%I', t, t);
      execute format('create policy "Users delete their own %s" on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t, t);
    end if;
  end loop;

  -- Older policy names from migration_davele.sql for attachments
  if to_regclass('public.note_attachments') is not null then
    drop policy if exists "Users see their own attachments" on public.note_attachments;
    drop policy if exists "Users add attachments as themselves" on public.note_attachments;
    drop policy if exists "Users delete their own attachments" on public.note_attachments;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Shared notes: read exactly one note by its unguessable token.
-- SECURITY DEFINER so it works without a broad SELECT policy; it only ever
-- returns non-sensitive display fields for a note whose owner enabled sharing.
-- (plpgsql so it can be created before the share columns exist.)
-- ---------------------------------------------------------------------------
create or replace function public.get_shared_note(p_token text)
returns table (
  title text,
  body text,
  color text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_token is null or length(p_token) < 16 then
    return;
  end if;

  return query
    select n.title, n.body, n.color, n.created_at, n.updated_at
    from public.notes n
    where n.share_token = p_token
      and n.share_enabled = true
    limit 1;
end;
$$;

revoke all on function public.get_shared_note(text) from public;
grant execute on function public.get_shared_note(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Verification: lists every policy on DAVELE tables. Each one should be
-- restricted to auth.uid() = user_id (no "true" / share_enabled conditions).
-- ---------------------------------------------------------------------------
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('notes', 'note_versions', 'note_attachments', 'folders', 'tags', 'note_tags')
order by tablename, cmd;
