import { sendParticipantPaymentRequests, sendReservationNotifications, type ParticipantPaymentLink } from "../_shared/brevo.ts";
import { createMercadoPagoPreference } from "../_shared/mercado-pago.ts";
import { createServiceClient, errorMessage, getClientIp, jsonResponse, methodError, optionsResponse, readJsonObject, requireEnv } from "../_shared/http.ts";
import {
  decryptReservationCode,
  finishLookupAttempts,
  hashReservationCode,
  lookupRateLimitKeys,
  normalizeReservationCode,
  sanitizePlayers,
  startLookupAttempts,
} from "../_shared/security.ts";

type ReservationRecord = {
  id: string;
  complex_id: string;
  court_id: string;
  reservation_date: string;
  start_time: string;
  end_time: string;
  status: string;
  payment_status: string;
  player_count: number;
  total_amount: number;
  code_ciphertext: string;
};

async function reservationDetails(supabase: ReturnType<typeof createServiceClient>, reservation: ReservationRecord) {
  const [courtResult, complexResult, policyResult, playerResult, cancellationResult, modificationResult] = await Promise.all([
    supabase.from("courts").select("id, name, sport, min_players, max_players, price_per_slot, price_per_player").eq("id", reservation.court_id).single(),
    supabase.from("sport_complexes").select("id, name, location, image_url").eq("id", reservation.complex_id).single(),
    supabase.from("venue_policies").select("min_hours_before_cancellation, refund_percentage, requires_id_card, required_documents, policy_summary, evaluation_procedure").eq("complex_id", reservation.complex_id).maybeSingle(),
    supabase.from("reservation_players").select("id, full_name, email, status").eq("reservation_id", reservation.id).in("status", ["active", "pending_payment"]).order("created_at"),
    supabase.from("cancellation_requests").select("id, reason, status, resolution_notes, approved_refund_amount, requested_at, resolved_at").eq("reservation_id", reservation.id).order("requested_at", { ascending: false }),
    supabase.from("reservation_modifications").select("id, action_type, created_at").eq("reservation_id", reservation.id).order("created_at", { ascending: false }).limit(25),
  ]);
  for (const result of [courtResult, complexResult, policyResult, playerResult, cancellationResult, modificationResult]) {
    if (result.error) throw result.error;
  }
  return {
    reservation: {
      id: reservation.id,
      reservation_date: reservation.reservation_date,
      start_time: reservation.start_time,
      end_time: reservation.end_time,
      status: reservation.status,
      payment_status: reservation.payment_status,
      player_count: reservation.player_count,
      total_amount: reservation.total_amount,
    },
    court: courtResult.data,
    complex: complexResult.data,
    policy: policyResult.data,
    players: playerResult.data,
    cancellation_requests: cancellationResult.data,
    modifications: modificationResult.data,
  };
}

async function cancelAdditionalPayment(
  supabase: ReturnType<typeof createServiceClient>,
  paymentId: string,
): Promise<void> {
  const { error } = await supabase.rpc("cancel_additional_players_payment", { p_payment_id: paymentId });
  if (error) throw error;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return methodError();

  let supabase: ReturnType<typeof createServiceClient> | null = null;
  let lookupAttempts: string[] | null = null;
  try {
    const body = await readJsonObject(request);
    const code = normalizeReservationCode(body.code);
    const action = body.action;
    if (!["lookup", "replace_players", "add_players", "request_cancellation"].includes(String(action))) {
      return jsonResponse({ error: "La acción solicitada no es válida." }, 400);
    }

    supabase = createServiceClient();
    const pepper = requireEnv("RESERVATION_CODE_PEPPER");
    const [codeHash, rateLimitKeys] = await Promise.all([
      hashReservationCode(code, pepper),
      lookupRateLimitKeys(getClientIp(request), code.slice(0, 8), pepper),
    ]);
    lookupAttempts = await startLookupAttempts(supabase, rateLimitKeys);
    if (!lookupAttempts) {
      return jsonResponse({ error: "Se alcanzó el límite de intentos. Espera 15 minutos e inténtalo nuevamente." }, 429);
    }

    const { data: reservation, error: reservationError } = await supabase
      .from("reservations")
      .select("id, complex_id, court_id, reservation_date, start_time, end_time, status, payment_status, player_count, total_amount, code_ciphertext")
      .eq("code_prefix", code.slice(0, 8))
      .eq("code_hash", codeHash)
      .maybeSingle();
    if (reservationError) throw reservationError;
    if (!reservation) {
      await finishLookupAttempts(supabase, lookupAttempts, false);
      lookupAttempts = null;
      return jsonResponse({ error: "No se encontró una reserva con ese código." }, 404);
    }

    await finishLookupAttempts(supabase, lookupAttempts, true);
    lookupAttempts = null;
    const reservationRow = reservation as ReservationRecord;

    if (action === "lookup") {
      return jsonResponse(await reservationDetails(supabase, reservationRow));
    }

    if (action === "replace_players") {
      const players = sanitizePlayers(body.players);
      const { error } = await supabase.rpc("replace_reservation_players", {
        p_reservation_id: reservationRow.id,
        p_new_players: players,
      });
      if (error) return jsonResponse({ error: errorMessage(error) }, 400);

      const { data: activePlayers, error: playersError } = await supabase
        .from("reservation_players")
        .select("id")
        .eq("reservation_id", reservationRow.id)
        .eq("status", "active");
      if (playersError) throw playersError;
      const codeValue = await decryptReservationCode(reservationRow.code_ciphertext, pepper);
      const delivery = await sendReservationNotifications(
        supabase,
        reservationRow.id,
        codeValue,
        "player_replaced",
        crypto.randomUUID(),
        activePlayers.map((player) => player.id),
      );
      return jsonResponse({ updated: true, email_pending: delivery.failed > 0 }, delivery.failed ? 202 : 200);
    }

    if (action === "add_players") {
      const players = sanitizePlayers(body.players);
      const { data: addition, error: additionError } = await supabase.rpc("begin_additional_players_payment", {
        p_reservation_id: reservationRow.id,
        p_players: players,
      });
      if (additionError) return jsonResponse({ error: errorMessage(additionError) }, 400);
      if (typeof addition !== "object" || addition === null || Array.isArray(addition)) {
        throw new Error("La solicitud de cupos adicionales devolvió una respuesta inválida.");
      }

      const additionResult = addition as Record<string, unknown>;
      if (additionResult.requires_payment !== true) {
        const { data: addedPlayers, error: playersError } = await supabase
          .from("reservation_players")
          .select("id")
          .eq("reservation_id", reservationRow.id)
          .eq("status", "active")
          .in("email", players.map((player) => player.email));
        if (playersError) throw playersError;
        const codeValue = await decryptReservationCode(reservationRow.code_ciphertext, pepper);
        const delivery = await sendReservationNotifications(
          supabase,
          reservationRow.id,
          codeValue,
          "players_added",
          crypto.randomUUID(),
          addedPlayers.map((player) => player.id),
        );
        return jsonResponse({
          added: true,
          requires_payment: false,
          email_pending: delivery.failed > 0,
        }, delivery.failed ? 202 : 200);
      }

      if (
        typeof additionResult.amount !== "number"
        || typeof additionResult.expires_at !== "string"
        || !Array.isArray(additionResult.player_payments)
        || additionResult.player_payments.length !== players.length
      ) {
        throw new Error("La solicitud de pago devolvió información incompleta.");
      }

      const paymentLinks: ParticipantPaymentLink[] = [];
      try {
        const [courtResult, complexResult] = await Promise.all([
          supabase.from("courts").select("name").eq("id", reservationRow.court_id).single(),
          supabase.from("sport_complexes").select("name").eq("id", reservationRow.complex_id).single(),
        ]);
        if (courtResult.error) throw courtResult.error;
        if (complexResult.error) throw complexResult.error;

        for (const rawPayment of additionResult.player_payments) {
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
            reservationId: reservationRow.id,
            paymentType: "additional_players",
            amount: playerPayment.amount,
            title: `Aporte individual · ${courtResult.data.name}, ${complexResult.data.name}`,
            expiresAt: additionResult.expires_at,
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
        if (paymentLinks.reduce((sum, payment) => sum + payment.amount, 0) !== additionResult.amount) {
          throw new Error("La suma de los aportes individuales no coincide con el total.");
        }
        let emailPending = false;
        try {
          const delivery = await sendParticipantPaymentRequests(
            supabase,
            reservationRow.id,
            additionResult.expires_at,
            paymentLinks,
          );
          emailPending = delivery.failed > 0;
        } catch (error) {
          console.error("Could not send all additional participant payment links:", errorMessage(error));
          emailPending = true;
        }
        return jsonResponse({
          added: false,
          requires_payment: true,
          amount: additionResult.amount,
          expires_at: additionResult.expires_at,
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
        for (const rawPayment of additionResult.player_payments) {
          if (typeof rawPayment === "object" && rawPayment !== null && "payment_id" in rawPayment && typeof rawPayment.payment_id === "string") {
            await cancelAdditionalPayment(supabase, rawPayment.payment_id);
          }
        }
        throw error;
      }
    }

    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (reason.length < 3 || reason.length > 1000) {
      return jsonResponse({ error: "El motivo debe tener entre 3 y 1.000 caracteres." }, 400);
    }
    const { data: cancellationId, error: cancellationError } = await supabase.rpc("request_reservation_cancellation", {
      p_reservation_id: reservationRow.id,
      p_reason: reason,
    });
    if (cancellationError) {
      if (cancellationError.code === "23505") {
        return jsonResponse({ error: "Ya existe una solicitud de cancelación pendiente." }, 409);
      }
      return jsonResponse({ error: errorMessage(cancellationError) }, 400);
    }

    const codeValue = await decryptReservationCode(reservationRow.code_ciphertext, pepper);
    const { data: activePlayers, error: playersError } = await supabase
      .from("reservation_players")
      .select("id")
      .eq("reservation_id", reservationRow.id)
      .eq("status", "active");
    if (playersError) throw playersError;
    const delivery = await sendReservationNotifications(
      supabase,
      reservationRow.id,
      codeValue,
      "cancellation_received",
      String(cancellationId),
      activePlayers.map((player) => player.id),
    );
    return jsonResponse({
      cancellation_request_id: cancellationId,
      status: "pending_review",
      email_pending: delivery.failed > 0,
    }, delivery.failed ? 202 : 200);
  } catch (error) {
    if (supabase && lookupAttempts) {
      try {
        await finishLookupAttempts(supabase, lookupAttempts, false);
      } catch (finishError) {
        console.error("Could not finalize code lookup attempts:", errorMessage(finishError));
      }
    }
    console.error("manage-reservation failed:", errorMessage(error));
    return jsonResponse({ error: errorMessage(error) }, 500);
  }
});
