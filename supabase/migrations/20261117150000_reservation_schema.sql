create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create table if not exists public.courts (
  id uuid primary key default gen_random_uuid(),
  complex_id uuid not null references public.sport_complexes(id) on delete cascade,
  name text not null,
  sport text not null,
  min_players integer not null default 2 check (min_players > 0),
  max_players integer not null default 14 check (max_players >= min_players and max_players <= 14),
  price_per_slot integer not null check (price_per_slot >= 0),
  price_per_player integer check (price_per_player is null or price_per_player >= 0),
  slot_duration_minutes integer not null default 60 check (slot_duration_minutes > 0),
  open_time time not null default '08:00',
  close_time time not null default '23:00',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint courts_open_close_check check (open_time < close_time),
  constraint courts_slot_price_check check (price_per_slot > 0 or coalesce(price_per_player, 0) > 0),
  constraint courts_complex_name_key unique (complex_id, name)
);

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  complex_id uuid not null references public.sport_complexes(id),
  court_id uuid not null references public.courts(id),
  reservation_date date not null,
  start_time time not null,
  end_time time not null,
  player_count integer not null check (player_count > 0),
  total_amount integer not null check (total_amount >= 0),
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'confirmed', 'cancelled', 'expired')),
  payment_status text not null default 'pending'
    check (payment_status in ('pending', 'paid', 'partially_refunded', 'refunded')),
  code_prefix text,
  code_hash text unique,
  code_ciphertext text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservations_time_check check (end_time > start_time)
);

alter table public.reservations
  add column if not exists code_ciphertext text;

create table if not exists public.reservation_players (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  full_name text not null,
  email text not null,
  rut text not null,
  status text not null default 'active'
    check (status in ('active', 'pending_payment', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id),
  payment_type text not null check (payment_type in ('initial', 'additional_players')),
  mp_preference_id text,
  mp_payment_id text unique,
  amount integer not null check (amount >= 0),
  currency text not null default 'CLP' check (currency = 'CLP'),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'refunded')),
  raw_webhook jsonb,
  paid_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.reservation_players
  add column if not exists payment_id uuid references public.payments(id);

create table if not exists public.reservation_modifications (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id),
  action_type text not null
    check (action_type in ('players_updated', 'players_added', 'cancellation_requested')),
  previous_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.cancellation_requests (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id),
  complex_id uuid not null references public.sport_complexes(id),
  reason text not null,
  status text not null default 'pending_review'
    check (status in ('pending_review', 'approved', 'rejected', 'refund_processing', 'refunded')),
  resolution_notes text,
  approved_refund_amount integer check (approved_refund_amount is null or approved_refund_amount >= 0),
  mp_refund_id text,
  requested_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.venue_policies (
  id uuid primary key default gen_random_uuid(),
  complex_id uuid not null unique references public.sport_complexes(id) on delete cascade,
  min_hours_before_cancellation integer not null default 24 check (min_hours_before_cancellation >= 0),
  refund_percentage integer not null default 0 check (refund_percentage between 0 and 100),
  requires_id_card boolean not null default true,
  required_documents text[] not null default array['Cédula de identidad vigente'],
  policy_summary text not null,
  evaluation_procedure text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.email_notifications (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  recipient_email text not null,
  notification_type text not null
    check (notification_type in ('booking_confirmed', 'player_replaced', 'players_added', 'cancellation_received')),
  idempotency_key text not null unique,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  brevo_message_id text,
  retry_count integer not null default 0 check (retry_count >= 0),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.code_lookup_attempts (
  id uuid primary key default gen_random_uuid(),
  client_key text not null,
  attempted_at timestamptz not null default now(),
  success boolean not null default false
);

create table if not exists public.venue_memberships (
  complex_id uuid not null references public.sport_complexes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'manager' check (role in ('owner', 'manager')),
  created_at timestamptz not null default now(),
  primary key (complex_id, user_id)
);

create index if not exists courts_complex_active_idx
  on public.courts (complex_id, is_active, sport);
create index if not exists reservations_court_date_idx
  on public.reservations (court_id, reservation_date, start_time);
create index if not exists reservations_code_prefix_idx
  on public.reservations (code_prefix);
create index if not exists reservation_players_reservation_status_idx
  on public.reservation_players (reservation_id, status);
create unique index if not exists reservation_players_active_unique_email_idx
  on public.reservation_players (reservation_id, lower(trim(email)))
  where status in ('active', 'pending_payment');
create unique index if not exists reservation_players_active_unique_rut_idx
  on public.reservation_players (
    reservation_id,
    upper(replace(replace(trim(rut), '.', ''), '-', ''))
  )
  where status in ('active', 'pending_payment');
create index if not exists payments_reservation_type_created_idx
  on public.payments (reservation_id, payment_type, created_at desc);
create index if not exists cancellation_requests_complex_status_idx
  on public.cancellation_requests (complex_id, status, requested_at desc);
create index if not exists email_notifications_pending_idx
  on public.email_notifications (status, created_at);
create index if not exists code_lookup_attempts_client_time_idx
  on public.code_lookup_attempts (client_key, attempted_at desc);
create unique index if not exists idx_reservations_confirmed_slot
  on public.reservations (court_id, reservation_date, start_time)
  where status = 'confirmed';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'reservations_no_overlapping_active_slot'
      and conrelid = 'public.reservations'::regclass
  ) then
    alter table public.reservations
      add constraint reservations_no_overlapping_active_slot
      exclude using gist (
        court_id with =,
        tsrange(reservation_date + start_time, reservation_date + end_time, '[)') with &&
      )
      where (status in ('pending_payment', 'confirmed'));
  end if;
end
$$;

alter table public.courts enable row level security;
alter table public.reservations enable row level security;
alter table public.reservation_players enable row level security;
alter table public.payments enable row level security;
alter table public.reservation_modifications enable row level security;
alter table public.cancellation_requests enable row level security;
alter table public.venue_policies enable row level security;
alter table public.email_notifications enable row level security;
alter table public.code_lookup_attempts enable row level security;
alter table public.venue_memberships enable row level security;

drop policy if exists "Active courts are public" on public.courts;
create policy "Active courts are public" on public.courts
  for select to anon, authenticated using (is_active);

drop policy if exists "Venue policies are public" on public.venue_policies;
create policy "Venue policies are public" on public.venue_policies
  for select to anon, authenticated using (true);

revoke all on table
  public.courts,
  public.reservations,
  public.reservation_players,
  public.payments,
  public.reservation_modifications,
  public.cancellation_requests,
  public.venue_policies,
  public.email_notifications,
  public.code_lookup_attempts,
  public.venue_memberships
from public, anon, authenticated;

grant select on public.courts, public.venue_policies to anon, authenticated;
grant all on table
  public.courts,
  public.reservations,
  public.reservation_players,
  public.payments,
  public.reservation_modifications,
  public.cancellation_requests,
  public.venue_policies,
  public.email_notifications,
  public.code_lookup_attempts,
  public.venue_memberships
to service_role;
