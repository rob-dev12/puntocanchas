create or replace function public.cancel_additional_players_payment(
  p_payment_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.payments
  set status = 'rejected'
  where id = p_payment_id
    and payment_type = 'additional_players'
    and status = 'pending';

  update public.reservation_players
  set status = 'removed', updated_at = now()
  where payment_id = p_payment_id
    and status = 'pending_payment';
end;
$$;

revoke all on function public.cancel_additional_players_payment(uuid) from public, anon, authenticated;
grant execute on function public.cancel_additional_players_payment(uuid) to service_role;
