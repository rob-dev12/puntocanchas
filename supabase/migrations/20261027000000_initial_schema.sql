create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null default 'jugador@canchareserva.cl',
  wallet_balance numeric(12, 2) not null default 35000 check (wallet_balance >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.sport_complexes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sport_type text not null check (sport_type in ('Fútbol', 'Pádel', 'Tenis')),
  location text not null,
  rating numeric(2, 1) not null check (rating between 0 and 5),
  price_per_hour numeric(12, 2) not null check (price_per_hour > 0),
  available_times text[] not null default '{}',
  image_url text not null,
  image_position text,
  created_at timestamptz not null default now()
);

create table if not exists public.match_sessions (
  id uuid primary key default gen_random_uuid(),
  complex_id uuid not null references public.sport_complexes(id),
  complex_name text not null,
  sport_type text not null check (sport_type in ('Fútbol', 'Pádel', 'Tenis')),
  location text not null,
  schedule text not null,
  host_name text not null,
  description text not null,
  slots_total integer not null check (slots_total between 2 and 14),
  slots_taken integer not null check (slots_taken between 1 and slots_total),
  price_per_player numeric(12, 2) not null check (price_per_player > 0),
  players text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.match_participants (
  match_id uuid not null references public.match_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  player_name text not null,
  created_at timestamptz not null default now(),
  primary key (match_id, user_id)
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  complex_name text not null,
  sport_type text not null check (sport_type in ('Fútbol', 'Pádel', 'Tenis')),
  schedule text not null,
  booking_type text not null,
  price_paid numeric(12, 2) not null check (price_paid >= 0),
  created_at timestamptz not null default now()
);

create index if not exists match_sessions_created_at_idx on public.match_sessions (created_at desc);
create index if not exists bookings_user_created_at_idx on public.bookings (user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.sport_complexes enable row level security;
alter table public.match_sessions enable row level security;
alter table public.match_participants enable row level security;
alter table public.bookings enable row level security;

drop policy if exists "Players can read their profile" on public.profiles;
create policy "Players can read their profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));

drop policy if exists "Canchas are public" on public.sport_complexes;
create policy "Canchas are public" on public.sport_complexes
  for select to anon, authenticated using (true);

drop policy if exists "Partidos are public" on public.match_sessions;
create policy "Partidos are public" on public.match_sessions
  for select to anon, authenticated using (true);

drop policy if exists "Players can read their bookings" on public.bookings;
create policy "Players can read their bookings" on public.bookings
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.profiles, public.sport_complexes, public.match_sessions, public.match_participants, public.bookings from anon, authenticated;
grant select on public.sport_complexes, public.match_sessions to anon, authenticated;
grant select on public.profiles, public.bookings to authenticated;

create or replace function public.book_court(p_user_id uuid, p_complex_id uuid, p_schedule text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_complex public.sport_complexes%rowtype;
begin
  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then raise exception 'Perfil no encontrado.'; end if;

  select * into v_complex from public.sport_complexes where id = p_complex_id for update;
  if not found or not (p_schedule = any(v_complex.available_times)) then
    raise exception 'Ese horario ya no está disponible.';
  end if;
  if v_profile.wallet_balance < v_complex.price_per_hour then
    raise exception 'Saldo insuficiente para reservar la cancha.';
  end if;

  update public.profiles
    set wallet_balance = wallet_balance - v_complex.price_per_hour
    where id = p_user_id;
  update public.sport_complexes
    set available_times = array_remove(available_times, p_schedule)
    where id = p_complex_id;
  insert into public.bookings (user_id, complex_name, sport_type, schedule, booking_type, price_paid)
    values (p_user_id, v_complex.name, v_complex.sport_type, 'Cancha completa · ' || p_schedule, 'Cancha completa', v_complex.price_per_hour);
end;
$$;

create or replace function public.create_match(
  p_user_id uuid, p_complex_id uuid, p_schedule text, p_description text, p_slots_total integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_complex public.sport_complexes%rowtype;
  v_share numeric(12, 2);
  v_description text;
  v_match_id uuid;
begin
  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then raise exception 'Perfil no encontrado.'; end if;
  select * into v_complex from public.sport_complexes where id = p_complex_id for update;
  if not found or not (p_schedule = any(v_complex.available_times)) then
    raise exception 'Ese horario ya no está disponible.';
  end if;
  if p_slots_total < 4 or p_slots_total > 14 or (v_complex.sport_type <> 'Fútbol' and p_slots_total <> 4) then
    raise exception 'La cantidad de jugadores no es válida para este deporte.';
  end if;
  v_share := round(v_complex.price_per_hour / p_slots_total, 2);
  if v_profile.wallet_balance < v_share then raise exception 'Saldo insuficiente para pagar tu cuota.'; end if;
  v_description := coalesce(nullif(trim(p_description), ''), 'Partido exprés de ' || v_complex.sport_type || ' en ' || v_complex.name || '.');

  update public.profiles set wallet_balance = wallet_balance - v_share where id = p_user_id;
  update public.sport_complexes set available_times = array_remove(available_times, p_schedule) where id = p_complex_id;
  insert into public.match_sessions (
      complex_id, complex_name, sport_type, location, schedule, host_name,
      description, slots_total, slots_taken, price_per_player, players
    ) values (
      v_complex.id, v_complex.name, v_complex.sport_type, v_complex.location,
      'Hoy · ' || p_schedule, v_profile.name, v_description,
      p_slots_total, 1, v_share, array[v_profile.name]
    ) returning id into v_match_id;
    insert into public.match_participants (match_id, user_id, player_name)
      values (v_match_id, p_user_id, v_profile.name);
    insert into public.bookings (user_id, complex_name, sport_type, schedule, booking_type, price_paid)
    values (p_user_id, v_complex.name, v_complex.sport_type, 'Organizado · ' || p_schedule, 'Partido exprés · Creador', v_share);
end;
$$;

create or replace function public.join_match(p_user_id uuid, p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_match public.match_sessions%rowtype;
begin
  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then raise exception 'Perfil no encontrado.'; end if;
  select * into v_match from public.match_sessions where id = p_match_id for update;
  if not found then raise exception 'No se encontró el partido.'; end if;
  if v_match.slots_taken >= v_match.slots_total then raise exception 'El partido ya está completo.'; end if;
  if exists (select 1 from public.match_participants where match_id = p_match_id and user_id = p_user_id) then
    raise exception 'Ya tienes un cupo en este partido.';
  end if;
  if v_profile.wallet_balance < v_match.price_per_player then raise exception 'Saldo insuficiente para unirte al partido.'; end if;

  update public.profiles set wallet_balance = wallet_balance - v_match.price_per_player where id = p_user_id;
  update public.match_sessions set
    slots_taken = slots_taken + 1,
    players = array_append(players, v_profile.name)
    where id = p_match_id;
  insert into public.match_participants (match_id, user_id, player_name)
    values (p_match_id, p_user_id, v_profile.name);
  insert into public.bookings (user_id, complex_name, sport_type, schedule, booking_type, price_paid)
    values (p_user_id, v_match.complex_name, v_match.sport_type, 'Partido exprés · ' || v_match.schedule, 'Partido exprés · Jugador', v_match.price_per_player);
end;
$$;

create or replace function public.add_wallet_funds(p_user_id uuid, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_amount <= 0 or p_amount > 1000000 then raise exception 'El monto de recarga no es válido.'; end if;
  update public.profiles set wallet_balance = wallet_balance + p_amount where id = p_user_id;
  if not found then raise exception 'Perfil no encontrado.'; end if;
end;
$$;

revoke all on function public.book_court(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.create_match(uuid, uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.join_match(uuid, uuid) from public, anon, authenticated;
revoke all on function public.add_wallet_funds(uuid, numeric) from public, anon, authenticated;
grant execute on function public.book_court(uuid, uuid, text) to service_role;
grant execute on function public.create_match(uuid, uuid, text, text, integer) to service_role;
grant execute on function public.join_match(uuid, uuid) to service_role;
grant execute on function public.add_wallet_funds(uuid, numeric) to service_role;

insert into public.sport_complexes (id, name, sport_type, location, rating, price_per_hour, available_times, image_url)
values
  ('10000000-0000-4000-8000-000000000001', 'Club Pádel Pro', 'Pádel', 'Av. Las Condes 1020, Las Condes', 4.9, 16000, array['17:00','18:00','21:00'], 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?auto=format&fit=crop&w=1200&q=85'),
  ('10000000-0000-4000-8000-000000000002', 'Estadio Fútbol 7', 'Fútbol', 'Av. Vitacura 5400, Vitacura', 4.7, 30000, array['19:00','21:00','22:00'], 'https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=1200&q=85'),
  ('10000000-0000-4000-8000-000000000003', 'Tenis Arena Chicureo', 'Tenis', 'Chicureo Oriente s/n, Colina', 4.6, 12000, array['09:00','10:00','15:00','18:00'], 'https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?auto=format&fit=crop&w=1200&q=85'),
  ('10000000-0000-4000-8000-000000000004', 'Palacio del Pádel', 'Pádel', 'Av. Bilbao 2300, Providencia', 4.8, 18000, array['13:00','16:00','19:00','20:00'], 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?auto=format&fit=crop&w=1200&q=85')
on conflict (id) do nothing;

insert into public.match_sessions (
  id, complex_id, complex_name, sport_type, location, schedule, host_name,
  description, slots_total, slots_taken, price_per_player, players
)
values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Club Pádel Pro', 'Pádel', 'Las Condes', 'Hoy · 19:00', 'Benjamín Vicuña', 'Pádel americano nivel 4ta, intermedio. ¡Partido súper parejo y competitivo!', 4, 3, 4000, array['Benjamín','Felipe','Matías']),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'Estadio Fútbol 7', 'Fútbol', 'Vitacura', 'Mañana · 20:00', 'Lucas Sanhueza', 'Buscamos arquero y defensa para fútbol 7. Amistoso y de buen nivel.', 14, 12, 2150, array['Lucas','Pedro','Marcelo','Gabriel','Tomás','Ignacio','Franco','Javier','Sebastián','Andrés','Gonzalo','Juan']),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'Tenis Arena Chicureo', 'Tenis', 'Colina', 'Hoy · 18:00', 'Andrés Gómez', 'Sale partido de dobles de nivel recreativo. Nos falta una persona.', 4, 3, 3000, array['Andrés','Diego','Ricardo'])
on conflict (id) do nothing;
