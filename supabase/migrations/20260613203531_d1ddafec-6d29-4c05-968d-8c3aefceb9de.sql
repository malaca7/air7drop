
-- Enum for roles
create type public.app_role as enum ('admin', 'user');

-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create policy "Profiles are viewable by everyone authenticated"
  on public.profiles for select to authenticated using (true);
create policy "Users insert own profile"
  on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "Users update own profile"
  on public.profiles for update to authenticated using (auth.uid() = id);

-- User roles
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "Users see own roles" on public.user_roles for select to authenticated
  using (auth.uid() = user_id or public.has_role(auth.uid(),'admin'));

-- Transfer sessions
create table public.transfers (
  id uuid primary key default gen_random_uuid(),
  short_code text not null unique,
  sender_id uuid references auth.users(id) on delete set null,
  receiver_id uuid references auth.users(id) on delete set null,
  status text not null default 'pending', -- pending|connected|completed|failed|expired|cancelled
  total_bytes bigint not null default 0,
  transferred_bytes bigint not null default 0,
  file_count int not null default 0,
  avg_speed_bps bigint,
  duration_ms int,
  password_hash text,
  require_approval boolean not null default false,
  expires_at timestamptz not null,
  sender_device text,
  receiver_device text,
  sender_ip text,
  receiver_ip text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
grant select, insert, update on public.transfers to authenticated;
grant all on public.transfers to service_role;
alter table public.transfers enable row level security;

-- Sender owns it; receiver (once set) can read; anyone authenticated can look up by short_code to join
create policy "Sender manages transfer" on public.transfers for all to authenticated
  using (auth.uid() = sender_id) with check (auth.uid() = sender_id);
create policy "Receiver reads transfer" on public.transfers for select to authenticated
  using (auth.uid() = receiver_id);
create policy "Anyone authenticated can lookup by short_code" on public.transfers for select to authenticated
  using (true);
create policy "Receiver can claim transfer" on public.transfers for update to authenticated
  using (receiver_id is null or auth.uid() = receiver_id)
  with check (auth.uid() = receiver_id or auth.uid() = sender_id);
create policy "Admin sees all transfers" on public.transfers for select to authenticated
  using (public.has_role(auth.uid(),'admin'));

-- Files (metadata only)
create table public.transfer_files (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.transfers(id) on delete cascade,
  name text not null,
  mime_type text,
  size_bytes bigint not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.transfer_files to authenticated;
grant all on public.transfer_files to service_role;
alter table public.transfer_files enable row level security;
create policy "Read files of accessible transfers" on public.transfer_files for select to authenticated
  using (exists(select 1 from public.transfers t where t.id = transfer_id
    and (t.sender_id = auth.uid() or t.receiver_id = auth.uid() or public.has_role(auth.uid(),'admin'))));
create policy "Sender writes files" on public.transfer_files for all to authenticated
  using (exists(select 1 from public.transfers t where t.id = transfer_id and t.sender_id = auth.uid()))
  with check (exists(select 1 from public.transfers t where t.id = transfer_id and t.sender_id = auth.uid()));

-- Audit logs
create table public.transfer_logs (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid references public.transfers(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  event text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);
grant select, insert on public.transfer_logs to authenticated;
grant all on public.transfer_logs to service_role;
alter table public.transfer_logs enable row level security;
create policy "Read own logs" on public.transfer_logs for select to authenticated
  using (user_id = auth.uid() or exists(select 1 from public.transfers t where t.id = transfer_id
    and (t.sender_id = auth.uid() or t.receiver_id = auth.uid()))
    or public.has_role(auth.uid(),'admin'));
create policy "Insert own logs" on public.transfer_logs for insert to authenticated
  with check (user_id = auth.uid() or user_id is null);

-- updated_at trigger
create or replace function public.tg_set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger profiles_updated before update on public.profiles for each row execute function public.tg_set_updated_at();
create trigger transfers_updated before update on public.transfers for each row execute function public.tg_set_updated_at();

-- Auto-create profile + default 'user' role on signup
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url, email)
  values (new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
    new.raw_user_meta_data->>'avatar_url',
    new.email)
  on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (new.id, 'user') on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Realtime for signaling (we use broadcast channels, but enable for transfers table changes)
alter publication supabase_realtime add table public.transfers;
alter publication supabase_realtime add table public.transfer_files;
