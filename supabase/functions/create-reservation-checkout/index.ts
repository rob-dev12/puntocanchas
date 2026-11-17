import { sendParticipantPaymentRequests, type ParticipantPaymentLink } from "../_shared/brevo.ts";
import { createMercadoPagoPreference } from "../_shared/mercado-pago.ts";
import { createServiceClient, errorMessage, jsonResponse, methodError, optionsResponse, readJsonObject, requireEnv } from "../_shared/http.ts";
import { sanitizePlayers } from "../_shared/security.ts";

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidTime(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return false;
  const [hours, minutes] = value.split(":").map(Number);
  return hours < 24 && minutes < 60;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return methodError();

  try {
    const body = await readJsonObject(request);
    if (!isUuid(body.complex_id) || !isUuid(body.court_id) || !isValidDate(body.reservation_date) || !isValidTime(body.start_time)) {
      return jsonResponse({ error: "Selecciona un recinto, una cancha, una fecha y un horario válidos." }, 400);
    }

    const players = sanitizePlayers(body.players);
    const amountRequiredSecrets = [
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "MP_ACCESS_TOKEN",
      "MP_WEBHOOK_SECRET",
      "APP_URL",
      "RESERVATION_CODE_PEPPER",
    ];
    for (const secret of amountRequiredSecrets) requireEnv(secret);

    const supabase = createServiceClient();
    const [{ data: court, error: courtError }, { data: complex, error: complexError }] = await Promise.all([
      supabase.from("courts").select("name, sport, complex_id").eq("id", body.court_id).eq("complex_id", body.complex_id).eq("is_active", true).single(),
      supabase.from("sport_complexes").select("name").eq("id", body.complex_id).single(),
    ]);
    if (courtError) {
      if (courtError.code === "PGRST116") return jsonResponse({ error: "La cancha seleccionada ya no está disponible." }, 404);
      throw courtError;
    }
    if (complexError) {
      if (complexError.code === "PGRST116") return jsonResponse({ error: "No se encontró el recinto seleccionado." }, 404);
      throw complexError;
    }

    const { data: hold, error: holdError } = await supabase.rpc("create_reservation_hold", {
      p_complex_id: body.complex_id,
      p_court_id: body.court_id,
      p_reservation_date: body.reservation_date,
      p_start_time: body.start_time,
      p_players: players,
    });
    if (holdError) {
      const message = errorMessage(holdError);
      const status = /ya no está disponible|bloque ya no está disponible/i.test(message) ? 409 : 400;
      return jsonResponse({ error: message }, status);
    }
    if (typeof hold !== "object" || hold === null || Array.isArray(hold)) {
      throw new Error("No se pudo crear la retención de la reserva.");
    }

    const reservation = hold as Record<string, unknown>;
    if (typeof reservation.reservation_id !== "string" || typeof reservation.total_amount !== "number" || typeof reservation.expires_at !== "string") {
      throw new Error("La reserva creada devolvió información incompleta.");
    }

    let paymentLinks: ParticipantPaymentLink[] = [];
    try {
      if (!Array.isArray(reservation.player_payments) || reservation.player_payments.length !== players.length) {
        throw new Error("La reserva no devolvió los pagos individuales de cada participante.");
      }
      for (const rawPayment of reservation.player_payments) {
        if (typeof rawPayment !== "object" || rawPayment === null || Array.isArray(rawPayment)) {
          throw new Error("Un pago individual no tiene un formato válido.");
        }
        const playerPayment = rawPayment as Record<string, unknown>;
        if (
          typeof playerPayment.player_id !== "string"
          || typeof playerPayment.payment_id !== "string"
          || typeof playerPayment.full_name !== "string"
          || typeof playerPayment.email !== "string"
          || typeof playerPayment.amount !== "number"
        ) {
          throw new Error("Un pago individual devolvió información incompleta.");
        }
        const preference = await createMercadoPagoPreference({
          reservationId: reservation.reservation_id,
          paymentType: "initial",
          amount: playerPayment.amount,
          title: `Aporte individual · ${court.name}, ${complex.name}`,
          expiresAt: reservation.expires_at,
        });
        const { error: attachError } = await supabase.rpc("attach_payment_preference", {
          p_payment_id: playerPayment.payment_id,
          p_preference_id: preference.id,
        });
        if (attachError) throw attachError;
        paymentLinks.push({
          player_id: playerPayment.player_id,
          payment_id: playerPayment.payment_id,
          full_name: playerPayment.full_name,
          email: playerPayment.email,
          amount: playerPayment.amount,
          checkout_url: preference.initPoint,
        });
      }
      if (paymentLinks.reduce((sum, payment) => sum + payment.amount, 0) !== reservation.total_amount) {
        throw new Error("La suma de los aportes individuales no coincide con el total de la reserva.");
      }
    } catch (error) {
      const { error: cancelError } = await supabase.rpc("cancel_checkout", {
        p_reservation_id: reservation.reservation_id,
        p_payment_id: null,
      });
      if (cancelError) throw new Error(`No se pudo cancelar la retención: ${errorMessage(cancelError)}`);
      throw error;
    }

    let emailPending = false;
    try {
      const delivery = await sendParticipantPaymentRequests(
        supabase,
        reservation.reservation_id,
        reservation.expires_at,
        paymentLinks,
      );
      emailPending = delivery.failed > 0;
    } catch (error) {
      console.error("Could not send all participant payment links:", errorMessage(error));
      emailPending = true;
    }

    return jsonResponse({
      reservation_id: reservation.reservation_id,
      expires_at: reservation.expires_at,
      amount: reservation.total_amount,
      checkout_url: paymentLinks[0].checkout_url,
      payment_links: paymentLinks.map(({ player_id, full_name, email, amount, checkout_url }) => ({
        player_id,
        full_name,
        email,
        amount,
        checkout_url,
      })),
      email_pending: emailPending,
    });
  } catch (error) {
    console.error("create-reservation-checkout failed:", errorMessage(error));
    return jsonResponse({ error: errorMessage(error) }, 500);
  }
});
