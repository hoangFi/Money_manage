import { calculateJwkThumbprint, exportJWK, generateKeyPair, importJWK, SignJWT, type JWK } from "jose";

// Browser side of the simulated TideCloak: a DPoP key per sign-in and RFC 9449 proofs, the same
// format @tidecloak/js's secureFetch sends. The server checks them with the template's verifyDpop.
// (The real SDK keeps a non-extractable key; this simulation keeps it in sessionStorage.)

const KEY = "quy-chung-sim-dpop";
const TOKEN = "quy-chung-sim-token";

const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

function read<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

/** Creates a fresh DPoP key pair and returns its thumbprint, which the token gets bound to. */
export async function newDpopKey(): Promise<string> {
  const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
  const pub = await exportJWK(publicKey);
  write(KEY, { private: await exportJWK(privateKey), public: pub });
  return calculateJwkThumbprint(pub, "sha256");
}

export const loadToken = () => read<string>(TOKEN);
export const saveToken = (token: string | null) => write(TOKEN, token);
export function clearSession() {
  write(TOKEN, null);
  write(KEY, null);
}

/** A DPoP proof for one request: signed by the browser key, bound to method, URL and token. */
export async function dpopProof(method: string, url: string, token: string): Promise<string> {
  const key = read<{ private: JWK; public: JWK }>(KEY);
  if (!key) throw new Error("No DPoP key: sign in again.");
  const u = new URL(url, location.origin);
  const ath = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  return new SignJWT({ htm: method.toUpperCase(), htu: `${u.origin}${u.pathname}`, ath })
    .setProtectedHeader({ alg: "ES256", typ: "dpop+jwt", jwk: key.public })
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .sign(await importJWK(key.private, "ES256"));
}
