-- New reservations use the court-slot total and split it among the selected players.
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

  v_total_amount := v_court.price_per_slot;
  if v_total_amount <= 0 then
    raise exception 'El precio total configurado para la cancha debe ser mayor a cero.';
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

    v_player_amount := (v_total_amount / v_player_count)
      + case when v_player_index <= mod(v_total_amount, v_player_count) then 1 else 0 end;
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
