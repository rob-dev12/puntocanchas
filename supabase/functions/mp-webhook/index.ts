import { sendReservationNotifications } from "../_shared/brevo.ts";
import { createServiceClient, errorMessage, jsonResponse, methodError, optionsResponse, readJsonObject, requireEnv } from "../_shared/http.ts";
import { fetchMercadoPagoPayment, verifyMercadoPagoSignature } from "../_shared/mercado-pago.ts";
import {
  decryptReservationCode,
  encryptReservationCode,
  generateReservationCode,
  hashReservationCode,
} from "../_shared/security.ts";

type PaymentRecord = {
  id: string;
  amount: number;
  mp_preference_id: string | null;
};

type ReservationRecord = {
  status: string;
  expires_at: string | null;
  code_ciphertext: string | null;
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return methodError();

  try {
    const body = await readJsonObject(request);
    const eventType = typeof body.type === "string" ? body.type : "";
    if (eventType && eventType !== "payment" && eventType !== "payment.updated") {
      return jsonResponse({ received: true, ignored: true });
    }

    const data = typeof body.data === "object" && body.data !== null
      ? body.data as Record<string, unknown>
      : {};
    const bodyPaymentId = data.id === undefined ? "" : String(data.id);
    const urlPaymentId = new URL(request.url).searchParams.get("data.id")
      ?? new URL(request.url).searchParams.get("id")
      ?? "";
    if (bodyPaymentId && urlPaymentId && bodyPaymentId !== urlPaymentId) {
      return jsonResponse({ error: "El identificador del evento no coincide." }, 400);
    }
    const paymentId = bodyPaymentId || urlPaymentId;
    if (!/^\d{1,20}$/.test(paymentId)) return jsonResponse({ error: "El evento no contiene un pago válido." }, 400);

    const signatureIsValid = await verifyMercadoPagoSignature(request, paymentId);
    if (!signatureIsValid) return jsonResponse({ error: "La firma del evento no es válida." }, 401);

    const providerPayment = await fetchMercadoPagoPayment(paymentId);
    const externalReference = providerPayment.external_reference;
    const referenceParts = typeof externalReference === "string" ? externalReference.split(":") : [];
    const reservationId = referenceParts[0] ?? "";
    const paymentType = referenceParts[1] ?? "";
    if (!isUuid(reservationId) || !["initial", "additional_players"].includes(paymentType)) {
      console.error("Mercado Pago event has an invalid external reference.");
      return jsonResponse({ received: true, ignored: true });
    }
    if (providerPayment.preference_id === null) {
      throw new Error("Mercado Pago no devolvió la preferencia del pago.");
    }

    const supabase = createServiceClient();
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select("id, amount, mp_preference_id")
      .eq("reservation_id", reservationId)
      .eq("payment_type", paymentType)
      .eq("mp_preference_id", providerPayment.preference_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (paymentError) throw paymentError;
    if (!payment) {
      console.error("Mercado Pago preference is not attached to a local payment.");
      return jsonResponse({ received: true, ignored: true });
    }

    const paymentRow = payment as PaymentRecord;
    if (
      providerPayment.transaction_amount !== paymentRow.amount
      || providerPayment.currency_id !== "CLP"
    ) {
      console.error(`Mercado Pago amount or currency mismatch for payment ${paymentRow.id}.`);
      return jsonResponse({ received: true, ignored: true });
    }

    const statusMap: Record<string, "approved" | "rejected" | "refunded"> = {
      approved: "approved",
      rejected: "rejected",
      cancelled: "rejected",
      refunded: "refunded",
      charged_back: "refunded",
    };
    const providerStatus = statusMap[providerPayment.status];
    if (!providerStatus) return jsonResponse({ received: true, pending: true });

    const rawEvent = {
      id: paymentId,
      type: eventType,
      action: typeof body.action === "string" ? body.action : null,
      payment_status: providerPayment.status,
    };
    let code = "";
    let codePrefix: string | null = null;
    let codeHash: string | null = null;
    let codeCiphertext: string | null = null;
    const pepper = requireEnv("RESERVATION_CODE_PEPPER");

    if (paymentType === "initial" && providerStatus === "approved") {
      const { data: reservation, error: reservationError } = await supabase
        .from("reservations")
        .select("status, expires_at, code_ciphertext")
        .eq("id", reservationId)
        .single();
      if (reservationError) throw reservationError;
      const reservationRow = reservation as ReservationRecord;
      if (reservationRow.status === "confirmed" && reservationRow.code_ciphertext) {
        code = await decryptReservationCode(reservationRow.code_ciphertext, pepper);
      } else if (
        reservationRow.status === "pending_payment"
        && reservationRow.expires_at
        && new Date(reservationRow.expires_at).getTime() > Date.now()
      ) {
        code = generateReservationCode();
        codePrefix = code.slice(0, 8);
        codeHash = await hashReservationCode(code, pepper);
        codeCiphertext = await encryptReservationCode(code, pepper);
      }
    }

    const { data: result, error: processError } = await supabase.rpc("process_reservation_payment", {
      p_reservation_id: reservationId,
      p_payment_type: paymentType,
      p_preference_id: paymentRow.mp_preference_id,
      p_mp_payment_id: String(providerPayment.id),
      p_provider_status: providerStatus,
      p_raw_webhook: rawEvent,
      p_code_prefix: codePrefix,
      p_code_hash: codeHash,
      p_code_ciphertext: codeCiphertext,
    });
    if (processError) throw processError;
    if (typeof result !== "object" || result === null || Array.isArray(result)) {
      throw new Error("La actualización del pago devolvió una respuesta inválida.");
    }

    const resultRecord = result as Record<string, unknown>;
    if (resultRecord.processed !== true) return jsonResponse({ received: true, processed: false });
    if (providerStatus !== "approved" || resultRecord.confirmed !== true) {
      return jsonResponse({ received: true, confirmed: resultRecord.confirmed === true });
    }

    if (paymentType === "initial") {
      if (!code) {
        const { data: reservation, error: reservationError } = await supabase
          .from("reservations")
          .select("code_ciphertext")
          .eq("id", reservationId)
          .single();
        if (reservationError) throw reservationError;
        if (!reservation.code_ciphertext) throw new Error("La reserva confirmada no tiene un código recuperable.");
        code = await decryptReservationCode(reservation.code_ciphertext, pepper);
      }
      const delivery = await sendReservationNotifications(
        supabase,
        reservationId,
        code,
        "booking_confirmed",
        `reservation:${reservationId}:booking-confirmed`,
      );
      if (delivery.failed > 0) return jsonResponse({ received: true, confirmed: true, email_pending: true }, 503);
    } else {
      const paymentIdFromResult = typeof resultRecord.payment_id === "string" ? resultRecord.payment_id : paymentRow.id;
      const { data: addedPlayers, error: playersError } = await supabase
        .from("reservation_players")
        .select("id")
        .eq("payment_id", paymentIdFromResult)
        .eq("status", "active");
      if (playersError) throw playersError;
      const { data: reservation, error: reservationError } = await supabase
        .from("reservations")
        .select("code_ciphertext")
        .eq("id", reservationId)
        .single();
      if (reservationError) throw reservationError;
      if (!reservation.code_ciphertext) throw new Error("La reserva no tiene un código recuperable.");
      code = await decryptReservationCode(reservation.code_ciphertext, pepper);
      const delivery = await sendReservationNotifications(
        supabase,
        reservationId,
        code,
        "players_added",
        String(providerPayment.id),
        addedPlayers.map((player) => player.id),
      );
      if (delivery.failed > 0) return jsonResponse({ received: true, confirmed: true, email_pending: true }, 503);
    }

    return jsonResponse({ received: true, confirmed: true });
  } catch (error) {
    console.error("mp-webhook failed:", errorMessage(error));
    return jsonResponse({ error: errorMessage(error) }, 500);
  }
});
