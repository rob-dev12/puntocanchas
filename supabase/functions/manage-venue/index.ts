import { createServiceClient, errorMessage, jsonResponse, methodError, optionsResponse, readJsonObject } from "../_shared/http.ts";

type VenuePolicyInput = {
  min_hours_before_cancellation: number;
  refund_percentage: number;
  requires_id_card: boolean;
  required_documents: string[];
  policy_summary: string;
  evaluation_procedure: string;
};

type CourtInput = {
  id?: string;
  name: string;
  sport: string;
  min_players: number;
  max_players: number;
  price_per_slot: number;
  price_per_player: number | null;
  slot_duration_minutes: number;
  open_time: string;
  close_time: string;
  is_active: boolean;
};

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function validatePolicy(value: Record<string, unknown>): VenuePolicyInput {
  const minHours = value.min_hours_before_cancellation;
  const refundPercentage = value.refund_percentage;
  const documents = value.required_documents;
  const summary = typeof value.policy_summary === "string" ? value.policy_summary.trim() : "";
  const procedure = typeof value.evaluation_procedure === "string" ? value.evaluation_procedure.trim() : "";
  if (!Number.isInteger(minHours) || Number(minHours) < 0 || Number(minHours) > 720) {
    throw new Error("La anticipación de cancelación debe estar entre 0 y 720 horas.");
  }
  if (!Number.isInteger(refundPercentage) || Number(refundPercentage) < 0 || Number(refundPercentage) > 100) {
    throw new Error("El porcentaje de reembolso debe estar entre 0 y 100.");
  }
  if (typeof value.requires_id_card !== "boolean") throw new Error("Indica si se requiere identificación.");
  if (
    !Array.isArray(documents)
    || documents.length > 12
    || documents.some((item) => typeof item !== "string" || item.trim().length < 2 || item.trim().length > 120)
  ) {
    throw new Error("La lista de documentos requeridos no es válida.");
  }
  if (summary.length < 5 || summary.length > 2000 || procedure.length < 5 || procedure.length > 2000) {
    throw new Error("La política y el procedimiento deben tener entre 5 y 2.000 caracteres.");
  }
  return {
    min_hours_before_cancellation: Number(minHours),
    refund_percentage: Number(refundPercentage),
    requires_id_card: value.requires_id_card,
    required_documents: documents.map((item) => item.trim()),
    policy_summary: summary,
    evaluation_procedure: procedure,
  };
}

function validateCourt(value: Record<string, unknown>): CourtInput {
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const sport = typeof value.sport === "string" ? value.sport.trim() : "";
  const minPlayers = value.min_players;
  const maxPlayers = value.max_players;
  const pricePerSlot = value.price_per_slot;
  const pricePerPlayer = value.price_per_player === null || value.price_per_player === ""
    ? null
    : value.price_per_player;
  const duration = value.slot_duration_minutes;
  const openTime = typeof value.open_time === "string" ? value.open_time : "";
  const closeTime = typeof value.close_time === "string" ? value.close_time : "";
  if (name.length < 2 || name.length > 100 || sport.length < 2 || sport.length > 80) {
    throw new Error("El nombre de cancha y deporte deben tener entre 2 y 100 caracteres.");
  }
  if (
    !Number.isInteger(minPlayers) || !Number.isInteger(maxPlayers)
    || Number(minPlayers) < 1 || Number(maxPlayers) < Number(minPlayers) || Number(maxPlayers) > 14
  ) {
    throw new Error("La capacidad debe estar entre 1 y 14 participantes.");
  }
  if (!Number.isInteger(pricePerSlot) || Number(pricePerSlot) < 0 || Number(pricePerSlot) > 100000000) {
    throw new Error("El precio por cancha no es válido.");
  }
  if (
    pricePerPlayer !== null
    && (!Number.isInteger(pricePerPlayer) || Number(pricePerPlayer) < 0 || Number(pricePerPlayer) > 100000000)
  ) {
    throw new Error("El precio por jugador no es válido.");
  }
  if (Number(pricePerSlot) === 0 && (!pricePerPlayer || Number(pricePerPlayer) === 0)) {
    throw new Error("Configura un precio positivo por cancha o por jugador.");
  }
  if (!Number.isInteger(duration) || Number(duration) < 15 || Number(duration) > 720) {
    throw new Error("La duración debe estar entre 15 y 720 minutos.");
  }
  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!timePattern.test(openTime) || !timePattern.test(closeTime) || openTime >= closeTime) {
    throw new Error("El horario de apertura y cierre no es válido.");
  }
  if (typeof value.is_active !== "boolean") throw new Error("El estado de la cancha no es válido.");
  if (value.id !== undefined && !isUuid(value.id)) throw new Error("El identificador de cancha no es válido.");
  return {
    id: typeof value.id === "string" ? value.id : undefined,
    name,
    sport,
    min_players: Number(minPlayers),
    max_players: Number(maxPlayers),
    price_per_slot: Number(pricePerSlot),
    price_per_player: pricePerPlayer === null ? null : Number(pricePerPlayer),
    slot_duration_minutes: Number(duration),
    open_time: openTime,
    close_time: closeTime,
    is_active: value.is_active,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return methodError();

  try {
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return jsonResponse({ error: "Debes iniciar sesión como propietario o administrador." }, 401);

    const supabase = createServiceClient();
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user || userData.user.is_anonymous) {
      return jsonResponse({ error: "La sesión no pertenece a una cuenta de propietario o administrador." }, 401);
    }

    const body = await readJsonObject(request);
    const action = body.action;
    if (action === "list") {
      const { data: memberships, error } = await supabase
        .from("venue_memberships")
        .select("complex_id, role")
        .eq("user_id", userData.user.id)
        .order("created_at");
      if (error) throw error;
      if (!memberships.length) return jsonResponse({ venues: [] });
      const { data: venues, error: venuesError } = await supabase
        .from("sport_complexes")
        .select("id, name, location")
        .in("id", memberships.map((membership) => membership.complex_id))
        .order("name");
      if (venuesError) throw venuesError;
      return jsonResponse({
        venues: venues.map((venue) => ({
          ...venue,
          role: memberships.find((membership) => membership.complex_id === venue.id)?.role,
        })),
      });
    }

    const complexId = body.complex_id;
    if (!isUuid(complexId)) return jsonResponse({ error: "El identificador del recinto no es válido." }, 400);
    const { data: membership, error: membershipError } = await supabase
      .from("venue_memberships")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("complex_id", complexId)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) return jsonResponse({ error: "No tienes permisos para administrar este recinto." }, 403);

    if (action === "get_policy") {
      const [policyResult, cancellationResult, courtResult] = await Promise.all([
        supabase.from("venue_policies")
          .select("min_hours_before_cancellation, refund_percentage, requires_id_card, required_documents, policy_summary, evaluation_procedure, updated_at")
          .eq("complex_id", complexId)
          .maybeSingle(),
        supabase.from("cancellation_requests")
          .select("id, reservation_id, reason, status, resolution_notes, approved_refund_amount, requested_at, resolved_at")
          .eq("complex_id", complexId)
          .order("requested_at", { ascending: false })
          .limit(50),
        supabase.from("courts")
          .select("id, name, sport, min_players, max_players, price_per_slot, price_per_player, slot_duration_minutes, open_time, close_time, is_active")
          .eq("complex_id", complexId)
          .order("name"),
      ]);
      if (policyResult.error) throw policyResult.error;
      if (cancellationResult.error) throw cancellationResult.error;
      if (courtResult.error) throw courtResult.error;
      return jsonResponse({ policy: policyResult.data, cancellations: cancellationResult.data, courts: courtResult.data });
    }

    if (action === "save_policy") {
      if (typeof body.policy !== "object" || body.policy === null || Array.isArray(body.policy)) {
        return jsonResponse({ error: "La política enviada no es válida." }, 400);
      }
      let policy: VenuePolicyInput;
      try {
        policy = validatePolicy(body.policy as Record<string, unknown>);
      } catch (error) {
        return jsonResponse({ error: errorMessage(error) }, 400);
      }
      const { data, error } = await supabase
        .from("venue_policies")
        .upsert({ complex_id: complexId, ...policy, updated_at: new Date().toISOString() }, { onConflict: "complex_id" })
        .select("min_hours_before_cancellation, refund_percentage, requires_id_card, required_documents, policy_summary, evaluation_procedure, updated_at")
        .single();
      if (error) throw error;
      return jsonResponse({ policy: data });
    }

    if (action === "save_court") {
      if (typeof body.court !== "object" || body.court === null || Array.isArray(body.court)) {
        return jsonResponse({ error: "La configuración de cancha no es válida." }, 400);
      }
      let court: CourtInput;
      try {
        court = validateCourt(body.court as Record<string, unknown>);
      } catch (error) {
        return jsonResponse({ error: errorMessage(error) }, 400);
      }
      const { id, ...courtData } = court;
      const query = supabase.from("courts");
      const result = id
        ? await query.update(courtData).eq("id", id).eq("complex_id", complexId).select("id, name, sport, min_players, max_players, price_per_slot, price_per_player, slot_duration_minutes, open_time, close_time, is_active").maybeSingle()
        : await query.insert({ ...courtData, complex_id: complexId }).select("id, name, sport, min_players, max_players, price_per_slot, price_per_player, slot_duration_minutes, open_time, close_time, is_active").single();
      if (result.error) {
        if (result.error.code === "23505") return jsonResponse({ error: "Ya existe una cancha con ese nombre en el recinto." }, 409);
        throw result.error;
      }
      if (!result.data) return jsonResponse({ error: "No se encontró la cancha para actualizar." }, 404);
      return jsonResponse({ court: result.data });
    }

    if (action === "set_court_active") {
      if (!isUuid(body.court_id) || typeof body.is_active !== "boolean") {
        return jsonResponse({ error: "La actualización de estado no es válida." }, 400);
      }
      const { data, error } = await supabase.from("courts")
        .update({ is_active: body.is_active })
        .eq("id", body.court_id)
        .eq("complex_id", complexId)
        .select("id, is_active")
        .maybeSingle();
      if (error) throw error;
      if (!data) return jsonResponse({ error: "No se encontró la cancha para actualizar." }, 404);
      return jsonResponse({ court: data });
    }

    if (action === "resolve_cancellation") {
      const cancellationId = body.cancellation_id;
      const resolution = body.resolution;
      const notes = typeof body.resolution_notes === "string" ? body.resolution_notes.trim() : "";
      if (!isUuid(cancellationId) || !["approved", "rejected"].includes(String(resolution))) {
        return jsonResponse({ error: "La resolución de cancelación no es válida." }, 400);
      }
      if (notes.length < 3 || notes.length > 2000) {
        return jsonResponse({ error: "La nota de resolución debe tener entre 3 y 2.000 caracteres." }, 400);
      }
      const { data, error } = await supabase
        .from("cancellation_requests")
        .update({
          status: resolution,
          resolution_notes: notes,
          resolved_at: new Date().toISOString(),
        })
        .eq("id", cancellationId)
        .eq("complex_id", complexId)
        .eq("status", "pending_review")
        .select("id, status, resolution_notes, resolved_at")
        .maybeSingle();
      if (error) throw error;
      if (!data) return jsonResponse({ error: "La solicitud ya fue atendida o no pertenece a este recinto." }, 409);
      return jsonResponse({ cancellation: data, refund_executed: false });
    }

    return jsonResponse({ error: "La acción solicitada no es válida." }, 400);
  } catch (error) {
    console.error("manage-venue failed:", errorMessage(error));
    return jsonResponse({ error: errorMessage(error) }, 500);
  }
});
