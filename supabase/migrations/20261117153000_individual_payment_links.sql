alter table public.payments
  add column if not exists player_id uuid references public.reservation_players(id) on delete set null;

create unique index if not exists payments_one_player_per_type_idx
  on public.payments (reservation_id, payment_type, player_id)
  where player_id is not null;

alter table public.email_notifications
  drop constraint if exists email_notifications_notification_type_check;
alter table public.email_notifications
  add constraint email_notifications_notification_type_check
  check (notification_type in (
    'booking_confirmed',
    'player_replaced',
    'players_added',
    'cancellation_received',
    'participant_payment_request'
  ));

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
  v_player_index integer := 0;
  v_end_time time;
  v_total_amount integer;
  v_player_amount integer;
  v_reservation_id uuid;
  v_player_id uuid;
  v_payment_id uuid;
  v_expires_at timestamptz;
  v_player_payments jsonb := '[]'::jsonb;
  v_player record;
begin
  perform public.expire_pending_reservations();

  if jsonb_typeof(p_players) <> 'array' then
    raise exception 'La lista de participantes no es válida.';
  end if;
  v_player_count := jsonb_array_length(p_players);
  if v_player_count < 1 or v_player_count > 14 then
    raise exception 'La cantidad de participantes no es válida.';
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

  v_total_amount := case
    when coalesce(v_court.price_per_player, 0) > 0
      then v_court.price_per_player * v_player_count
    else v_court.price_per_slot
  end;
  if v_total_amount <= 0 then
    raise exception 'El precio configurado para la cancha no permite iniciar un pago.';
  end if;
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

  for v_player in
    select player.full_name, player.email, player.rut
    from jsonb_to_recordset(p_players) as player(full_name text, email text, rut text)
  loop
    v_player_index := v_player_index + 1;
    insert into public.reservation_players (reservation_id, full_name, email, rut, status)
    values (
      v_reservation_id,
      trim(v_player.full_name),
      lower(trim(v_player.email)),
      upper(replace(replace(trim(v_player.rut), '.', ''), '-', '')),
      'pending_payment'
    )
    returning id into v_player_id;

    if coalesce(v_court.price_per_player, 0) > 0 then
      v_player_amount := v_court.price_per_player;
    else
      v_player_amount := (v_total_amount / v_player_count)
        + case when v_player_index <= mod(v_total_amount, v_player_count) then 1 else 0 end;
    end if;
    if v_player_amount <= 0 then
      raise exception 'El precio total es demasiado bajo para dividirlo entre los participantes.';
    end if;

    insert into public.payments (
      reservation_id, player_id, payment_type, amount, currency, status, expires_at
    )
    values (
      v_reservation_id, v_player_id, 'initial', v_player_amount, 'CLP', 'pending', v_expires_at
    )
    returning id into v_payment_id;

    update public.reservation_players
    set payment_id = v_payment_id
    where id = v_player_id;

    v_player_payments := v_player_payments || jsonb_build_array(jsonb_build_object(
      'player_id', v_player_id,
      'payment_id', v_payment_id,
      'full_name', trim(v_player.full_name),
      'email', lower(trim(v_player.email)),
      'amount', v_player_amount
    ));
  end loop;

  return jsonb_build_object(
    'reservation_id', v_reservation_id,
    'total_amount', v_total_amount,
    'expires_at', v_expires_at,
    'end_time', v_end_time,
    'player_payments', v_player_payments
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
  v_player_count integer;
  v_active_count integer;
  v_pending_count integer;
  v_player_id uuid;
  v_payment_id uuid;
  v_expires_at timestamptz;
  v_player_payments jsonb := '[]'::jsonb;
  v_player record;
begin
  if jsonb_typeof(p_players) <> 'array' then
    raise exception 'La lista de participantes no es válida.';
  end if;
  v_player_count := jsonb_array_length(p_players);
  if v_player_count < 1 or v_player_count > 14 then
    raise exception 'La cantidad de participantes no es válida.';
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
  if v_active_count + v_pending_count + v_player_count > v_court.max_players then
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

  if coalesce(v_court.price_per_player, 0) = 0 then
    for v_player in
      select player.full_name, player.email, player.rut
      from jsonb_to_recordset(p_players) as player(full_name text, email text, rut text)
    loop
      insert into public.reservation_players (reservation_id, full_name, email, rut, status)
      values (
        p_reservation_id,
        trim(v_player.full_name),
        lower(trim(v_player.email)),
        upper(replace(replace(trim(v_player.rut), '.', ''), '-', '')),
        'active'
      )
      returning id into v_player_id;
      v_player_payments := v_player_payments || jsonb_build_array(jsonb_build_object(
        'player_id', v_player_id,
        'full_name', trim(v_player.full_name),
        'email', lower(trim(v_player.email)),
        'amount', 0
      ));
    end loop;

    update public.reservations
    set player_count = v_active_count + v_player_count,
        updated_at = now()
    where id = p_reservation_id;
    insert into public.reservation_modifications (
      reservation_id, action_type, previous_data, new_data
    )
    values (
      p_reservation_id, 'players_added',
      jsonb_build_object('player_count', v_active_count),
      jsonb_build_object('player_count', v_active_count + v_player_count, 'additional_players', p_players)
    );
    return jsonb_build_object(
      'requires_payment', false,
      'player_count', v_active_count + v_player_count,
      'amount', 0,
      'player_payments', v_player_payments
    );
  end if;

  v_expires_at := now() + interval '15 minutes';
  for v_player in
    select player.full_name, player.email, player.rut
    from jsonb_to_recordset(p_players) as player(full_name text, email text, rut text)
  loop
    insert into public.reservation_players (reservation_id, full_name, email, rut, status)
    values (
      p_reservation_id,
      trim(v_player.full_name),
      lower(trim(v_player.email)),
      upper(replace(replace(trim(v_player.rut), '.', ''), '-', '')),
      'pending_payment'
    )
    returning id into v_player_id;
    insert into public.payments (
      reservation_id, player_id, payment_type, amount, currency, status, expires_at
    )
    values (
      p_reservation_id, v_player_id, 'additional_players',
      v_court.price_per_player, 'CLP', 'pending', v_expires_at
    )
    returning id into v_payment_id;
    update public.reservation_players
    set payment_id = v_payment_id
    where id = v_player_id;
    v_player_payments := v_player_payments || jsonb_build_array(jsonb_build_object(
      'player_id', v_player_id,
      'payment_id', v_payment_id,
      'full_name', trim(v_player.full_name),
      'email', lower(trim(v_player.email)),
      'amount', v_court.price_per_player
    ));
  end loop;

  return jsonb_build_object(
    'requires_payment', true,
    'expires_at', v_expires_at,
    'amount', v_court.price_per_player * v_player_count,
    'player_payments', v_player_payments
  );
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
  v_player_count integer;
  v_activated integer;
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
  if v_payment.mp_payment_id = p_mp_payment_id
    and v_payment.status in ('approved', 'rejected', 'refunded') then
    select * into v_reservation from public.reservations where id = p_reservation_id;
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
      set status = case when status in ('pending_payment', 'confirmed') then 'cancelled' else status end,
          payment_status = 'refunded',
          updated_at = now()
      where id = p_reservation_id;
      update public.reservation_players
      set status = 'removed', updated_at = now()
      where reservation_id = p_reservation_id and status in ('active', 'pending_payment');
    elsif p_payment_type = 'additional_players' and p_provider_status = 'rejected' then
      update public.reservation_players
      set status = 'removed', updated_at = now()
      where payment_id = v_payment.id and status = 'pending_payment';
    elsif p_payment_type = 'additional_players' and p_provider_status = 'refunded' then
      update public.reservation_players
      set status = 'removed', updated_at = now()
      where payment_id = v_payment.id and status in ('active', 'pending_payment');
      select count(*) into v_player_count
      from public.reservation_players
      where reservation_id = p_reservation_id and status = 'active';
      update public.reservations
      set player_count = v_player_count,
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
    if v_reservation.status <> 'pending_payment'
      or v_reservation.expires_at <= now() then
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

    update public.reservation_players
    set status = 'active', updated_at = now()
    where payment_id = v_payment.id and status = 'pending_payment';
    get diagnostics v_activated = row_count;
    if v_activated = 0 then
      return jsonb_build_object('processed', true, 'confirmed', false, 'reason', 'player_not_pending');
    end if;
    if exists (
      select 1 from public.payments
      where reservation_id = p_reservation_id
        and payment_type = 'initial'
        and status <> 'approved'
    ) then
      return jsonb_build_object('processed', true, 'confirmed', false, 'reason', 'awaiting_other_participants');
    end if;

    select count(*) into v_player_count
    from public.reservation_players
    where reservation_id = p_reservation_id and status = 'active';
    if v_player_count <> v_reservation.player_count
      or nullif(p_code_prefix, '') is null
      or nullif(p_code_hash, '') is null
      or nullif(p_code_ciphertext, '') is null then
      raise exception 'Falta información para confirmar la reserva.';
    end if;

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
    return jsonb_build_object('processed', true, 'confirmed', false, 'reason', 'no_pending_player');
  end if;

  select count(*) into v_player_count
  from public.reservation_players
  where reservation_id = p_reservation_id and status = 'active';
  update public.reservations
  set player_count = v_player_count,
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
    jsonb_build_object('player_count', v_player_count, 'total_amount', v_reservation.total_amount + v_payment.amount)
  );
  return jsonb_build_object('processed', true, 'confirmed', true, 'payment_id', v_payment.id);
end;
$$;
