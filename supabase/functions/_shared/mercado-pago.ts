import { requireEnv } from "./http.ts";

export type MercadoPagoPayment = {
  id: number | string;
  status: string;
  external_reference: string | null;
  preference_id: string | null;
  transaction_amount: number;
  currency_id: string;
};

type PreferenceInput = {
  reservationId: string;
  paymentType: "initial" | "additional_players";
  amount: number;
  title: string;
  expiresAt: string;
};

export async function createMercadoPagoPreference(input: PreferenceInput): Promise<{ id: string; initPoint: string }> {
  const appUrl = new URL(requireEnv("APP_URL"));
  if (appUrl.protocol !== "https:" && appUrl.hostname !== "localhost") {
    throw new Error("APP_URL debe usar HTTPS.");
  }
  const supabaseUrl = new URL(requireEnv("SUPABASE_URL"));
  const notificationUrl = new URL("/functions/v1/mp-webhook", supabaseUrl).toString();
  const returnUrl = new URL("/", appUrl);
  returnUrl.searchParams.set("payment", "return");
  returnUrl.searchParams.set("reservation", input.reservationId);

  const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireEnv("MP_ACCESS_TOKEN")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      items: [{
        id: input.reservationId,
        title: input.title.slice(0, 250),
        quantity: 1,
        currency_id: "CLP",
        unit_price: input.amount,
      }],
      external_reference: `${input.reservationId}:${input.paymentType}`,
      notification_url: notificationUrl,
      back_urls: {
        success: returnUrl.toString(),
        pending: returnUrl.toString(),
        failure: returnUrl.toString(),
      },
      auto_return: "approved",
      expires: true,
      expiration_date_to: input.expiresAt,
      metadata: {
        reservation_id: input.reservationId,
        payment_type: input.paymentType,
      },
    }),
    signal: AbortSignal.timeout(12000),
  });

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || typeof payload !== "object" || payload === null) {
    throw new Error(`Mercado Pago no pudo crear el checkout (HTTP ${response.status}).`);
  }
  const record = payload as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.init_point !== "string") {
    throw new Error("Mercado Pago devolvió una preferencia incompleta.");
  }
  return { id: record.id, initPoint: record.init_point };
}

export async function fetchMercadoPagoPayment(paymentId: string): Promise<MercadoPagoPayment> {
  if (!/^\d{1,20}$/.test(paymentId)) throw new Error("El identificador de pago no es válido.");
  const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${requireEnv("MP_ACCESS_TOKEN")}` },
    signal: AbortSignal.timeout(12000),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || typeof payload !== "object" || payload === null) {
    throw new Error(`No se pudo consultar el pago en Mercado Pago (HTTP ${response.status}).`);
  }
  return payload as MercadoPagoPayment;
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export async function verifyMercadoPagoSignature(request: Request, paymentId: string): Promise<boolean> {
  const signature = request.headers.get("x-signature");
  const requestId = request.headers.get("x-request-id");
  if (!signature || !requestId) return false;

  const parts = new Map(signature.split(",").map((part) => {
    const [key, ...value] = part.trim().split("=");
    return [key, value.join("=")];
  }));
  const timestamp = parts.get("ts");
  const received = parts.get("v1");
  if (!timestamp || !received || !/^\d+$/.test(timestamp) || !/^[a-f0-9]{64}$/i.test(received)) return false;
  if (Math.abs(Date.now() - Number(timestamp) * 1000) > 10 * 60 * 1000) return false;

  const manifest = `id:${paymentId.toLowerCase()};request-id:${requestId};ts:${timestamp};`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(requireEnv("MP_WEBHOOK_SECRET")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest));
  const expected = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return constantTimeEqual(expected, received.toLowerCase());
}
