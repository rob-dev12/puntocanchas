export type Sport = "Fútbol" | "Pádel" | "Tenis";

export type Complex = {
  id: string;
  name: string;
  sport: Sport;
  location: string;
  rating: number;
  pricePerHour: number;
  availableTimes: string[];
  image: string;
  imagePosition?: string;
};

export type Match = {
  id: string;
  complexId: string;
  complexName: string;
  sport: Sport;
  location: string;
  schedule: string;
  hostName: string;
  description: string;
  slotsTotal: number;
  slotsTaken: number;
  pricePerPlayer: number;
  players: string[];
};

export type Booking = {
  id: string;
  complexName: string;
  sport: Sport;
  schedule: string;
  bookingType: string;
  pricePaid: number;
  createdAt: string;
};

export type Profile = {
  id: string;
  name: string;
  email: string;
  walletBalance: number;
};

export type AppData = {
  profile: Profile;
  complexes: Complex[];
  matches: Match[];
  bookings: Booking[];
};

export type Action =
  | { type: "book"; complexId: string; schedule: string }
  | { type: "create"; complexId: string; schedule: string; description: string; slotsTotal: number }
  | { type: "join"; matchId: string }
  | { type: "funds"; amount: number };

export const seedData: AppData = {
  profile: {
    id: "demo-player",
    name: "Carlos Mármol",
    email: "jugador@canchareserva.cl",
    walletBalance: 35000,
  },
  complexes: [
    {
      id: "club-padel-pro",
      name: "Club Pádel Pro",
      sport: "Pádel",
      location: "Av. Las Condes 1020, Las Condes",
      rating: 4.9,
      pricePerHour: 16000,
      availableTimes: ["17:00", "18:00", "21:00"],
      image: "https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?auto=format&fit=crop&w=1200&q=85",
    },
    {
      id: "estadio-futbol-7",
      name: "Estadio Fútbol 7",
      sport: "Fútbol",
      location: "Av. Vitacura 5400, Vitacura",
      rating: 4.7,
      pricePerHour: 30000,
      availableTimes: ["19:00", "21:00", "22:00"],
      image: "https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=1200&q=85",
    },
    {
      id: "tenis-arena",
      name: "Tenis Arena Chicureo",
      sport: "Tenis",
      location: "Chicureo Oriente s/n, Colina",
      rating: 4.6,
      pricePerHour: 12000,
      availableTimes: ["09:00", "10:00", "15:00", "18:00"],
      image: "https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?auto=format&fit=crop&w=1200&q=85",
    },
    {
      id: "palacio-padel",
      name: "Palacio del Pádel",
      sport: "Pádel",
      location: "Av. Bilbao 2300, Providencia",
      rating: 4.8,
      pricePerHour: 18000,
      availableTimes: ["13:00", "16:00", "19:00", "20:00"],
      image: "https://images.unsplash.com/photo-1554068865-24cecd4e34b8?auto=format&fit=crop&w=1200&q=85",
    },
  ],
  matches: [
    {
      id: "match-padel-hoy",
      complexId: "club-padel-pro",
      complexName: "Club Pádel Pro",
      sport: "Pádel",
      location: "Las Condes",
      schedule: "Hoy · 19:00",
      hostName: "Benjamín Vicuña",
      description: "Pádel americano nivel 4ta, intermedio. ¡Partido súper parejo y competitivo!",
      slotsTotal: 4,
      slotsTaken: 3,
      pricePerPlayer: 4000,
      players: ["Benjamín", "Felipe", "Matías"],
    },
    {
      id: "match-futbol-manana",
      complexId: "estadio-futbol-7",
      complexName: "Estadio Fútbol 7",
      sport: "Fútbol",
      location: "Vitacura",
      schedule: "Mañana · 20:00",
      hostName: "Lucas Sanhueza",
      description: "Buscamos arquero y defensa para fútbol 7. Amistoso y de buen nivel.",
      slotsTotal: 14,
      slotsTaken: 12,
      pricePerPlayer: 2150,
      players: ["Lucas", "Pedro", "Marcelo", "Gabriel", "Tomás", "Ignacio", "Franco", "Javier", "Sebastián", "Andrés", "Gonzalo", "Juan"],
    },
    {
      id: "match-tenis-tarde",
      complexId: "tenis-arena",
      complexName: "Tenis Arena Chicureo",
      sport: "Tenis",
      location: "Colina",
      schedule: "Hoy · 18:00",
      hostName: "Andrés Gómez",
      description: "Sale partido de dobles de nivel recreativo. Nos falta una persona.",
      slotsTotal: 4,
      slotsTaken: 3,
      pricePerPlayer: 3000,
      players: ["Andrés", "Diego", "Ricardo"],
    },
  ],
  bookings: [],
};
