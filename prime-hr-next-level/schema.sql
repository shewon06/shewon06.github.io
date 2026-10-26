-- PRIME HR NEXT LEVEL • Production-oriented starter schema
-- Run ONLY in your own Supabase project SQL Editor.
-- All HR data stays inside your project (not in public GitHub).
-- IMPORTANT: review in a development project and test authorization before importing real HR data.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role text not null default 'employee' check (role in ('employee','hr','admin')),
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists profiles_email_lookup on public.profiles (lower(email));

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  staff_code text not null unique,
  full_name text not null,
  email text,
  designation text not null,
  department text,
  branch_id uuid references public.branches(id) on delete restrict,
  joined_on date,
  status text not null default 'active' check(status in ('active','on_leave','exited')),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists employees_branch_id_idx on public.employees(branch_id);
create index if not exists employees_auth_user_idx on public.employees(auth_user_id);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  work_date date not null default ((now() at time zone 'Asia/Colombo')::date),
  check_in timestamptz not null default now(),
  check_out timestamptz,
  mode text not null default 'office' check(mode in ('office','field')),
  created_at timestamptz not null default now(),
  unique(employee_id, work_date),
  constraint check_out_after_check_in check(check_out is null or check_out >= check_in)
);
create index if not exists attendance_work_date_idx on public.attendance(work_date);

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  kind text not null check(kind in ('Annual','Casual','Medical','No-pay')),
  from_date date not null,
  to_date date not null,
  reason text not null,
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint leave_valid_range check(to_date >= from_date)
);
create index if not exists leave_status_idx on public.leave_requests(status, created_at desc);

create table if not exists public.candidates (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  position text not null,
  branch_id uuid references public.branches(id) on delete set null,
  stage text not null default 'Applied' check(stage in ('Applied','Screening','Interview','Offer','Hired','Rejected')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Never take role or active status from a self-registration payload.
create or replace function public.create_new_profile()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.profiles (id, email, full_name, role, is_active)
  values(new.id, lower(coalesce(new.email,'')),
         coalesce(new.raw_user_meta_data->>'full_name',''),
         'employee', false)
  on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists prime_hr_new_user on auth.users;
create trigger prime_hr_new_user after insert on auth.users
for each row execute function public.create_new_profile();

-- Strict helper predicates: security definer prevents RLS recursion.
create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles
    where id=auth.uid() and is_active=true)
$$;
create or replace function public.is_hr()
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles
    where id=auth.uid() and is_active=true and role in ('admin','hr'))
$$;
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles
    where id=auth.uid() and is_active=true and role='admin')
$$;
create or replace function public.can_view_employee(p_employee_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select public.is_hr() or
   (public.is_active_user() and exists(
     select 1 from public.employees
     where id=p_employee_id and auth_user_id=auth.uid()
   ))
$$;
create or replace function public.employee_self_id()
returns uuid language sql stable security definer set search_path='' as $$
  select e.id from public.employees e
  where e.auth_user_id=auth.uid() and e.status='active'
    and public.is_active_user()
  limit 1
$$;

-- Secure attendance RPC, using database server time (not browser clocks).
create or replace function public.hr_check_in(p_mode text default 'office')
returns uuid language plpgsql security definer set search_path='' as $$
declare v_employee uuid; v_id uuid;
begin
  v_employee:=public.employee_self_id();
  if v_employee is null then raise exception 'No active linked employee record'; end if;
  if p_mode not in ('office','field') then raise exception 'Invalid mode'; end if;
  insert into public.attendance(employee_id,work_date,check_in,mode)
  values(v_employee,(now() at time zone 'Asia/Colombo')::date,now(),p_mode)
  on conflict(employee_id,work_date) do nothing returning id into v_id;
  if v_id is null then raise exception 'Already checked in today'; end if;
  return v_id;
end; $$;
create or replace function public.hr_check_out()
returns uuid language plpgsql security definer set search_path='' as $$
declare v_employee uuid; v_id uuid;
begin
  v_employee:=public.employee_self_id();
  if v_employee is null then raise exception 'No active linked employee record'; end if;
  update public.attendance set check_out=now()
  where employee_id=v_employee
    and work_date=(now() at time zone 'Asia/Colombo')::date
    and check_out is null returning id into v_id;
  if v_id is null then raise exception 'No open check-in for today'; end if;
  return v_id;
end; $$;

-- RLS: the browser cannot bypass these policies.
alter table public.profiles enable row level security;
alter table public.branches enable row level security;
alter table public.employees enable row level security;
alter table public.attendance enable row level security;
alter table public.leave_requests enable row level security;
alter table public.candidates enable row level security;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
using (id=auth.uid() or public.is_hr());
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update to authenticated
using(public.is_admin()) with check(public.is_admin());

drop policy if exists branches_read on public.branches;
create policy branches_read on public.branches for select to authenticated
using(public.is_active_user());
drop policy if exists branches_admin_insert on public.branches;
create policy branches_admin_insert on public.branches for insert to authenticated
with check(public.is_admin());
drop policy if exists branches_admin_update on public.branches;
create policy branches_admin_update on public.branches for update to authenticated
using(public.is_admin()) with check(public.is_admin());

drop policy if exists employees_read on public.employees;
create policy employees_read on public.employees for select to authenticated
using(public.can_view_employee(id));
drop policy if exists employees_hr_insert on public.employees;
create policy employees_hr_insert on public.employees for insert to authenticated
with check(public.is_hr());
drop policy if exists employees_hr_update on public.employees;
create policy employees_hr_update on public.employees for update to authenticated
using(public.is_hr()) with check(public.is_hr());

drop policy if exists attendance_read on public.attendance;
create policy attendance_read on public.attendance for select to authenticated
using(public.can_view_employee(employee_id));
-- No INSERT, UPDATE or DELETE policy for attendance: use restricted RPCs.

drop policy if exists leave_read on public.leave_requests;
create policy leave_read on public.leave_requests for select to authenticated
using(public.can_view_employee(employee_id));
drop policy if exists leave_employee_insert on public.leave_requests;
create policy leave_employee_insert on public.leave_requests for insert to authenticated
with check(status='pending' and decided_by is null and decided_at is null
  and employee_id=public.employee_self_id());
drop policy if exists leave_hr_update on public.leave_requests;
create policy leave_hr_update on public.leave_requests for update to authenticated
using(public.is_hr()) with check(public.is_hr());

drop policy if exists candidates_hr_read on public.candidates;
create policy candidates_hr_read on public.candidates for select to authenticated
using(public.is_hr());
drop policy if exists candidates_hr_insert on public.candidates;
create policy candidates_hr_insert on public.candidates for insert to authenticated
with check(public.is_hr());
drop policy if exists candidates_hr_update on public.candidates;
create policy candidates_hr_update on public.candidates for update to authenticated
using(public.is_hr()) with check(public.is_hr());

-- Explicit API grants. The public/anon key does NOT give unrestricted data access.
revoke all on public.profiles,public.branches,public.employees,public.attendance,public.leave_requests,public.candidates from anon;
grant select on public.profiles to authenticated;
grant update(role,is_active) on public.profiles to authenticated;
grant select,insert,update on public.branches to authenticated;
grant select,insert,update on public.employees to authenticated;
grant select on public.attendance to authenticated;
grant select,insert,update on public.leave_requests to authenticated;
grant select,insert,update on public.candidates to authenticated;
revoke all on function public.create_new_profile() from public,anon,authenticated;
revoke all on function public.is_active_user() from public,anon;
revoke all on function public.is_hr() from public,anon;
revoke all on function public.is_admin() from public,anon;
revoke all on function public.can_view_employee(uuid) from public,anon;
revoke all on function public.employee_self_id() from public,anon;
revoke all on function public.hr_check_in(text) from public,anon;
revoke all on function public.hr_check_out() from public,anon;
grant execute on function public.is_active_user(),public.is_hr(),public.is_admin(),public.can_view_employee(uuid),public.employee_self_id(),public.hr_check_in(text),public.hr_check_out() to authenticated;

-- Non-sensitive locations only. Rename/add branches as needed via SQL.
insert into public.branches(name) values
 ('Gampaha Head Office'),('Kiribathgoda'),('Kandy Office Complex'),
 ('Gampola'),('Nuwara Eliya')
on conflict(name) do nothing;

-- BOOTSTRAP FIRST ADMIN: after registering with their real email address,
-- run manually in SQL Editor, replacing the email below. NEVER put this in JS.
-- update public.profiles set role='admin', is_active=true
-- where email=lower('YOUR_REAL_EMAIL@example.com');
