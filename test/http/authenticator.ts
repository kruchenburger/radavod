import { isoCBOR } from "@simplewebauthn/server/helpers";

/**
 * A passkey made in a test, as a phone would make it: an ES256 key, a "none" attestation and signed
 * assertions. It answers the options the server gives, for the origin it is told.
 */
export class Authenticator {
  readonly id: string;
  #keys: CryptoKeyPair | undefined;
  #counter = 0;
  #user = "";

  readonly origin: string;
  readonly rpId: string;

  constructor(origin: string, rpId: string) {
    this.origin = origin;
    this.rpId = rpId;
    this.id = b64(crypto.getRandomValues(new Uint8Array(16)));
  }

  /** What a browser answers registration options with. */
  async register(options: { challenge: string; user: { id: string } }, origin = this.origin) {
    this.#keys = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    this.#user = options.user.id;
    const jwk = (await crypto.subtle.exportKey("jwk", this.#keys.publicKey)) as JsonWebKey;
    const cose = new Map<number, number | Uint8Array>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, unb64(jwk.x ?? "")],
      [-3, unb64(jwk.y ?? "")],
    ]);
    const id = unb64(this.id);
    const authData = concat(
      await this.#rpIdHash(),
      // User present, user verified, attested credential data.
      new Uint8Array([0x45]),
      counterBytes(this.#counter),
      new Uint8Array(16),
      new Uint8Array([id.length >> 8, id.length & 0xff]),
      id,
      isoCBOR.encode(cose),
    );
    const attestationObject = isoCBOR.encode(
      new Map<string, unknown>([
        ["fmt", "none"],
        ["attStmt", new Map()],
        ["authData", authData],
      ]) as never,
    );
    const clientDataJSON = clientData("webauthn.create", options.challenge, origin);
    return {
      id: this.id,
      rawId: this.id,
      type: "public-key" as const,
      response: {
        clientDataJSON: b64(clientDataJSON),
        attestationObject: b64(attestationObject),
        transports: ["internal"],
      },
      clientExtensionResults: {},
    };
  }

  /** What a browser answers sign-in options with. */
  async signIn(options: { challenge: string }, origin = this.origin) {
    if (this.#keys === undefined) throw new Error("no passkey yet");
    this.#counter += 1;
    const authData = concat(
      await this.#rpIdHash(),
      new Uint8Array([0x05]),
      counterBytes(this.#counter),
    );
    const clientDataJSON = clientData("webauthn.get", options.challenge, origin);
    const signed = concat(
      authData,
      new Uint8Array(await crypto.subtle.digest("SHA-256", clientDataJSON)),
    );
    const raw = new Uint8Array(
      await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, this.#keys.privateKey, signed),
    );
    return {
      id: this.id,
      rawId: this.id,
      type: "public-key" as const,
      response: {
        clientDataJSON: b64(clientDataJSON),
        authenticatorData: b64(authData),
        signature: b64(der(raw)),
        userHandle: this.#user,
      },
      clientExtensionResults: {},
    };
  }

  async #rpIdHash(): Promise<Uint8Array> {
    return new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(this.rpId)),
    );
  }
}

function clientData(type: string, challenge: string, origin: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(
    new TextEncoder().encode(JSON.stringify({ type, challenge, origin, crossOrigin: false })),
  );
}

function counterBytes(counter: number): Uint8Array {
  return new Uint8Array([
    counter >>> 24,
    (counter >> 16) & 0xff,
    (counter >> 8) & 0xff,
    counter & 0xff,
  ]);
}

/** A signature of WebCrypto, r and s, as WebAuthn wants it: in DER. */
function der(raw: Uint8Array): Uint8Array {
  const integer = (part: Uint8Array) => {
    let start = 0;
    while (start < part.length - 1 && part[start] === 0) start += 1;
    let bytes = part.slice(start);
    if ((bytes[0] ?? 0) & 0x80) bytes = concat(new Uint8Array([0]), bytes);
    return concat(new Uint8Array([0x02, bytes.length]), bytes);
  };
  const body = concat(integer(raw.slice(0, 32)), integer(raw.slice(32)));
  return concat(new Uint8Array([0x30, body.length]), body);
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const all = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let at = 0;
  for (const part of parts) {
    all.set(part, at);
    at += part.length;
  }
  return all;
}

export function b64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function unb64(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
