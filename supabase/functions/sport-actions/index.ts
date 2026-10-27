import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return response({ error: "Método no permitido." }, 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return response({ error: "Se requiere una sesión válida." }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceRoleKey) return response({ error: "Falta configuración del servidor de Supabase." }, 500);

  const authClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: authData, error: authError } = await authClient.auth.getUser();
  if (authError || !authData.user) return response({ error: "La sesión no es válida." }, 401);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return response({ error: "El cuerpo de la solicitud no es JSON válido." }, 400);
  }

  const service = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const user = authData.user;

  if (body.action === "bootstrap") {
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "Jugador";
    const { error: insertError } = await service.from("profiles").upsert(
      { id: user.id, name: name || "Jugador", email: user.email ?? "jugador@canchareserva.cl" },
      { onConflict: "id", ignoreDuplicates: true },
    );
    if (insertError) return response({ error: insertError.message }, 500);
    const { data: profile, error: profileError } = await service.from("profiles").select("id, name, email, wallet_balance").eq("id", user.id).single();
    if (profileError) return response({ error: profileError.message }, 500);
    return response({ profile: { id: profile.id, name: profile.name, email: profile.email, walletBalance: Number(profile.wallet_balance) } });
  }

  let rpcName: string;
  let parameters: Record<string, unknown>;
  switch (body.type) {
    case "book":
      if (typeof body.complexId !== "string" || typeof body.schedule !== "string") return response({ error: "Faltan datos de reserva." }, 400);
      rpcName = "book_court";
      parameters = { p_user_id: user.id, p_complex_id: body.complexId, p_schedule: body.schedule };
      break;
    case "create":
      if (
        typeof body.complexId !== "string" || typeof body.schedule !== "string" ||
        typeof body.description !== "string" || !Number.isInteger(body.slotsTotal)
      ) return response({ error: "Los datos del partido no son válidos." }, 400);
      rpcName = "create_match";
      parameters = {
        p_user_id: user.id,
        p_complex_id: body.complexId,
        p_schedule: body.schedule,
        p_description: body.description.slice(0, 500),
        p_slots_total: body.slotsTotal,
      };
      break;
    case "join":
      if (typeof body.matchId !== "string") return response({ error: "Falta el identificador del partido." }, 400);
      rpcName = "join_match";
      parameters = { p_user_id: user.id, p_match_id: body.matchId };
      break;
    case "funds":
      if (typeof body.amount !== "number" || !Number.isFinite(body.amount)) return response({ error: "El monto no es válido." }, 400);
      rpcName = "add_wallet_funds";
      parameters = { p_user_id: user.id, p_amount: body.amount };
      break;
    default:
      return response({ error: "Acción no reconocida." }, 400);
  }

  const { error } = await service.rpc(rpcName, parameters);
  if (error) {
    const status = /no disponible|insuficiente|completo|cupo|válid|encontró|encontrado/i.test(error.message) ? 409 : 500;
    return response({ error: error.message }, status);
  }
  return response({ success: true });
});
