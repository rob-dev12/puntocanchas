alter table public.payments
  add column if not exists expires_at timestamptz;

create index if not exists cancellation_requests_one_pending_per_reservation
  on public.cancellation_requests (reservation_id)
  where status = 'pending_review';

create or replace function public.start_code_lookup_attempt(
  p_client_key text,
  p_max_attempts integer default 8,
  p_window_seconds integer default 900
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
  v_attempt_id uuid;
begin
  if nullif(p_client_key, '') is null
    or p_max_attempts < 1
    or p_window_seconds < 1 then
    raise exception 'Los parámetros del control de intentos no son válidos.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_client_key, 0));
  delete from public.code_lookup_attempts
  where attempted_at < now() - interval '24 hours';

  select count(*) into v_count
  from public.code_lookup_attempts
  where client_key = p_client_key
    and attempted_at >= now() - make_interval(secs => p_window_seconds);

  if v_count >= p_max_attempts then
    return null;
  end if;

  insert into public.code_lookup_attempts (client_key)
  values (p_client_key)
  returning id into v_attempt_id;
  return v_attempt_id;
end;
$$;

create or replace function public.finish_code_lookup_attempt(
  p_attempt_id uuid,
  p_success boolean
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.code_lookup_attempts
  set success = p_success
  where id = p_attempt_id;
$$;

create or replace function public.expire_pending_reservations()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  with expired_reservations as (
    update public.reservations
    set status = 'expired', updated_at = now()
    where status = 'pending_payment'
      and expires_at is not null
      and expires_at <= now()
    returning id
  ), removed_players as (
    update public.reservation_players player
    set status = 'removed', updated_at = now()
    from expired_reservations expired
    where player.reservation_id = expired.id
      and player.status in ('active', 'pending_payment')
    returning player.id
  ), rejected_payments as (
    update public.payments payment
    set status = 'rejected'
    from expired_reservations expired
    where payment.reservation_id = expired.id
      and payment.status = 'pending'
    returning payment.id
  )
  select count(*) into v_count from expired_reservations;
  return v_count;
end;
$$;

create or replace function public.create_reservation_hold(
  p_complex_id uuid,
  p_court_id uuid,
  p_reservation_date date,
  p_start_time time,
  p_players jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_court public.courts%rowtype;
  v_player_count integer;
  v_end_time time;
  v_total_amount integer;
  v_reservation_id uuid;
  v_expires_at timestamptz;
begin
  perform public.expire_pending_reservations();

  if jsonb_typeof(p_players) <> 'array' then
    raise exception 'La lista de participantes no es válida.';
  end if;

  v_player_count := jsonb_array_length(p_players);
  if v_player_count < 1 then
    raise exception 'Se requiere al menos un participante.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_players) as player(full_name text, email text, rut text)
    where nullif(trim(player.full_name), '') is null
      or nullif(trim(player.email), '') is null
      or nullif(trim(player.rut), '') is null
  ) then
    raise exception 'Los datos de los participantes están incompletos.';
  end if;
  if exists (
    select lower(trim(email))
    from jsonb_to_recordset(p_players) as player(full_name text, email text, rut text)
    group by lower(trim(email))
    having count(*) > 1
  ) or exists (
    select upper(replace(replace(trim(rut), '.', ''), '-', ''))
    from jsonb_to_recordset(p_players) as player(full_name text, email text, rut text)
    group by upper(replace(replace(trim(rut), '.', ''), '-', ''))
    having count(*) > 1
  ) then
    raise exception 'Los participantes deben tener correos y RUT distintos.';
  end if;

  select * into v_court
  from public.courts
  where id = p_court_id
    and complex_id = p_complex_id
    and is_active
  for update;

  if not found then
    raise exception 'La cancha no está disponible.';
  end if;

  if v_player_count < v_court.min_players or v_player_count > v_court.max_players then
    raise exception 'La cantidad de participantes está fuera de la capacidad de la cancha.';
  end if;

  if p_reservation_date < (now() at time zone 'America/Santiago')::date then
    raise exception 'La fecha de reserva debe ser hoy o posterior.';
  end if;
  if p_reservation_date = (now() at time zone 'America/Santiago')::date
    and p_start_time <= (now() at time zone 'America/Santiago')::time then
    raise exception 'El horario de reserva debe estar en el futuro.';
  end if;

  if p_start_time < v_court.open_time
    or p_start_time >= v_court.close_time
    or mod(
      extract(epoch from (p_start_time - v_court.open_time))::integer,
      v_court.slot_duration_minutes * 60
    ) <> 0 then
    raise exception 'El bloque horario no corresponde al horario de la cancha.';
  end if;

  v_end_time := p_start_time + make_interval(mins => v_court.slot_duration_minutes);
  if v_end_time <= p_start_time or v_end_time > v_court.close_time then
    raise exception 'El bloque horario excede el horario de cierre.';
  end if;

  update public.reservations
  set status = 'expired', updated_at = now()
  where court_id = p_court_id
    and reservation_date = p_reservation_date
    and status = 'pending_payment'
    and expires_at <= now();

  v_total_amount := case
    when v_court.price_per_player is not null
      then v_court.price_per_player * v_player_count
    else v_court.price_per_slot
  end;
  v_expires_at := now() + interval '15 minutes';

  begin
    insert into public.reservations (
      complex_id, court_id, reservation_date, start_time, end_time,
      player_count, total_amount, status, payment_status, expires_at
    )
    values (
      p_complex_id, p_court_id, p_reservation_date, p_start_time, v_end_time,
      v_player_count, v_total_amount, 'pending_payment', 'pending', v_expires_at
    )
    returning id into v_reservation_id;
  exception when exclusion_violation or unique_violation then
    raise exception 'Ese bloque ya no está disponible.';
  end;

  insert into public.reservation_players (reservation_id, full_name, email, rut, status)
  select
    v_reservation_id,
    trim(player.full_name),
    lower(trim(player.email)),
    upper(replace(trim(player.rut), '.', '')),
    'active'
  from jsonb_to_recordset(p_players) as player(full_name text, email text, rut text);

  return jsonb_build_object(
    'reservation_id', v_reservation_id,
    'total_amount', v_total_amount,
    'expires_at', v_expires_at,
    'end_time', v_end_time
  );
end;
$$;

create or replace function public.record_initial_payment_preference(
  p_reservation_id uuid,
  p_preference_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reservation public.reservations%rowtype;
  v_payment_id uuid;
begin
  if nullif(trim(p_preference_id), '') is null then
    raise exception 'La preferencia de pago no es válida.';
  end if;

  select * into v_reservation
  from public.reservations
  where id = p_reservation_id
  for update;

  if not found
    or v_reservation.status <> 'pending_payment'
    or v_reservation.expires_at <= now() then
    raise exception 'La reserva ya no está vigente.';
  end if;

  insert into public.payments (
    reservation_id, payment_type, mp_preference_id, amount, currency, status, expires_at
  )
  values (
    v_reservation.id, 'initial', trim(p_preference_id),
    v_reservation.total_amount, 'CLP', 'pending', v_reservation.expires_at
  )
  returning id into v_payment_id;

  return jsonb_build_object(
    'payment_id', v_payment_id,
    'amount', v_reservation.total_amount
  );
end;
$$;

create or replace function public.begin_additional_players_payment(
  p_reservation_id uuid,
  p_players jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reservation public.reservations%rowtype;
  v_court public.courts%rowtype;
  v_add_count integer;
  v_active_count integer;
  v_pending_count integer;
  v_amount integer;
  v_payment_id uuid;
  v_new_player_count integer;
begin
  if jsonb_typeof(p_players) <> 'array' then
    raise exception 'La lista de participantes no es válida.';
  end if;
  v_add_count := jsonb_array_length(p_players);
  if v_add_count < 1 then
    raise exception 'Agrega al menos un participante.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_players) as player(full_name text, email text, rut text)
    where nullif(trim(player.full_name), '') is null
      or nullif(trim(player.email), '') is null
      or nullif(trim(player.rut), '') is null
  ) then
    raise exception 'Los datos de los participantes están incompletos.';
  end if;
  if exists (
    select lower(trim(email))
    from jsonb_to_recordset(p_players) as player(full_name text, email text, rut text)
    group by lower(trim(email))
    having count(*) > 1
  ) or exists (
    select upper(replace(replace(trim(rut), '.', ''), '-', ''))
    from jsonb_to_recordset(p_players) as player(full_name text, email text, rut text)
    group by upper(replace(replace(trim(rut), '.', ''), '-', ''))
    having count(*) > 1
  ) then
    raise exception 'Los participantes deben tener correos y RUT distintos.';
  end if;

  select * into v_reservation
  from public.reservations
  where id = p_reservation_id
  for update;
  if not found or v_reservation.status <> 'confirmed' then
    raise exception 'La reserva no está confirmada.';
  end if;

  select * into v_court
  from public.courts
  where id = v_reservation.court_id and is_active
  for update;
  if not found then
    raise exception 'La cancha no está activa.';
  end if;

  select count(*) filter (where status = 'active'),
         count(*) filter (where status = 'pending_payment')
  into v_active_count, v_pending_count
  from public.reservation_players
  where reservation_id = p_reservation_id;

  if v_active_count + v_pending_count + v_add_count > v_court.max_players then
    raise exception 'La cantidad de participantes supera la capacidad de la cancha.';
  end if;
  if exists (
    select 1
    from public.reservation_players existing
    join jsonb_to_recordset(p_players) as player(full_name text, email text, rut text)
      on lower(trim(existing.email)) = lower(trim(player.email))
      or upper(replace(replace(trim(existing.rut), '.', ''), '-', ''))
        = upper(replace(replace(trim(player.rut), '.', ''), '-', ''))
    where existing.reservation_id = p_reservation_id
      and existing.status in ('active', 'pending_payment')
  ) then
    raise exception 'Un participante con ese correo o RUT ya está en la reserva.';
  end if;

  if exists (
    select 1 from public.payments
    where reservation_id = p_reservation_id
      and payment_type = 'additional_players'
      and status = 'pending'
      and expires_at > now()
  ) then
    raise exception 'Ya existe un pago pendiente de participantes adicionales.';
  end if;

  update public.payments
  set status = 'rejected'
  where reservation_id = p_reservation_id
    and payment_type = 'additional_players'
    and status = 'pending'
    and expires_at <= now();

  update public.reservation_players
  set status = 'removed', updated_at = now()
  where reservation_id = p_reservation_id
    and status = 'pending_payment';

  v_amount := coalesce(v_court.price_per_player, 0) * v_add_count;
  if v_amount = 0 then
    insert into public.reservation_players (reservation_id, full_name, email, rut, status)
    select
      p_reservation_id,
      trim(player.full_name),
      lower(trim(player.email)),
      upper(replace(trim(player.rut), '.', '')),
      'active'
    from jsonb_to_recordset(p_players) as player(full_name text, email text, rut text);

    v_new_player_count := v_active_count + v_add_count;
    update public.reservations
    set player_count = v_new_player_count,
        updated_at = now()
    where id = p_reservation_id;

    insert into public.reservation_modifications (
      reservation_id, action_type, previous_data, new_data
    )
    values (
      p_reservation_id, 'players_added',
      jsonb_build_object('player_count', v_active_count),
      jsonb_build_object('player_count', v_new_player_count, 'additional_players', p_players)
    );

    return jsonb_build_object(
      'requires_payment', false,
      'player_count', v_new_player_count,
      'amount', 0
    );
  end if;

  insert into public.payments (
    reservation_id, payment_type, amount, currency, status, expires_at
  )
  values (
    p_reservation_id, 'additional_players', v_amount, 'CLP', 'pending', now() + interval '15 minutes'
  )
  returning id into v_payment_id;

  insert into public.reservation_players (
    reservation_id, full_name, email, rut, status, payment_id
  )
  select
    p_reservation_id,
    trim(player.full_name),
    lower(trim(player.email)),
    upper(replace(trim(player.rut), '.', '')),
    'pending_payment',
    v_payment_id
  from jsonb_to_recordset(p_players) as player(full_name text, email text, rut text);

  return jsonb_build_object(
    'requires_payment', true,
    'payment_id', v_payment_id,
    'amount', v_amount,
    'expires_at', now() + interval '15 minutes'
  );
end;
$$;

create or replace function public.attach_payment_preference(
  p_payment_id uuid,
  p_preference_id text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.payments
  set mp_preference_id = trim(p_preference_id)
  where id = p_payment_id
    and status = 'pending'
    and expires_at > now()
    and nullif(trim(p_preference_id), '') is not null;

  if not found then
    raise exception 'No se pudo asociar la preferencia de pago.';
  end if;
end;
$$;

create or replace function public.cancel_checkout(
  p_reservation_id uuid,
  p_payment_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.reservations
  set status = 'cancelled', updated_at = now()
  where id = p_reservation_id
    and status = 'pending_payment';

  update public.reservation_players
  set status = 'removed', updated_at = now()
  where reservation_id = p_reservation_id
    and status in ('active', 'pending_payment');

  update public.payments
  set status = 'rejected'
  where (p_payment_id is null or id = p_payment_id)
    and reservation_id = p_reservation_id
    and status = 'pending';
end;
$$;

create or replace function public.process_reservation_payment(
  p_reservation_id uuid,
  p_payment_type text,
  p_preference_id text,
  p_mp_payment_id text,
  p_provider_status text,
  p_raw_webhook jsonb,
  p_code_prefix text default null,
  p_code_hash text default null,
  p_code_ciphertext text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payment public.payments%rowtype;
  v_reservation public.reservations%rowtype;
  v_activated integer;
  v_new_count integer;
begin
  if p_payment_type not in ('initial', 'additional_players')
    or p_provider_status not in ('approved', 'rejected', 'refunded') then
    raise exception 'El resultado del pago no es válido.';
  end if;

  select * into v_payment
  from public.payments
  where reservation_id = p_reservation_id
    and payment_type = p_payment_type
    and mp_preference_id = p_preference_id
  order by created_at desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object('processed', false, 'reason', 'payment_not_found');
  end if;

  if exists (
    select 1 from public.payments
    where mp_payment_id = p_mp_payment_id and id <> v_payment.id
  ) then
    return jsonb_build_object('processed', false, 'reason', 'duplicate_payment');
  end if;

  if v_payment.status = 'approved' and v_payment.mp_payment_id = p_mp_payment_id then
    select * into v_reservation
    from public.reservations
    where id = p_reservation_id;
    return jsonb_build_object(
      'processed', true,
      'duplicate', true,
      'confirmed', v_reservation.status = 'confirmed'
    );
  end if;

  if p_provider_status <> 'approved' then
    update public.payments
    set mp_payment_id = p_mp_payment_id,
        status = p_provider_status,
        raw_webhook = p_raw_webhook
    where id = v_payment.id;

    if p_payment_type = 'initial' and p_provider_status = 'refunded' then
      update public.reservations
      set status = case when status = 'confirmed' then 'cancelled' else status end,
          payment_status = 'refunded',
          updated_at = now()
      where id = p_reservation_id;

      update public.reservation_players
      set status = 'removed', updated_at = now()
      where reservation_id = p_reservation_id
        and status in ('active', 'pending_payment');
    elsif p_payment_type = 'additional_players' and p_provider_status = 'rejected' then
      update public.reservation_players
      set status = 'removed', updated_at = now()
      where payment_id = v_payment.id and status = 'pending_payment';
    elsif p_payment_type = 'additional_players' and p_provider_status = 'refunded' then
      update public.reservation_players
      set status = 'removed', updated_at = now()
      where payment_id = v_payment.id and status in ('active', 'pending_payment');

      select count(*) into v_new_count
      from public.reservation_players
      where reservation_id = p_reservation_id and status = 'active';

      update public.reservations
      set player_count = v_new_count,
          total_amount = greatest(0, total_amount - v_payment.amount),
          payment_status = 'partially_refunded',
          updated_at = now()
      where id = p_reservation_id;
    end if;

    return jsonb_build_object('processed', true, 'confirmed', false);
  end if;

  update public.payments
  set mp_payment_id = p_mp_payment_id,
      status = 'approved',
      raw_webhook = p_raw_webhook,
      paid_at = now()
  where id = v_payment.id;

  select * into v_reservation
  from public.reservations
  where id = p_reservation_id
  for update;

  if p_payment_type = 'initial' then
    if v_reservation.status = 'pending_payment'
      and v_reservation.expires_at > now()
      and nullif(p_code_prefix, '') is not null
      and nullif(p_code_hash, '') is not null
      and nullif(p_code_ciphertext, '') is not null then
      update public.reservations
      set status = 'confirmed',
          payment_status = 'paid',
          code_prefix = p_code_prefix,
          code_hash = p_code_hash,
          code_ciphertext = p_code_ciphertext,
          expires_at = null,
          updated_at = now()
      where id = p_reservation_id;

      return jsonb_build_object('processed', true, 'confirmed', true, 'payment_id', v_payment.id);
    end if;

    update public.reservations
    set status = case
          when status = 'pending_payment' and expires_at <= now() then 'expired'
          else status
        end,
        payment_status = 'paid',
        updated_at = now()
    where id = p_reservation_id;

    return jsonb_build_object('processed', true, 'confirmed', false, 'reason', 'reservation_not_confirmable');
  end if;

  if v_reservation.status <> 'confirmed' then
    update public.reservation_players
    set status = 'removed', updated_at = now()
    where payment_id = v_payment.id and status = 'pending_payment';
    return jsonb_build_object('processed', true, 'confirmed', false, 'reason', 'reservation_not_confirmable');
  end if;

  update public.reservation_players
  set status = 'active', updated_at = now()
  where payment_id = v_payment.id and status = 'pending_payment';
  get diagnostics v_activated = row_count;

  if v_activated = 0 then
    return jsonb_build_object('processed', true, 'confirmed', false, 'reason', 'no_pending_players');
  end if;

  select count(*) into v_new_count
  from public.reservation_players
  where reservation_id = p_reservation_id and status = 'active';

  update public.reservations
  set player_count = v_new_count,
      total_amount = total_amount + v_payment.amount,
      payment_status = 'paid',
      updated_at = now()
  where id = p_reservation_id;

  insert into public.reservation_modifications (
    reservation_id, action_type, previous_data, new_data
  )
  values (
    p_reservation_id,
    'players_added',
    jsonb_build_object('player_count', v_reservation.player_count, 'total_amount', v_reservation.total_amount),
    jsonb_build_object('player_count', v_new_count, 'total_amount', v_reservation.total_amount + v_payment.amount)
  );

  return jsonb_build_object('processed', true, 'confirmed', true, 'payment_id', v_payment.id);
end;
$$;

create or replace function public.replace_reservation_players(
  p_reservation_id uuid,
  p_new_players jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reservation public.reservations%rowtype;
  v_previous jsonb;
  v_count integer;
begin
  if jsonb_typeof(p_new_players) <> 'array' then
    raise exception 'La lista de participantes no es válida.';
  end if;

  select * into v_reservation
  from public.reservations
  where id = p_reservation_id and status = 'confirmed'
  for update;
  if not found then
    raise exception 'La reserva no está confirmada.';
  end if;

  v_count := jsonb_array_length(p_new_players);
  if v_count <> v_reservation.player_count then
    raise exception 'El cambio debe mantener la cantidad de cupos pagados.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_new_players) as player(full_name text, email text, rut text)
    where nullif(trim(player.full_name), '') is null
      or nullif(trim(player.email), '') is null
      or nullif(trim(player.rut), '') is null
  ) then
    raise exception 'Los datos de los participantes están incompletos.';
  end if;
  if exists (
    select lower(trim(email))
    from jsonb_to_recordset(p_new_players) as player(full_name text, email text, rut text)
    group by lower(trim(email))
    having count(*) > 1
  ) or exists (
    select upper(replace(replace(trim(rut), '.', ''), '-', ''))
    from jsonb_to_recordset(p_new_players) as player(full_name text, email text, rut text)
    group by upper(replace(replace(trim(rut), '.', ''), '-', ''))
    having count(*) > 1
  ) then
    raise exception 'Los participantes deben tener correos y RUT distintos.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'full_name', full_name, 'email', email, 'rut', rut
  ) order by created_at), '[]'::jsonb)
  into v_previous
  from public.reservation_players
  where reservation_id = p_reservation_id and status = 'active';

  update public.reservation_players
  set status = 'removed', updated_at = now()
  where reservation_id = p_reservation_id and status = 'active';

  insert into public.reservation_players (reservation_id, full_name, email, rut, status)
  select
    p_reservation_id,
    trim(player.full_name),
    lower(trim(player.email)),
    upper(replace(trim(player.rut), '.', '')),
    'active'
  from jsonb_to_recordset(p_new_players) as player(full_name text, email text, rut text)
  where nullif(trim(player.full_name), '') is not null
    and nullif(trim(player.email), '') is not null
    and nullif(trim(player.rut), '') is not null;

  if not found then
    raise exception 'No se agregaron participantes válidos.';
  end if;

  insert into public.reservation_modifications (
    reservation_id, action_type, previous_data, new_data
  )
  values (
    p_reservation_id, 'players_updated', v_previous, p_new_players
  );
end;
$$;

create or replace function public.request_reservation_cancellation(
  p_reservation_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reservation public.reservations%rowtype;
  v_request_id uuid;
begin
  if nullif(trim(p_reason), '') is null then
    raise exception 'Indica el motivo de la solicitud.';
  end if;

  select * into v_reservation
  from public.reservations
  where id = p_reservation_id and status = 'confirmed'
  for update;
  if not found then
    raise exception 'La reserva no está confirmada.';
  end if;

  insert into public.cancellation_requests (reservation_id, complex_id, reason)
  values (p_reservation_id, v_reservation.complex_id, trim(p_reason))
  returning id into v_request_id;

  insert into public.reservation_modifications (
    reservation_id, action_type, previous_data, new_data
  )
  values (
    p_reservation_id,
    'cancellation_requested',
    jsonb_build_object('status', v_reservation.status),
    jsonb_build_object('cancellation_request_id', v_request_id, 'status', 'pending_review')
  );

  return v_request_id;
end;
$$;

revoke all on function public.expire_pending_reservations() from public, anon, authenticated;
revoke all on function public.start_code_lookup_attempt(text, integer, integer) from public, anon, authenticated;
revoke all on function public.finish_code_lookup_attempt(uuid, boolean) from public, anon, authenticated;
revoke all on function public.create_reservation_hold(uuid, uuid, date, time, jsonb) from public, anon, authenticated;
revoke all on function public.record_initial_payment_preference(uuid, text) from public, anon, authenticated;
revoke all on function public.begin_additional_players_payment(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.attach_payment_preference(uuid, text) from public, anon, authenticated;
revoke all on function public.cancel_checkout(uuid, uuid) from public, anon, authenticated;
revoke all on function public.process_reservation_payment(uuid, text, text, text, text, jsonb, text, text, text) from public, anon, authenticated;
revoke all on function public.replace_reservation_players(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.request_reservation_cancellation(uuid, text) from public, anon, authenticated;

grant execute on function public.expire_pending_reservations() to service_role;
grant execute on function public.start_code_lookup_attempt(text, integer, integer) to service_role;
grant execute on function public.finish_code_lookup_attempt(uuid, boolean) to service_role;
grant execute on function public.create_reservation_hold(uuid, uuid, date, time, jsonb) to service_role;
grant execute on function public.record_initial_payment_preference(uuid, text) to service_role;
grant execute on function public.begin_additional_players_payment(uuid, jsonb) to service_role;
grant execute on function public.attach_payment_preference(uuid, text) to service_role;
grant execute on function public.cancel_checkout(uuid, uuid) to service_role;
grant execute on function public.process_reservation_payment(uuid, text, text, text, text, jsonb, text, text, text) to service_role;
grant execute on function public.replace_reservation_players(uuid, jsonb) to service_role;
grant execute on function public.request_reservation_cancellation(uuid, text) to service_role;
