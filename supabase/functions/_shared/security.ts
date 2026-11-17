import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const encoder = new TextEncoder();
const codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type ReservationPlayerInput = {
  full_name: string;
  email: string;
  rut: string;
};

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function validateRut(value: unknown): string {
  if (typeof value !== "string") throw new Error("Ingresa un RUT chileno válido.");
  const rut = value.replace(/[.\s-]/g, "").toUpperCase();
  if (!/^\d{7,8}[0-9K]$/.test(rut)) throw new Error("El formato del RUT no es válido.");

  const body = rut.slice(0, -1);
  let sum = 0;
  let multiplier = 2;
  for (let index = body.length - 1; index >= 0; index--) {
    sum += Number(body[index]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const remainder = 11 - (sum % 11);
  const checkDigit = remainder === 11 ? "0" : remainder === 10 ? "K" : String(remainder);
  if (rut.at(-1) !== checkDigit) throw new Error("El dígito verificador del RUT no es válido.");
  return rut;
}

export function validateEmail(value: unknown): string {
  if (typeof value !== "string") throw new Error("Ingresa un correo electrónico válido.");
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Ingresa un correo electrónico válido.");
  }
  return email;
}

export function sanitizePlayers(value: unknown): ReservationPlayerInput[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 14) {
    throw new Error("La cantidad de participantes no es válida.");
  }

  const seenRuts = new Set<string>();
  const seenEmails = new Set<string>();
  return value.map((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error("Los datos de un participante no son válidos.");
    }

    const record = entry as Record<string, unknown>;
    if (typeof record.full_name !== "string") throw new Error("Ingresa el nombre y apellido de cada participante.");
    const fullName = record.full_name.trim().replace(/\s+/g, " ");
    if (fullName.length < 3 || fullName.length > 120) throw new Error("El nombre de un participante no es válido.");
    const email = validateEmail(record.email);
    const rut = validateRut(record.rut);
    if (seenRuts.has(rut) || seenEmails.has(email)) {
      throw new Error("Cada participante debe tener un correo y RUT distintos.");
    }
    seenRuts.add(rut);
    seenEmails.add(email);
    return { full_name: fullName, email, rut };
  });
}

export function normalizeReservationCode(value: unknown): string {
  if (typeof value !== "string") throw new Error("Ingresa un código de reserva válido.");
  const code = value.trim().toUpperCase();
  if (!/^RES-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(code)) {
    throw new Error("El código debe tener el formato RES-XXXX-XXXX.");
  }
  return code;
}

export function generateReservationCode(): string {
  let result = "";
  const cutoff = Math.floor(256 / codeAlphabet.length) * codeAlphabet.length;
  while (result.length < 8) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte >= cutoff) continue;
      result += codeAlphabet[byte % codeAlphabet.length];
      if (result.length === 8) break;
    }
  }
  return `RES-${result.slice(0, 4)}-${result.slice(4)}`;
}

export async function hashReservationCode(code: string, pepper: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`${pepper}:${code}`));
  return bytesToHex(new Uint8Array(digest));
}

async function codeEncryptionKey(pepper: string): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey("raw", encoder.encode(pepper), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode("puntoreservas-reservation-code"),
      info: encoder.encode("reservation-code-cipher-v1"),
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptReservationCode(code: string, pepper: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await codeEncryptionKey(pepper),
    encoder.encode(code),
  );
  return `v1:${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(encrypted))}`;
}

export async function decryptReservationCode(ciphertext: string, pepper: string): Promise<string> {
  const [version, encodedIv, encodedData] = ciphertext.split(":");
  if (version !== "v1" || !encodedIv || !encodedData) throw new Error("El código cifrado no tiene un formato válido.");
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(base64ToBytes(encodedIv)) },
    await codeEncryptionKey(pepper),
    new Uint8Array(base64ToBytes(encodedData)),
  );
  return new TextDecoder().decode(decrypted);
}

export async function lookupRateLimitKeys(ip: string, prefix: string, pepper: string): Promise<string[]> {
  const inputs = [`ip:${ip}`, `ip-prefix:${ip}:${prefix}`];
  return Promise.all(inputs.map(async (input) => {
    const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`${pepper}:${input}`));
    return bytesToHex(new Uint8Array(digest));
  }));
}

export async function startLookupAttempts(
  supabase: SupabaseClient,
  keys: string[],
): Promise<string[] | null> {
  const attempts: string[] = [];
  for (const key of keys) {
    const { data, error } = await supabase.rpc("start_code_lookup_attempt", {
      p_client_key: key,
      p_max_attempts: 8,
      p_window_seconds: 900,
    });
    if (error) throw error;
    if (typeof data !== "string") return null;
    attempts.push(data);
  }
  return attempts;
}

export async function finishLookupAttempts(
  supabase: SupabaseClient,
  attempts: string[],
  success: boolean,
): Promise<void> {
  const results = await Promise.all(attempts.map((attempt) =>
    supabase.rpc("finish_code_lookup_attempt", { p_attempt_id: attempt, p_success: success })
  ));
  const failure = results.find((result) => result.error)?.error;
  if (failure) throw failure;
}
