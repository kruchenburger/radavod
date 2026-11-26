import type { Id } from "../kernel/id";

/** Secrets, tokens and identifiers made on the server: a caller never names them. */

const base58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** An identifier of the kernel: `<kind>_` and 22 characters of base58, about 129 bits. */
export function newId<K extends string>(kind: K): Id<K> {
  const characters: string[] = [];
  while (characters.length < 22) {
    for (const byte of crypto.getRandomValues(new Uint8Array(32))) {
      // 58 * 4 = 232: the bytes above it would make some characters likelier.
      if (byte < 232 && characters.length < 22) characters.push(base58[byte % 58] ?? "");
    }
  }
  return `${kind}_${characters.join("")}` as Id<K>;
}

/** 256 random bits in base64url: an invitation, a recovery link, a session, a step of signing in. */
export function newSecret(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

/** The SHA-256 of a text in hex: what is kept instead of a secret. */
export async function hashOf(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

export function fromBase64url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
