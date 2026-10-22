import { SIM_TIDE } from "@/lib/simtide/realm";
import { loadDB, resetDB } from "@/lib/fund/store";

// Demo (simulated TideCloak) helpers: list of switchable users and a data reset. Disabled against a real TideCloak.
export async function GET() {
  if (!SIM_TIDE) return Response.json({ error: "Demo mode is off" }, { status: 404 });
  return Response.json({ users: loadDB().users.map(({ id, username, name }) => ({ id, username, name })) });
}

export async function POST() {
  if (!SIM_TIDE) return Response.json({ error: "Demo mode is off" }, { status: 404 });
  resetDB();
  return Response.json({ ok: true });
}
