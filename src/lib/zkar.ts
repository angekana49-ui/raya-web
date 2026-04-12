/**
 * Zero-Knowledge Account Recovery (ZKAR)
 *
 * This module provides the cryptographic utilities to generate secure
 * Master Keys for anonymous account recovery via "Raya Card".
 *
 * The Master Key is a 16-character alphanumeric string.
 * It is hashed locally to generate a deterministic pseudo-email and password.
 * This guarantees 0 PII on the server while leveraging Supabase native Auth.
 */

const MASTER_KEY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MASTER_KEY_SEGMENT_LENGTH = 4;
const MASTER_KEY_SEGMENT_COUNT = 4;
const MASTER_KEY_RAW_LENGTH = MASTER_KEY_SEGMENT_LENGTH * MASTER_KEY_SEGMENT_COUNT;

export function normalizeMasterKey(masterKey: string): string {
  const normalized = masterKey.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const trimmed = normalized.slice(0, MASTER_KEY_RAW_LENGTH);

  const segments: string[] = [];
  for (let index = 0; index < trimmed.length; index += MASTER_KEY_SEGMENT_LENGTH) {
    segments.push(trimmed.slice(index, index + MASTER_KEY_SEGMENT_LENGTH));
  }

  return segments.join("-");
}

export function isValidMasterKey(masterKey: string): boolean {
  const normalized = masterKey.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return (
    normalized.length === MASTER_KEY_RAW_LENGTH &&
    [...normalized].every((char) => MASTER_KEY_ALPHABET.includes(char))
  );
}

// Generate a random 16-character key with an uppercase safe alphabet.
export function generateMasterKey(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);

  let key = '';
  for (let i = 0; i < array.length; i++) {
    key += MASTER_KEY_ALPHABET[array[i] % MASTER_KEY_ALPHABET.length];
  }

  return normalizeMasterKey(key);
}

// Generate a SHA-256 hash of a string
export async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Derive ZKAR credentials from a Master Key
export async function deriveCredentials(masterKey: string): Promise<{ email: string; password: string }> {
  const normalizedKey = normalizeMasterKey(masterKey).replace(/-/g, "");

  // Hash the key to ensure the raw key never hits the server
  const hash = await sha256(normalizedKey);

  // Supabase strict password policy requires: lowercase, uppercase, number, and symbol.
  // The raw hex hash only has lowercase (a-f) and numbers (0-9).
  // We explicitly prepend compliant characters to ensure it passes any strict policy deterministically.
  return {
    email: `${hash}@zkar.raya.local`,
    password: `Zk@R1_${hash}`
  };
}
