import { createServiceClient, errorMessage, jsonResponse, methodError, optionsResponse, readJsonObject } from "../_shared/http.ts";

type Court = {
  id: string;
  complex_id: string;
  open_time: string;
  close_time: string;
  slot_duration_minutes: number;
};

type ReservationWindow = {
  start_time: string;
  end_time: string;
  status: string;
  expires_at: string | null;
};

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? null : value;
}

function minutes(value: string): number {
  const [hours, mins] = value.slice(0, 5).split(":").map(Number);
  return hours * 60 + mins;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return methodError();

  try {
    const body = await readJsonObject(request);
    const complexId = body.complex_id;
    const courtId = body.court_id;
    const reservationDate = parseDate(body.reservation_date);
    if (!isUuid(complexId) || !isUuid(courtId) || !reservationDate) {
      return jsonResponse({ error: "Recinto, cancha y fecha son obligatorios." }, 400);
    }

    const supabase = createServiceClient();
    const { error: expireError } = await supabase.rpc("expire_pending_reservations");
    if (expireError) throw expireError;

    const { data: court, error: courtError } = await supabase
      .from("courts")
      .select("id, complex_id, open_time, close_time, slot_duration_minutes")
      .eq("id", courtId)
      .eq("complex_id", complexId)
      .eq("is_active", true)
      .single();
    if (courtError) {
      if (courtError.code === "PGRST116") return jsonResponse({ error: "No se encontró la cancha activa." }, 404);
      throw courtError;
    }

    const { data: reservations, error: reservationError } = await supabase
      .from("reservations")
      .select("start_time, end_time, status, expires_at")
      .eq("court_id", courtId)
      .eq("reservation_date", reservationDate)
      .in("status", ["pending_payment", "confirmed"]);
    if (reservationError) throw reservationError;

    const courtData = court as Court;
    const reservationRows = reservations as ReservationWindow[];
    const slotDuration = courtData.slot_duration_minutes;
    const opens = minutes(courtData.open_time);
    const closes = minutes(courtData.close_time);
    const now = new Date();
    const todayChile = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Santiago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    const timeParts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Santiago",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const currentTimeChile = Number(timeParts.find((part) => part.type === "hour")?.value ?? 0) * 60
      + Number(timeParts.find((part) => part.type === "minute")?.value ?? 0);
    if (reservationDate < todayChile || slotDuration < 1 || closes <= opens) {
      return jsonResponse({ reservation_date: reservationDate, slots: [] });
    }

    const slots = [];
    for (let start = opens; start + slotDuration <= closes; start += slotDuration) {
      const end = start + slotDuration;
      const startsInPast = reservationDate === todayChile && start <= currentTimeChile;
      const occupied = startsInPast || reservationRows.some((reservation) => {
        if (reservation.status === "pending_payment" && reservation.expires_at && new Date(reservation.expires_at) <= now) {
          return false;
        }
        return start < minutes(reservation.end_time) && end > minutes(reservation.start_time);
      });
      slots.push({
        start_time: `${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`,
        end_time: `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`,
        status: occupied ? "unavailable" : "available",
      });
    }
    return jsonResponse({ reservation_date: reservationDate, slot_duration_minutes: slotDuration, slots });
  } catch (error) {
    console.error("get-availability failed:", errorMessage(error));
    return jsonResponse({ error: errorMessage(error) }, 500);
  }
});
