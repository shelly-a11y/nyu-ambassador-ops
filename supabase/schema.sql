create extension if not exists pgcrypto;

create type public.member_role as enum ('ambassador', 'lead', 'admin');
create type public.record_type as enum ('work', 'ugc', 'poster', 'referral');
create type public.record_status as enum ('pending', 'approved', 'rejected', 'posted');

create table public.schools (
  id text primary key,
  name text not null unique,
  created_at timestamptz not null default now()
);

create table public.school_members (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools(id) on delete cascade,
  display_name text not null,
  role public.member_role not null default 'ambassador',
  created_at timestamptz not null default now(),
  unique (school_id, display_name)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  school_id text not null references public.schools(id),
  member_id uuid references public.school_members(id),
  role public.member_role not null default 'ambassador',
  created_at timestamptz not null default now()
);

create table public.records (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools(id),
  submitted_by uuid not null references auth.users(id) on delete cascade,
  record_type public.record_type not null,
  status public.record_status not null default 'pending',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.schools (id, name) values
  ('nyu', 'NYU'),
  ('columbia', 'Columbia'),
  ('barnard', 'Barnard'),
  ('parsons', 'Parsons'),
  ('fta', 'FTA'),
  ('sva', 'SVA'),
  ('cornell-tech', 'Cornell Tech')
on conflict (id) do nothing;

insert into public.school_members (school_id, display_name, role) values
  ('nyu', 'Shelly', 'lead'),
  ('nyu', 'Ada', 'ambassador'),
  ('nyu', 'Harrison', 'ambassador'),
  ('nyu', 'Karim', 'ambassador'),
  ('nyu', 'Xinyi', 'ambassador'),
  ('nyu', 'Rhea', 'ambassador'),
  ('nyu', 'Abby', 'ambassador'),
  ('nyu', 'Kley', 'ambassador'),
  ('nyu', 'Sallie', 'ambassador'),
  ('nyu', 'Lydia', 'ambassador'),
  ('columbia', 'Alex', 'lead'),
  ('columbia', 'Melody', 'ambassador'),
  ('columbia', 'Cindy', 'ambassador'),
  ('columbia', 'Michelle', 'ambassador'),
  ('barnard', 'Samra', 'lead'),
  ('barnard', 'Maria', 'ambassador')
on conflict (school_id, display_name) do update set role = excluded.role;

create or replace function public.my_school_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select school_id from public.profiles where id = auth.uid()
$$;

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
      and school_id = target_school_id
      and role in ('lead', 'admin')
  )
$$;

alter table public.schools enable row level security;
alter table public.school_members enable row level security;
alter table public.profiles enable row level security;
alter table public.records enable row level security;

create policy "members can view schools"
  on public.schools for select to authenticated using (true);

create policy "members can view same school roster"
  on public.school_members for select to authenticated
  using (school_id = public.my_school_id());

create policy "members can view same school profiles"
  on public.profiles for select to authenticated
  using (school_id = public.my_school_id());

create policy "members can view same school records"
  on public.records for select to authenticated
  using (school_id = public.my_school_id());

create policy "members can submit for their school"
  on public.records for insert to authenticated
  with check (submitted_by = auth.uid() and school_id = public.my_school_id());

create policy "managers can review records"
  on public.records for update to authenticated
  using (public.can_manage_school(school_id))
  with check (school_id = public.my_school_id());

create policy "managers can update records"
  on public.records for update to authenticated
  using (public.can_manage_school(school_id))
  with check (school_id = public.my_school_id());

create policy "submitters or managers can delete records"
  on public.records for delete to authenticated
  using (submitted_by = auth.uid() or public.can_manage_school(school_id));

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger records_touch_updated_at
before update on public.records
for each row execute function public.touch_updated_at();
