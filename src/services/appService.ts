import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  seedData,
  type Action,
  type AppData,
  type AvailabilitySlot,
  type Booking,
  type Complex,
  type Court,
  type ParticipantPaymentRequest,
  type Profile,
  type ReservationLookup,
  type ReservationPlayerInput,
  type Sport,
} from "../types";

const storageKey = "cancha-reserva-demo-v2";
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const isConfigured = Boolean(supabaseUrl && supabaseAnonKey);

let client: SupabaseClient | null = null;
let currentData: AppData | null = null;
let loadingData: Promise<AppData> | null = null;

function getClient(): SupabaseClient {
  if (!client && isConfigured) {
    client = createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  if (!client) throw new Error("Supabase no está configurado.");
  return client;
}

function readDemoData(): AppData {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return structuredClone(seedData);
  try {
    return JSON.parse(saved) as AppData;
  } catch (error) {
    console.error("No se pudieron leer los datos guardados de la demo.", error);
    return structuredClone(seedData);
  }
}

function saveDemoData(data: AppData): void {
  localStorage.setItem(storageKey, JSON.stringify(data));
}

function asSport(value: string): Sport {
  if (value === "Fútbol" || value === "Pádel" || value === "Tenis") return value;
  throw new Error(`Deporte no reconocido: ${value}`);
}

function mapComplex(row: Record<string, unknown>): Complex {
  return {
    id: String(row.id),
    name: String(row.name),
    sport: asSport(String(row.sport_type)),
    location: String(row.location),
    rating: Number(row.rating),
    pricePerHour: Number(row.price_per_hour),
    availableTimes: row.available_times as string[],
    image: String(row.image_url),
    imagePosition: typeof row.image_position === "string" ? row.image_position : undefined,
  };
}

function mapBooking(row: Record<string, unknown>): Booking {
  return {
    id: String(row.id),
    complexName: String(row.complex_name),
    sport: asSport(String(row.sport_type)),
    schedule: String(row.schedule),
    bookingType: String(row.booking_type),
    pricePaid: Number(row.price_paid),
    createdAt: String(row.created_at),
  };
}

async function loadRemoteData(): Promise<AppData> {
  const supabase = getClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData.session) {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) throw new Error(`No se pudo iniciar sesión anónima. Habilita Anonymous Sign-Ins en Supabase: ${error.message}`);
  }

  const { data: profileData, error: profileError } = await supabase.functions.invoke("sport-actions", {
    body: { action: "bootstrap", name: "Jugador" },
  });
  if (profileError) throw profileError;

  const [complexesResult, bookingsResult] = await Promise.all([
    supabase.from("sport_complexes").select("*").order("rating", { ascending: false }),
    supabase.from("bookings").select("*").order("created_at", { ascending: false }),
  ]);
  if (complexesResult.error) throw complexesResult.error;
  if (bookingsResult.error) throw bookingsResult.error;

  return {
    profile: profileData.profile as Profile,
    complexes: complexesResult.data.map(mapComplex),
    bookings: bookingsResult.data.map(mapBooking),
  };
}

async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await getClient().functions.invoke(name, { body });
  if (error) {
    if ("context" in error && error.context instanceof Response) {
      const payload: unknown = await error.context.clone().json().catch(() => null);
      if (typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string") {
        throw new Error(payload.error);
      }
    }
    throw error;
  }
  if (typeof data !== "object" || data === null) throw new Error(`La función ${name} devolvió una respuesta inválida.`);
  return data as T;
}

export const appService = {
  usesSupabase: isConfigured,

  async load(): Promise<AppData> {
    if (loadingData) return loadingData;
    loadingData = isConfigured ? loadRemoteData() : Promise.resolve(readDemoData());
    try {
      currentData = await loadingData;
      return currentData;
    } finally {
      loadingData = null;
    }
  },

  async perform(action: Action): Promise<AppData> {
    if (isConfigured) {
      const { error } = await getClient().functions.invoke("sport-actions", { body: action });
      if (error) {
        if ("context" in error && error.context instanceof Response) {
          const payload: unknown = await error.context.json();
          if (typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string") {
            throw new Error(payload.error);
          }
        }
        throw error;
      }
      return this.load();
    }

    const data = currentData ?? readDemoData();
    const updated = structuredClone(data);
    const complex = updated.complexes.find((item) => item.id === action.complexId);
    if (!complex || !complex.availableTimes.includes(action.schedule)) throw new Error("Ese horario ya no está disponible.");
    complex.availableTimes = complex.availableTimes.filter((time) => time !== action.schedule);
    updated.bookings.unshift({
      id: crypto.randomUUID(),
      complexName: complex.name,
      sport: complex.sport,
      schedule: `Cancha completa · ${action.schedule}`,
      bookingType: "Cancha completa",
      pricePaid: complex.pricePerHour,
      createdAt: new Date().toISOString(),
    });
    saveDemoData(updated);
    currentData = updated;
    return updated;
  },

  async listCourts(complexIds: string[]): Promise<Court[]> {
    if (!complexIds.length) return [];
    const { data, error } = await getClient()
      .from("courts")
      .select("id, complex_id, name, sport, min_players, max_players, price_per_slot, price_per_player, slot_duration_minutes, open_time, close_time")
      .in("complex_id", complexIds)
      .eq("is_active", true)
      .order("name");
    if (error) throw error;
    return data.map((row) => ({
      id: row.id,
      complexId: row.complex_id,
      name: row.name,
      sport: row.sport,
      minPlayers: row.min_players,
      maxPlayers: row.max_players,
      pricePerSlot: row.price_per_slot,
      pricePerPlayer: row.price_per_player,
      slotDurationMinutes: row.slot_duration_minutes,
      openTime: row.open_time,
      closeTime: row.close_time,
    }));
  },

  async getAvailability(complexId: string, courtId: string, reservationDate: string): Promise<AvailabilitySlot[]> {
    const response = await invokeFunction<{ slots: AvailabilitySlot[] }>("get-availability", {
      complex_id: complexId,
      court_id: courtId,
      reservation_date: reservationDate,
    });
    if (!Array.isArray(response.slots)) throw new Error("La disponibilidad recibida no tiene un formato válido.");
    return response.slots;
  },

  async createReservationCheckout(input: {
    complexId: string;
    courtId: string;
    reservationDate: string;
    startTime: string;
    players: ReservationPlayerInput[];
  }): Promise<ParticipantPaymentRequest & { reservation_id: string }> {
    return invokeFunction("create-reservation-checkout", {
      complex_id: input.complexId,
      court_id: input.courtId,
      reservation_date: input.reservationDate,
      start_time: input.startTime,
      players: input.players,
    });
  },

  async manageReservation(input: {
    code: string;
    action: "lookup" | "replace_players" | "add_players" | "request_cancellation";
    players?: ReservationPlayerInput[];
    reason?: string;
  }): Promise<ReservationLookup | ParticipantPaymentRequest | Record<string, unknown>> {
    return invokeFunction("manage-reservation", input);
  },

  async signInVenueManager(email: string, password: string): Promise<void> {
    const { error } = await getClient().auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
  },

  async signOutVenueManager(): Promise<void> {
    const { error } = await getClient().auth.signOut();
    if (error) throw error;
    const { error: anonymousError } = await getClient().auth.signInAnonymously();
    if (anonymousError) throw anonymousError;
  },

  async getCurrentUser(): Promise<{ id: string; isAnonymous: boolean } | null> {
    const { data, error } = await getClient().auth.getUser();
    if (error) throw error;
    if (!data.user) return null;
    return { id: data.user.id, isAnonymous: data.user.is_anonymous === true };
  },

  async manageVenue(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    return invokeFunction("manage-venue", input);
  },
};
