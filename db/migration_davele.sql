-- ==============================================================================
-- DAVELE DATABASE MIGRATION SCRIPT
-- Application: DAVELE Notes & Productivity
-- Compatible with existing Supabase schema and RLS
-- ==============================================================================

-- 1. Extend the existing 'notes' table with additional properties
alter table notes 
  add column if not exists folder_id bigint default null,
  add column if not exists is_pinned boolean not null default false,
  add column if not exists is_favorite boolean not null default false,
  add column if not exists is_archived boolean not null default false,
  add column if not exists color text not null default 'default',
  add column if not exists reminder_at timestamptz default null,
  add column if not exists share_token text default null unique,
  add column if not exists share_enabled boolean not null default false,
  add column if not exists checklist jsonb not null default '[]'::jsonb;

-- 2. Create 'folders' table with self-referencing hierarchy (parent_id for nested subfolders)
create table if not exists folders (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  parent_id bigint references folders (id) on delete cascade,
  color text default null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table folders enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'folders' and policyname = 'Users see their own folders') then
    create policy "Users see their own folders" on folders for select to authenticated
      using (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'folders' and policyname = 'Users add folders as themselves') then
    create policy "Users add folders as themselves" on folders for insert to authenticated
      with check (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'folders' and policyname = 'Users change their own folders') then
    create policy "Users change their own folders" on folders for update to authenticated
      using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'folders' and policyname = 'Users delete their own folders') then
    create policy "Users delete their own folders" on folders for delete to authenticated
      using (user_id = (select auth.uid()));
  end if;
end $$;

grant select, insert, update, delete on folders to authenticated;

-- Add foreign key constraint to notes table if not exists
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints 
    where constraint_name = 'notes_folder_fk' and table_name = 'notes'
  ) then
    alter table notes 
      add constraint notes_folder_fk foreign key (folder_id) 
      references folders (id) on delete set null;
  end if;
end $$;

-- 3. Create 'tags' table and 'note_tags' junction table
create table if not exists tags (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  color text default null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table tags enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'tags' and policyname = 'Users see their own tags') then
    create policy "Users see their own tags" on tags for select to authenticated
      using (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'tags' and policyname = 'Users add tags as themselves') then
    create policy "Users add tags as themselves" on tags for insert to authenticated
      with check (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'tags' and policyname = 'Users change their own tags') then
    create policy "Users change their own tags" on tags for update to authenticated
      using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'tags' and policyname = 'Users delete their own tags') then
    create policy "Users delete their own tags" on tags for delete to authenticated
      using (user_id = (select auth.uid()));
  end if;
end $$;

grant select, insert, update, delete on tags to authenticated;

create table if not exists note_tags (
  note_id bigint not null references notes (id) on delete cascade,
  tag_id bigint not null references tags (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  primary key (note_id, tag_id)
);

alter table note_tags enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'note_tags' and policyname = 'Users see their own note_tags') then
    create policy "Users see their own note_tags" on note_tags for select to authenticated
      using (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'note_tags' and policyname = 'Users add note_tags as themselves') then
    create policy "Users add note_tags as themselves" on note_tags for insert to authenticated
      with check (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'note_tags' and policyname = 'Users delete their own note_tags') then
    create policy "Users delete their own note_tags" on note_tags for delete to authenticated
      using (user_id = (select auth.uid()));
  end if;
end $$;

grant select, insert, update, delete on note_tags to authenticated;

-- 4. Create 'note_versions' table for Version History & Rollback
create table if not exists note_versions (
  id bigint generated always as identity primary key,
  note_id bigint not null references notes (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  body text not null,
  checklist jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table note_versions enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'note_versions' and policyname = 'Users see their own note_versions') then
    create policy "Users see their own note_versions" on note_versions for select to authenticated
      using (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'note_versions' and policyname = 'Users add note_versions as themselves') then
    create policy "Users add note_versions as themselves" on note_versions for insert to authenticated
      with check (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'note_versions' and policyname = 'Users delete their own note_versions') then
    create policy "Users delete their own note_versions" on note_versions for delete to authenticated
      using (user_id = (select auth.uid()));
  end if;
end $$;

grant select, insert, update, delete on note_versions to authenticated;

-- 5. Create 'note_attachments' table for uploaded files and images
create table if not exists note_attachments (
  id bigint generated always as identity primary key,
  note_id bigint not null references notes (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  file_name text not null,
  file_size bigint not null,
  file_type text not null,
  storage_path text not null,
  created_at timestamptz not null default now()
);

alter table note_attachments enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'note_attachments' and policyname = 'Users see their own attachments') then
    create policy "Users see their own attachments" on note_attachments for select to authenticated
      using (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'note_attachments' and policyname = 'Users add attachments as themselves') then
    create policy "Users add attachments as themselves" on note_attachments for insert to authenticated
      with check (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'note_attachments' and policyname = 'Users delete their own attachments') then
    create policy "Users delete their own attachments" on note_attachments for delete to authenticated
      using (user_id = (select auth.uid()));
  end if;
end $$;

grant select, insert, update, delete on note_attachments to authenticated;

-- 6. Shared notes
-- SECURITY: there is intentionally NO broad "public can select shared notes"
-- policy. Such a policy is OR'ed with the owner policy, which let any visitor
-- or signed-in user list every shared note of every account. Shared notes are
-- read one at a time by token through public.get_shared_note(), defined in
-- db/security_rls.sql — run that file after this one.
drop policy if exists "Public access to shared notes" on notes;

-- 7. Performance Indexes
create index if not exists notes_folder_idx on notes (user_id, folder_id);
create index if not exists notes_pinned_idx on notes (user_id, is_pinned);
create index if not exists notes_favorite_idx on notes (user_id, is_favorite);
create index if not exists notes_archived_idx on notes (user_id, is_archived);
create index if not exists notes_share_token_idx on notes (share_token) where share_token is not null;
create index if not exists folders_parent_idx on folders (user_id, parent_id);
create index if not exists note_versions_note_idx on note_versions (note_id, created_at desc);
