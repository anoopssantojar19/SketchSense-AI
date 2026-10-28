create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role text not null default 'officer' check (role in ('officer', 'admin')),
  created_at timestamptz not null default now()
);

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = (select auth.uid());
$$;
revoke all on function public.current_app_role() from public;
grant execute on function public.current_app_role() to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1)),
    'officer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  case_number text not null,
  location text not null default 'Unspecified',
  status text not null default 'open' check (status in ('open', 'in_review', 'closed')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (created_by, case_number)
);

create table if not exists public.sketches (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  prompt text not null,
  features jsonb not null default '{}'::jsonb,
  image_path text not null,
  version integer not null default 1,
  created_by uuid not null references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references public.cases(id) on delete set null,
  actor_id uuid not null references auth.users(id) on delete restrict,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.cases enable row level security;
alter table public.sketches enable row level security;
alter table public.audit_logs enable row level security;

revoke all on public.profiles, public.cases, public.sketches, public.audit_logs from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select, insert, update on public.cases to authenticated;
grant select, insert, update on public.sketches to authenticated;
grant select, insert on public.audit_logs to authenticated;

drop policy if exists profiles_read_self_or_admin on public.profiles;
create policy profiles_read_self_or_admin on public.profiles
for select to authenticated
using (id = (select auth.uid()) or (select public.current_app_role()) = 'admin');

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

drop policy if exists cases_select_owner_admin on public.cases;
create policy cases_select_owner_admin on public.cases
for select to authenticated
using (created_by = (select auth.uid()) or (select public.current_app_role()) = 'admin');

drop policy if exists cases_insert_self on public.cases;
create policy cases_insert_self on public.cases
for insert to authenticated
with check (created_by = (select auth.uid()));

drop policy if exists cases_update_owner_admin on public.cases;
create policy cases_update_owner_admin on public.cases
for update to authenticated
using (created_by = (select auth.uid()) or (select public.current_app_role()) = 'admin')
with check (created_by = (select auth.uid()) or (select public.current_app_role()) = 'admin');

drop policy if exists sketches_select_case_access on public.sketches;
create policy sketches_select_case_access on public.sketches
for select to authenticated
using (exists (
  select 1 from public.cases c where c.id = case_id
  and (c.created_by = (select auth.uid()) or (select public.current_app_role()) = 'admin')
));

drop policy if exists sketches_insert_self on public.sketches;
create policy sketches_insert_self on public.sketches
for insert to authenticated
with check (
  created_by = (select auth.uid()) and exists (
    select 1 from public.cases c where c.id = case_id
    and (c.created_by = (select auth.uid()) or (select public.current_app_role()) = 'admin')
  )
);

drop policy if exists sketches_review_case_access on public.sketches;
create policy sketches_review_case_access on public.sketches
for update to authenticated
using (created_by = (select auth.uid()) or (select public.current_app_role()) = 'admin')
with check (created_by = (select auth.uid()) or (select public.current_app_role()) = 'admin');

drop policy if exists audit_select_self_admin on public.audit_logs;
create policy audit_select_self_admin on public.audit_logs
for select to authenticated
using (actor_id = (select auth.uid()) or (select public.current_app_role()) = 'admin');

drop policy if exists audit_insert_self on public.audit_logs;
create policy audit_insert_self on public.audit_logs
for insert to authenticated
with check (
  actor_id = (select auth.uid()) and (
    case_id is null or exists (
      select 1 from public.cases c where c.id = case_id
      and (c.created_by = (select auth.uid()) or (select public.current_app_role()) = 'admin')
    )
  )
);

-- Grants required by PostgREST; row-level security still controls each record.
grant usage on schema public to authenticated;
grant select, insert, update on public.cases to authenticated;
grant select, insert, update on public.sketches to authenticated;
grant select, insert on public.audit_logs to authenticated;

insert into storage.buckets (id, name, public)
values ('sketch-images', 'sketch-images', false)
on conflict (id) do nothing;

drop policy if exists sketch_images_insert_own on storage.objects;
create policy sketch_images_insert_own on storage.objects
for insert to authenticated
with check (
  bucket_id = 'sketch-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.cases c
    where c.id::text = (storage.foldername(name))[2]
      and (c.created_by = (select auth.uid()) or (select public.current_app_role()) = 'admin')
  )
);

drop policy if exists sketch_images_read_own on storage.objects;
create policy sketch_images_read_own on storage.objects
for select to authenticated
using (
  bucket_id = 'sketch-images'
  and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.current_app_role()) = 'admin')
);

drop policy if exists sketch_images_delete_own on storage.objects;
create policy sketch_images_delete_own on storage.objects
for delete to authenticated
using (bucket_id = 'sketch-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
