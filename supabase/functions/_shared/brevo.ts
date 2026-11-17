import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireEnv } from "./http.ts";

type NotificationType = "booking_confirmed" | "player_replaced" | "players_added" | "cancellation_received";
export type ParticipantPaymentLink = {
  player_id: string;
  payment_id: string;
  full_name: string;
  email: string;
  amount: number;
  checkout_url: string;
};

type ReservationDetails = {
  id: string;
  complex_id: string;
  court_id: string;
  reservation_date: string;
  start_time: string;
  end_time: string;
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function dateLabel(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Santiago",
  }).format(date);
}

export async function sendReservationNotifications(
  supabase: SupabaseClient,
  reservationId: string,
  code: string,
  notificationType: NotificationType,
  eventId: string,
  recipientPlayerIds?: string[],
): Promise<{ sent: number; failed: number }> {
  const { data: reservation, error: reservationError } = await supabase
    .from("reservations")
    .select("id, complex_id, court_id, reservation_date, start_time, end_time")
    .eq("id", reservationId)
    .single();
  if (reservationError) throw reservationError;
  const details = reservation as ReservationDetails;

  const [courtResult, complexResult, policyResult, playerResult] = await Promise.all([
    supabase.from("courts").select("name").eq("id", details.court_id).single(),
    supabase.from("sport_complexes").select("name, location").eq("id", details.complex_id).single(),
    supabase.from("venue_policies").select("policy_summary, requires_id_card, required_documents, evaluation_procedure").eq("complex_id", details.complex_id).maybeSingle(),
    supabase.from("reservation_players")
      .select("id, full_name, email")
      .eq("reservation_id", reservationId)
      .eq("status", "active")
      .order("created_at"),
  ]);
  if (courtResult.error) throw courtResult.error;
  if (complexResult.error) throw complexResult.error;
  if (policyResult.error) throw policyResult.error;
  if (playerResult.error) throw playerResult.error;

  const players = playerResult.data.filter((player) =>
    !recipientPlayerIds || recipientPlayerIds.includes(player.id)
  );
  const playerNames = playerResult.data
    .map((player) => `<li>${escapeHtml(player.full_name)}</li>`)
    .join("");
  const policy = policyResult.data;
  const policyContent = policy
    ? `${escapeHtml(policy.policy_summary)}${policy.requires_id_card ? " Se debe presentar identificación." : ""} ${escapeHtml((policy.required_documents ?? []).join(", "))} ${escapeHtml(policy.evaluation_procedure)}`
    : "El recinto aún no ha publicado una política de cancelación.";
  const appUrl = new URL("/?page=manage", requireEnv("APP_URL")).toString();
  const subjectByType: Record<NotificationType, string> = {
    booking_confirmed: "Tu reserva en PuntoReservas está confirmada",
    player_replaced: "Se actualizaron los participantes de tu reserva",
    players_added: "Se agregó tu cupo a una reserva",
    cancellation_received: "Recibimos una solicitud de cancelación",
  };
  const headingByType: Record<NotificationType, string> = {
    booking_confirmed: "Tu reserva está confirmada",
    player_replaced: "Se actualizaron los participantes",
    players_added: "Tu cupo está confirmado",
    cancellation_received: "Recibimos tu solicitud de cancelación",
  };
  const introductionByType: Record<NotificationType, string> = {
    booking_confirmed: "Guarda este código para gestionar tu reserva:",
    player_replaced: "Los participantes de esta reserva fueron actualizados. Guarda el código para realizar futuras gestiones:",
    players_added: "Ya estás incorporado como participante. Guarda el código para gestionar la reserva:",
    cancellation_received: "La solicitud está pendiente de revisión por el recinto. Conserva el código para consultar o gestionar la reserva:",
  };

  let sent = 0;
  let failed = 0;
  for (const player of players) {
    const idempotencyKey = `${reservationId}:${eventId}:${player.id}`;
    const { error: insertError } = await supabase.from("email_notifications").upsert({
      reservation_id: reservationId,
      recipient_email: player.email,
      notification_type: notificationType,
      idempotency_key: idempotencyKey,
      status: "pending",
    }, { onConflict: "idempotency_key", ignoreDuplicates: true });
    if (insertError) throw insertError;

    const { data: notification, error: notificationError } = await supabase
      .from("email_notifications")
      .select("id, status, retry_count")
      .eq("idempotency_key", idempotencyKey)
      .single();
    if (notificationError) throw notificationError;
    if (notification.status === "sent") {
      sent++;
      continue;
    }

    const html = `
      <h1>${headingByType[notificationType]}</h1>
      <p>Hola ${escapeHtml(player.full_name)}, ${introductionByType[notificationType]}</p>
      <p><strong>${escapeHtml(code)}</strong></p>
      <p><strong>Recinto:</strong> ${escapeHtml(complexResult.data.name)} — ${escapeHtml(complexResult.data.location)}</p>
      <p><strong>Cancha:</strong> ${escapeHtml(courtResult.data.name)}</p>
      <p><strong>Fecha:</strong> ${escapeHtml(dateLabel(details.reservation_date))}</p>
      <p><strong>Horario:</strong> ${escapeHtml(details.start_time.slice(0, 5))}–${escapeHtml(details.end_time.slice(0, 5))}</p>
      <p><strong>Participantes:</strong></p><ul>${playerNames}</ul>
      <p><strong>Política de cancelación:</strong> ${policyContent}</p>
      <p>Gestiona tu reserva en <a href="${escapeHtml(appUrl)}">${escapeHtml(appUrl)}</a> usando el código anterior.</p>
    `;

    let deliveryError = "";
    let messageId: string | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { error: retryUpdateError } = await supabase.from("email_notifications").update({
        status: "pending",
        retry_count: notification.retry_count + attempt + 1,
        last_error: null,
      }).eq("id", notification.id);
      if (retryUpdateError) throw retryUpdateError;

      try {
        const response = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "api-key": requireEnv("APIKEY_BREVO"),
            "Content-Type": "application/json",
            "accept": "application/json",
          },
          body: JSON.stringify({
            sender: { email: requireEnv("BREVO_FROM_MAIL"), name: "PuntoReservas" },
            to: [{ email: player.email, name: player.full_name }],
            subject: subjectByType[notificationType],
            htmlContent: html,
          }),
          signal: AbortSignal.timeout(10000),
        });
        const responseBody: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          deliveryError = `Brevo respondió HTTP ${response.status}.`;
        } else {
          const record = typeof responseBody === "object" && responseBody !== null
            ? responseBody as Record<string, unknown>
            : {};
          messageId = typeof record.messageId === "string" ? record.messageId : null;
          deliveryError = "";
          break;
        }
      } catch (error) {
        deliveryError = error instanceof Error ? error.message : "Falló el envío por Brevo.";
      }

      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** attempt)));
    }

    if (deliveryError) {
      const { error } = await supabase.from("email_notifications").update({
        status: "failed",
        last_error: deliveryError.slice(0, 500),
      }).eq("id", notification.id);
      if (error) throw error;
      console.error(`Brevo notification failed for ${idempotencyKey}: ${deliveryError}`);
      failed++;
    } else {
      const { error } = await supabase.from("email_notifications").update({
        status: "sent",
        brevo_message_id: messageId,
        last_error: null,
        sent_at: new Date().toISOString(),
      }).eq("id", notification.id);
      if (error) throw error;
      sent++;
    }
  }

  return { sent, failed };
}

export async function sendParticipantPaymentRequests(
  supabase: SupabaseClient,
  reservationId: string,
  expiresAt: string,
  paymentLinks: ParticipantPaymentLink[],
): Promise<{ sent: number; failed: number }> {
  const { data: reservation, error: reservationError } = await supabase
    .from("reservations")
    .select("reservation_date, start_time, end_time, complex_id, court_id")
    .eq("id", reservationId)
    .single();
  if (reservationError) throw reservationError;
  const [courtResult, complexResult] = await Promise.all([
    supabase.from("courts").select("name").eq("id", reservation.court_id).single(),
    supabase.from("sport_complexes").select("name, location").eq("id", reservation.complex_id).single(),
  ]);
  if (courtResult.error) throw courtResult.error;
  if (complexResult.error) throw complexResult.error;

  let sent = 0;
  let failed = 0;
  for (const payment of paymentLinks) {
    const idempotencyKey = `participant-payment:${payment.payment_id}:${payment.player_id}`;
    const { error: insertError } = await supabase.from("email_notifications").upsert({
      reservation_id: reservationId,
      recipient_email: payment.email,
      notification_type: "participant_payment_request",
      idempotency_key: idempotencyKey,
      status: "pending",
    }, { onConflict: "idempotency_key", ignoreDuplicates: true });
    if (insertError) throw insertError;

    const { data: notification, error: notificationError } = await supabase
      .from("email_notifications")
      .select("id, status, retry_count")
      .eq("idempotency_key", idempotencyKey)
      .single();
    if (notificationError) throw notificationError;
    if (notification.status === "sent") {
      sent++;
      continue;
    }

    let deliveryError = "";
    let messageId: string | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { error: retryUpdateError } = await supabase.from("email_notifications").update({
        status: "pending",
        retry_count: notification.retry_count + attempt + 1,
        last_error: null,
      }).eq("id", notification.id);
      if (retryUpdateError) throw retryUpdateError;

      try {
        const response = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "api-key": requireEnv("APIKEY_BREVO"),
            "Content-Type": "application/json",
            "accept": "application/json",
          },
          body: JSON.stringify({
            sender: { email: requireEnv("BREVO_FROM_MAIL"), name: "PuntoReservas" },
            to: [{ email: payment.email, name: payment.full_name }],
            subject: "Completa tu aporte para la reserva en PuntoReservas",
            htmlContent: `
              <h1>Tu aporte individual está pendiente</h1>
              <p>Hola ${escapeHtml(payment.full_name)}, reserva tu cupo completando el pago antes de que venza la retención.</p>
              <p><strong>Tu aporte:</strong> ${escapeHtml(moneyLabel(payment.amount))}</p>
              <p><strong>Recinto:</strong> ${escapeHtml(complexResult.data.name)} — ${escapeHtml(complexResult.data.location)}</p>
              <p><strong>Cancha:</strong> ${escapeHtml(courtResult.data.name)}</p>
              <p><strong>Fecha:</strong> ${escapeHtml(dateLabel(reservation.reservation_date))}</p>
              <p><strong>Horario:</strong> ${escapeHtml(reservation.start_time.slice(0, 5))}–${escapeHtml(reservation.end_time.slice(0, 5))}</p>
              <p><a href="${escapeHtml(payment.checkout_url)}">Pagar aporte individual</a></p>
              <p>Este enlace vence el ${escapeHtml(new Date(expiresAt).toLocaleString("es-CL", { timeZone: "America/Santiago" }))}.</p>
            `,
          }),
          signal: AbortSignal.timeout(10000),
        });
        const responseBody: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          deliveryError = `Brevo respondió HTTP ${response.status}.`;
        } else {
          const record = typeof responseBody === "object" && responseBody !== null
            ? responseBody as Record<string, unknown>
            : {};
          messageId = typeof record.messageId === "string" ? record.messageId : null;
          deliveryError = "";
          break;
        }
      } catch (error) {
        deliveryError = error instanceof Error ? error.message : "Falló el envío por Brevo.";
      }

      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** attempt)));
    }

    if (deliveryError) {
      const { error } = await supabase.from("email_notifications").update({
        status: "failed",
        last_error: deliveryError.slice(0, 500),
      }).eq("id", notification.id);
      if (error) throw error;
      console.error(`Brevo payment request failed for ${idempotencyKey}: ${deliveryError}`);
      failed++;
    } else {
      const { error } = await supabase.from("email_notifications").update({
        status: "sent",
        brevo_message_id: messageId,
        last_error: null,
        sent_at: new Date().toISOString(),
      }).eq("id", notification.id);
      if (error) throw error;
      sent++;
    }
  }
  return { sent, failed };
}

function moneyLabel(amount: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(amount);
}
