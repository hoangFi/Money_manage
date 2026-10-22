import { CLIENT, REALM, SIM_TIDE, simAccounts } from "@/lib/simtide/realm";

// The simulated realm's accounts and their role grants, for the sign-in page.
export async function GET() {
  if (!SIM_TIDE) return Response.json({ error: "Simulated TideCloak is off" }, { status: 404 });
  return Response.json({ realm: REALM, client: CLIENT, accounts: simAccounts() });
}
