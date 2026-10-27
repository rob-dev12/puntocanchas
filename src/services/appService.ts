import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { seedData, type Action, type AppData, type Booking, type Complex, type Match, type Profile, type Sport } from "../types";

const storageKey = "cancha-reserva-demo-v1";
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

function mapMatch(row: Record<string, unknown>): Match {
  return {
    id: String(row.id),
    complexId: String(row.complex_id),
    complexName: String(row.complex_name),
    sport: asSport(String(row.sport_type)),
    location: String(row.location),
    schedule: String(row.schedule),
    hostName: String(row.host_name),
    description: String(row.description),
    slotsTotal: Number(row.slots_total),
    slotsTaken: Number(row.slots_taken),
    pricePerPlayer: Number(row.price_per_player),
    players: row.players as string[],
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
    body: { action: "bootstrap", name: "Carlos Mármol" },
  });
  if (profileError) throw profileError;

  const [complexesResult, matchesResult, bookingsResult] = await Promise.all([
    supabase.from("sport_complexes").select("*").order("rating", { ascending: false }),
    supabase.from("match_sessions").select("*").order("created_at", { ascending: false }),
    supabase.from("bookings").select("*").order("created_at", { ascending: false }),
  ]);
  if (complexesResult.error) throw complexesResult.error;
  if (matchesResult.error) throw matchesResult.error;
  if (bookingsResult.error) throw bookingsResult.error;

  return {
    profile: profileData.profile as Profile,
    complexes: complexesResult.data.map(mapComplex),
    matches: matchesResult.data.map(mapMatch),
    bookings: bookingsResult.data.map(mapBooking),
  };
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
    if (action.type === "funds") {
      if (action.amount <= 0 || action.amount > 1000000) throw new Error("El monto de recarga no es válido.");
      updated.profile.walletBalance += action.amount;
    } else if (action.type === "book") {
      const complex = updated.complexes.find((item) => item.id === action.complexId);
      if (!complex || !complex.availableTimes.includes(action.schedule)) throw new Error("Ese horario ya no está disponible.");
      if (updated.profile.walletBalance < complex.pricePerHour) throw new Error("Saldo insuficiente para reservar la cancha.");
      complex.availableTimes = complex.availableTimes.filter((time) => time !== action.schedule);
      updated.profile.walletBalance -= complex.pricePerHour;
      updated.bookings.unshift({
        id: crypto.randomUUID(),
        complexName: complex.name,
        sport: complex.sport,
        schedule: `Cancha completa · ${action.schedule}`,
        bookingType: "Cancha completa",
        pricePaid: complex.pricePerHour,
        createdAt: new Date().toISOString(),
      });
    } else if (action.type === "create") {
      const complex = updated.complexes.find((item) => item.id === action.complexId);
      if (!complex || !complex.availableTimes.includes(action.schedule)) throw new Error("Ese horario ya no está disponible.");
      const minimumSlots = 4;
      const maximumSlots = complex.sport === "Fútbol" ? 14 : 4;
      if (action.slotsTotal < minimumSlots || action.slotsTotal > maximumSlots) throw new Error("La cantidad de jugadores no es válida.");
      const share = Math.round((complex.pricePerHour / action.slotsTotal) * 100) / 100;
      if (updated.profile.walletBalance < share) throw new Error("Saldo insuficiente para pagar tu cuota.");
      complex.availableTimes = complex.availableTimes.filter((time) => time !== action.schedule);
      updated.profile.walletBalance -= share;
      updated.matches.unshift({
        id: crypto.randomUUID(),
        complexId: complex.id,
        complexName: complex.name,
        sport: complex.sport,
        location: complex.location,
        schedule: `Hoy · ${action.schedule}`,
        hostName: updated.profile.name,
        description: action.description.trim() || `Partido exprés de ${complex.sport} en ${complex.name}.`,
        slotsTotal: action.slotsTotal,
        slotsTaken: 1,
        pricePerPlayer: share,
        players: [updated.profile.name],
      });
      updated.bookings.unshift({
        id: crypto.randomUUID(),
        complexName: complex.name,
        sport: complex.sport,
        schedule: `Organizado · ${action.schedule}`,
        bookingType: "Partido exprés · Creador",
        pricePaid: share,
        createdAt: new Date().toISOString(),
      });
    } else {
      const match = updated.matches.find((item) => item.id === action.matchId);
      if (!match || match.slotsTaken >= match.slotsTotal) throw new Error("El partido ya está completo.");
      if (match.players.includes(updated.profile.name)) throw new Error("Ya tienes un cupo en este partido.");
      if (updated.profile.walletBalance < match.pricePerPlayer) throw new Error("Saldo insuficiente para unirte al partido.");
      updated.profile.walletBalance -= match.pricePerPlayer;
      match.slotsTaken += 1;
      match.players.push(updated.profile.name);
      updated.bookings.unshift({
        id: crypto.randomUUID(),
        complexName: match.complexName,
        sport: match.sport,
        schedule: `Partido exprés · ${match.schedule}`,
        bookingType: "Partido exprés · Jugador",
        pricePaid: match.pricePerPlayer,
        createdAt: new Date().toISOString(),
      });
    }
    saveDemoData(updated);
    currentData = updated;
    return updated;
  },
};
