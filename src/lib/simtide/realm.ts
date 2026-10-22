import { generateKeyPairSync } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { importJWK, SignJWT, type JWK } from "jose";
import { seed } from "../fund/seed";
import type { TidecloakConfig } from "../auth/tidecloakConfig";

// A stand-in for a TideCloak realm, used until Tide licensing works for us (docs/TIDECLOAK.md).
// It issues the same kind of token TideCloak does: EdDSA-signed, DPoP-bound (cnf.jkt), with realm
// and client roles. The app verifies it with the unchanged verifyTideJWT + verifyDpop code.
//
// Two deliberate differences from the real thing:
// - the signing key lives in data/sim-tide/ (in TideCloak it only exists as ORK key shares);
// - role grants are fixed below (in TideCloak they change only through IGA change requests
//   approved by an admin quorum). The app database can never add a role.

export const SIM_TIDE = process.env.SIM_TIDE === "1";

export const REALM = "quy-chung";
export const CLIENT = "quy-chung-client";
// Issuer base, as the browser reaches the app. Override when the app runs elsewhere.
const AUTH_SERVER_URL = `${process.env.SIM_TIDE_URL ?? "http://localhost:3000"}/sim-tide`;
const KEY_FILE = join(process.cwd(), "data", "sim-tide", "realm-key.json");
const TOKEN_LIFETIME_S = 60 * 60;

export interface SimAccount {
  username: string;
  name: string;
  realmRoles: string[];
  clientRoles: string[]; // roles on quy-chung-client, e.g. fund:f-dalat:treasurer
  adminRoles: string[]; // roles on realm-management
}

/** The realm's users and their role grants. Built from the seed data, never from the live database. */
export function simAccounts(): SimAccount[] {
  const data = seed();
  return data.users.map((u) => ({
    username: u.username,
    name: u.name,
    realmRoles: ["_tide_enabled", "offline_access", ...(u.platformAdmin ? ["platform-admin"] : [])],
    clientRoles: data.funds.flatMap((f) =>
      f.members.filter((m) => m.userId === u.id && m.role !== "donor").map((m) => `fund:${f.id}:${m.role}`)
    ),
    adminRoles: u.platformAdmin ? ["tide-realm-admin"] : [],
  }));
}

/** The realm signing key: Ed25519, created once and kept in data/sim-tide/ (gitignored). */
function realmKeys(): { private: JWK; public: JWK } {
  if (!existsSync(KEY_FILE)) {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const kid = `sim-${Date.now().toString(36)}`;
    const stored = {
      private: { ...(privateKey.export({ format: "jwk" }) as JWK), kid, alg: "EdDSA" },
      public: { ...(publicKey.export({ format: "jwk" }) as JWK), kid, alg: "EdDSA", use: "sig" },
    };
    mkdirSync(join(KEY_FILE, ".."), { recursive: true });
    writeFileSync(KEY_FILE, JSON.stringify(stored, null, 2));
  }
  return JSON.parse(readFileSync(KEY_FILE, "utf-8"));
}

/** Adapter config in the shape TideCloak exports as tidecloak.json. */
export function simAdapterConfig(): TidecloakConfig {
  return {
    realm: REALM,
    "auth-server-url": AUTH_SERVER_URL,
    "ssl-required": "external",
    resource: CLIENT,
    "public-client": true,
    "confidential-port": 0,
    jwk: { keys: [realmKeys().public] },
    vendorId: "simulated",
    homeOrkUrl: "simulated",
  };
}

/** Issues a DPoP-bound access token for one account, as TideCloak's token endpoint would. */
export async function issueToken(username: string, jkt: string) {
  const account = simAccounts().find((a) => a.username === username);
  if (!account) throw new Error("Unknown account");
  const key = realmKeys();
  return new SignJWT({
    typ: "Bearer",
    azp: CLIENT,
    preferred_username: account.username,
    name: account.name,
    realm_access: { roles: account.realmRoles },
    resource_access: {
      [CLIENT]: { roles: account.clientRoles },
      ...(account.adminRoles.length ? { "realm-management": { roles: account.adminRoles } } : {}),
    },
    cnf: { jkt },
    scope: "openid profile",
  })
    .setProtectedHeader({ alg: "EdDSA", kid: key.public.kid, typ: "JWT" })
    .setIssuer(`${AUTH_SERVER_URL}/realms/${REALM}`)
    .setSubject(`sim-${account.username}`)
    .setAudience("account")
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_LIFETIME_S}s`)
    .sign(await importJWK(key.private, "EdDSA"));
}
