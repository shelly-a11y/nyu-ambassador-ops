-- 002: approval-based sign-in, admin console, reimbursements.
-- Safe to run more than once in the Supabase SQL Editor (after schema.sql).
--
-- BEFORE RUNNING: replace YOUR_EMAIL@example.com at the bottom of this file
-- with the email you sign in with. That account becomes the admin.

-- ---------------------------------------------------------------------------
-- Access control: approved emails + access requests
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists email text;

create table if not exists public.allowed_emails (
  email text primary key check (email = lower(email)),
  display_name text not null,
  school_id text not null references public.schools(id),
  role public.member_role not null default 'ambassador',
  created_at timestamptz not null default now()
);

create table if not exists public.access_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  school_id text not null references public.schools(id),
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

-- Admins manage every school; leads manage their own school.
create or replace function public.can_manage_school(target_school_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and (role = 'admin' or (role = 'lead' and school_id = target_school_id))
  )
$$;

-- Called by the app right after sign-in. Creates the profile if the email was approved.
create or replace function public.claim_profile()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  user_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  approved public.allowed_emails;
  result public.profiles;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;

  select * into result from public.profiles where id = uid;
  if found then
    if result.email is null then
      update public.profiles set email = user_email where id = uid returning * into result;
    end if;
    return result;
  end if;

  select * into approved from public.allowed_emails where email = user_email;
  if not found then
    return null;
  end if;

  insert into public.profiles (id, display_name, school_id, role, email)
  values (uid, approved.display_name, approved.school_id, approved.role, user_email)
  returning * into result;

  update public.access_requests set status = 'approved', updated_at = now() where user_id = uid;
  return result;
end;
$$;

create or replace function public.request_access(p_display_name text, p_school_id text, p_note text default null)
returns public.access_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.access_requests;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if coalesce(trim(p_display_name), '') = '' then
    raise exception 'name is required';
  end if;

  insert into public.access_requests (user_id, email, display_name, school_id, note)
  values (auth.uid(), lower(auth.jwt() ->> 'email'), trim(p_display_name), p_school_id, p_note)
  on conflict (user_id) do update
    set display_name = excluded.display_name,
        school_id = excluded.school_id,
        note = excluded.note,
        status = 'pending',
        updated_at = now()
  returning * into result;
  return result;
end;
$$;

-- Admin approves a request (or pre-approves an email that has not signed in yet).
create or replace function public.approve_member(p_email text, p_display_name text, p_school_id text, p_role public.member_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_email text := lower(trim(p_email));
  target_user uuid;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  insert into public.allowed_emails (email, display_name, school_id, role)
  values (target_email, trim(p_display_name), p_school_id, p_role)
  on conflict (email) do update
    set display_name = excluded.display_name,
        school_id = excluded.school_id,
        role = excluded.role;

  select id into target_user from auth.users where lower(email) = target_email;
  if target_user is not null then
    insert into public.profiles (id, display_name, school_id, role, email)
    values (target_user, trim(p_display_name), p_school_id, p_role, target_email)
    on conflict (id) do update
      set display_name = excluded.display_name,
          school_id = excluded.school_id,
          role = excluded.role,
          email = excluded.email;
    update public.access_requests set status = 'approved', updated_at = now() where user_id = target_user;
  end if;
end;
$$;

create or replace function public.reject_request(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;
  update public.access_requests set status = 'rejected', updated_at = now() where user_id = p_user_id;
end;
$$;

-- Removes access: deletes the approval and the profile (their records stay).
create or replace function public.revoke_member(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_email text := lower(trim(p_email));
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;
  if target_email = lower(auth.jwt() ->> 'email') then
    raise exception 'you cannot remove yourself';
  end if;
  delete from public.allowed_emails where email = target_email;
  delete from public.profiles where lower(email) = target_email
    or id in (select id from auth.users where lower(email) = target_email);
end;
$$;

revoke execute on function public.claim_profile() from public, anon;
revoke execute on function public.request_access(text, text, text) from public, anon;
revoke execute on function public.approve_member(text, text, text, public.member_role) from public, anon;
revoke execute on function public.reject_request(uuid) from public, anon;
revoke execute on function public.revoke_member(text) from public, anon;
grant execute on function public.claim_profile() to authenticated;
grant execute on function public.request_access(text, text, text) to authenticated;
grant execute on function public.approve_member(text, text, text, public.member_role) to authenticated;
grant execute on function public.reject_request(uuid) to authenticated;
grant execute on function public.revoke_member(text) to authenticated;

alter table public.allowed_emails enable row level security;
alter table public.access_requests enable row level security;

drop policy if exists "admins manage allowed emails" on public.allowed_emails;
create policy "admins manage allowed emails"
  on public.allowed_emails for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "users see own request, admins see all" on public.access_requests;
create policy "users see own request, admins see all"
  on public.access_requests for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- Tighten existing policies: admins see everything, ambassadors submit as pending
-- ---------------------------------------------------------------------------

drop policy if exists "members can view same school roster" on public.school_members;
create policy "members can view same school roster"
  on public.school_members for select to authenticated
  using (school_id = public.my_school_id() or public.is_admin());

drop policy if exists "members can view same school profiles" on public.profiles;
create policy "members can view same school profiles"
  on public.profiles for select to authenticated
  using (id = auth.uid() or school_id = public.my_school_id() or public.is_admin());

drop policy if exists "members can view same school records" on public.records;
create policy "members can view same school records"
  on public.records for select to authenticated
  using (school_id = public.my_school_id() or public.is_admin());

drop policy if exists "members can submit for their school" on public.records;
create policy "members can submit for their school"
  on public.records for insert to authenticated
  with check (
    submitted_by = auth.uid()
    and school_id = public.my_school_id()
    and (status = 'pending' or public.can_manage_school(school_id))
  );

drop policy if exists "managers can review records" on public.records;
drop policy if exists "managers can update records" on public.records;
create policy "managers can update records"
  on public.records for update to authenticated
  using (public.can_manage_school(school_id))
  with check (public.can_manage_school(school_id));

drop policy if exists "submitters or managers can delete records" on public.records;
create policy "submitters or managers can delete records"
  on public.records for delete to authenticated
  using (submitted_by = auth.uid() or public.can_manage_school(school_id));

-- ---------------------------------------------------------------------------
-- Reimbursements
-- ---------------------------------------------------------------------------

create table if not exists public.reimbursements (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools(id),
  submitted_by uuid not null references auth.users(id) on delete cascade,
  submitter_name text not null,
  category text not null check (category in ('printing', 'tools', 'event', 'transport', 'food', 'other')),
  amount numeric(10, 2) not null check (amount > 0),
  currency text not null default 'USD',
  expense_date date not null,
  description text not null,
  receipt_url text,
  receipt_path text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'paid')),
  reviewer_note text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.reimbursements enable row level security;

drop policy if exists "view own or managed reimbursements" on public.reimbursements;
create policy "view own or managed reimbursements"
  on public.reimbursements for select to authenticated
  using (submitted_by = auth.uid() or public.can_manage_school(school_id));

drop policy if exists "submit own reimbursements" on public.reimbursements;
create policy "submit own reimbursements"
  on public.reimbursements for insert to authenticated
  with check (submitted_by = auth.uid() and school_id = public.my_school_id() and status = 'pending');

drop policy if exists "managers review reimbursements" on public.reimbursements;
create policy "managers review reimbursements"
  on public.reimbursements for update to authenticated
  using (public.can_manage_school(school_id))
  with check (public.can_manage_school(school_id));

drop policy if exists "delete own pending or managed reimbursements" on public.reimbursements;
create policy "delete own pending or managed reimbursements"
  on public.reimbursements for delete to authenticated
  using ((submitted_by = auth.uid() and status = 'pending') or public.can_manage_school(school_id));

drop trigger if exists reimbursements_touch_updated_at on public.reimbursements;
create trigger reimbursements_touch_updated_at
before update on public.reimbursements
for each row execute function public.touch_updated_at();

-- Receipt files: private bucket, one folder per user (<user_id>/<file>).
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

drop policy if exists "upload own receipts" on storage.objects;
create policy "upload own receipts"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "read own or managed receipts" on storage.objects;
create policy "read own or managed receipts"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'receipts'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.profiles p
        where p.id::text = (storage.foldername(name))[1]
          and public.can_manage_school(p.school_id)
      )
    )
  );

drop policy if exists "delete own receipts" on storage.objects;
create policy "delete own receipts"
  on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Bootstrap the first admin. Replace the email below, then run.
-- ---------------------------------------------------------------------------

do $$
declare
  admin_email text := lower('YOUR_EMAIL@example.com');
  admin_name text := 'Shelly';
begin
  if admin_email = 'your_email@example.com' then
    raise notice 'Admin email not set; skipped admin bootstrap.';
    return;
  end if;

  insert into public.allowed_emails (email, display_name, school_id, role)
  values (admin_email, admin_name, 'nyu', 'admin')
  on conflict (email) do update set role = 'admin';

  insert into public.profiles (id, display_name, school_id, role, email)
  select id, admin_name, 'nyu', 'admin', admin_email from auth.users where lower(email) = admin_email
  on conflict (id) do update set role = 'admin', email = excluded.email;
end;
$$;
