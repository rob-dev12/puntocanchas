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

export type Booking = {
  id: string;
  complexName: string;
  sport: Sport;
  schedule: string;
  bookingType: string;
  pricePaid: number;
  createdAt: string;
};

export type Court = {
  id: string;
  complexId: string;
  name: string;
  sport: string;
  minPlayers: number;
  maxPlayers: number;
  pricePerSlot: number;
  pricePerPlayer: number | null;
  slotDurationMinutes: number;
  openTime: string;
  closeTime: string;
};

export type AvailabilitySlot = {
  start_time: string;
  end_time: string;
  status: "available" | "unavailable";
};

export type ReservationPlayerInput = {
  full_name: string;
  email: string;
  rut: string;
};

export type ParticipantPaymentLink = {
  player_id: string;
  full_name: string;
  email: string;
  amount: number;
  checkout_url: string;
};

export type ParticipantPaymentRequest = {
  reservation_id?: string;
  expires_at: string;
  amount: number;
  checkout_url: string;
  payment_links: ParticipantPaymentLink[];
  email_pending: boolean;
};

export type ReservationLookup = {
  reservation: {
    id: string;
    reservation_date: string;
    start_time: string;
    end_time: string;
    status: string;
    payment_status: string;
    player_count: number;
    total_amount: number;
  };
  court: {
    id: string;
    name: string;
    sport: string;
    min_players: number;
    max_players: number;
    price_per_slot: number;
    price_per_player: number | null;
  };
  complex: {
    id: string;
    name: string;
    location: string;
    image_url: string | null;
  };
  policy: {
    min_hours_before_cancellation: number;
    refund_percentage: number;
    requires_id_card: boolean;
    required_documents: string[];
    policy_summary: string;
    evaluation_procedure: string;
  } | null;
  players: Array<{ id: string; full_name: string; email: string; status: string }>;
  cancellation_requests: Array<{
    id: string;
    reason: string;
    status: string;
    resolution_notes: string | null;
    approved_refund_amount: number | null;
    requested_at: string;
    resolved_at: string | null;
  }>;
  modifications: Array<{ id: string; action_type: string; created_at: string }>;
};

export type Profile = {
  id: string;
  name: string;
  email: string;
};

export type AppData = {
  profile: Profile;
  complexes: Complex[];
  bookings: Booking[];
};

export type Action =
  | { type: "book"; complexId: string; schedule: string };

export const seedData: AppData = {
  profile: {
    id: "demo-player",
    name: "Invitado",
    email: "",
  },
  complexes: [],
  bookings: [],
};
