import { demoChileCommunes } from "./chileLocations";
import { supportedSports, type Complex, type Court, type Sport } from "../types";

const demoSportDetails: Record<Sport, Omit<Court, "id" | "complexId">> = {
  "Fútbol": {
    name: "Cancha de prueba · Fútbol 7",
    sport: "Fútbol 7",
    minPlayers: 2,
    maxPlayers: 14,
    pricePerSlot: 30000,
    pricePerPlayer: null,
    slotDurationMinutes: 60,
    openTime: "08:00",
    closeTime: "22:00",
  },
  "Pádel": {
    name: "Cancha de prueba · Pádel",
    sport: "Pádel",
    minPlayers: 2,
    maxPlayers: 4,
    pricePerSlot: 20000,
    pricePerPlayer: null,
    slotDurationMinutes: 60,
    openTime: "08:00",
    closeTime: "22:00",
  },
  "Tenis": {
    name: "Cancha de prueba · Tenis",
    sport: "Tenis",
    minPlayers: 2,
    maxPlayers: 4,
    pricePerSlot: 16000,
    pricePerPlayer: null,
    slotDurationMinutes: 60,
    openTime: "08:00",
    closeTime: "22:00",
  },
};

function demoId(sport: Sport, comunaId: string) {
  return `demo-${sport.toLowerCase().replace("á", "a")}-${comunaId}`;
}

export const demoComplexes: Complex[] = demoChileCommunes.flatMap((comuna) =>
  supportedSports.map((sport) => ({
    id: demoId(sport, comuna.id),
    name: `${sport} Demo ${comuna.name}`,
    sport,
    location: `Centro deportivo de prueba, ${comuna.name}`,
    rating: 0,
    pricePerHour: demoSportDetails[sport].pricePerSlot,
    availableTimes: [],
    image: "",
  })),
);

export const demoCourts: Court[] = demoChileCommunes.flatMap((comuna) =>
  supportedSports.map((sport) => ({
    ...demoSportDetails[sport],
    id: `demo-court-${sport.toLowerCase().replace("á", "a")}-${comuna.id}`,
    complexId: demoId(sport, comuna.id),
  })),
);
