import { issueToken, SIM_TIDE } from "@/lib/simtide/realm";

// Simulated TideCloak token endpoint. Issues a DPoP-bound token for the chosen account:
// `jkt` is the thumbprint of the browser's DPoP key, so the token only works with that key.
// No password: in TideCloak the Tide enclave authenticates the user and our app never sees it.
export async function POST(req: Request) {
  if (!SIM_TIDE) return Response.json({ error: "Simulated TideCloak is off" }, { status: 404 });
  const { username, jkt } = await req.json();
  if (typeof jkt !== "string" || !/^[\w-]{43}$/.test(jkt)) {
    return Response.json({ error: "Missing or invalid DPoP key thumbprint (jkt)." }, { status: 400 });
  }
  try {
    return Response.json({ access_token: await issueToken(username, jkt), token_type: "DPoP" });
  } catch {
    return Response.json({ error: "Không có tài khoản này trong realm." }, { status: 401 });
  }
}
