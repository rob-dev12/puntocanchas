import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-signature, x-request-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export type JsonObject = Record<string, unknown>;

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

export function optionsResponse(): Response {
  return new Response("ok", { headers: corsHeaders });
}

export function methodError(): Response {
  return jsonResponse({ error: "Método no permitido." }, 405);
}

export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Falta configurar ${name} en Supabase Secrets.`);
  return value;
}

export function createServiceClient() {
  return createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function readJsonObject(request: Request): Promise<JsonObject> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new Error("El cuerpo de la solicitud no es JSON válido.");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("El cuerpo de la solicitud debe ser un objeto JSON.");
  }
  return value as JsonObject;
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const address = forwarded?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "unknown";
  return address.slice(0, 100);
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "Ocurrió un error inesperado.";
}
