import { DEMO_AUTH } from "@/lib/actor";
import { loadDB, resetDB } from "@/lib/fund/store";

// Demo-mode helpers: list of switchable users and a data reset. Disabled under Tide auth.
export async function GET() {
  if (!DEMO_AUTH) return Response.json({ error: "Demo mode is off" }, { status: 404 });
  return Response.json({ users: loadDB().users.map(({ id, username, name }) => ({ id, username, name })) });
}

export async function POST() {
  if (!DEMO_AUTH) return Response.json({ error: "Demo mode is off" }, { status: 404 });
  resetDB();
  return Response.json({ ok: true });
}
