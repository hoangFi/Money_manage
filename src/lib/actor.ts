import { NextRequest } from "next/server";
import { withAuth } from "./auth/protect";
import { loadTideConfig } from "./auth/tidecloakConfig";
import { extractToken } from "./auth/tideJWT";
import { loadDB } from "./fund/store";
import type { User } from "./fund/types";

// `tideToken` is the verified Tide access token of the caller.
type ActorHandler = (req: NextRequest, actor: User, tideToken: string) => Promise<Response>;

// Resolves who is calling from the verified JWT + DPoP proof (the template's withAuth), against
// TideCloak or, with SIM_TIDE=1, the simulated realm. Roles are read from the token: the fund
// roles on our client and `platform-admin` from the realm roles. The database only supplies the
// profile; it cannot grant a role.
export function withActor(handler: ActorHandler) {
  return withAuth(async (req, jwt) => {
    const username = jwt.preferred_username as string | undefined;
    const user = loadDB().users.find((u) => u.username === username);
    if (!user) {
      return Response.json({ error: `Tài khoản "${username}" chưa có trong dữ liệu quỹ.` }, { status: 403 });
    }
    const client = loadTideConfig().resource;
    const actor: User = {
      ...user,
      platformAdmin: ((jwt.realm_access as any)?.roles ?? []).includes("platform-admin"),
      tideRoles: (jwt.resource_access as any)?.[client]?.roles ?? [],
    };
    return handler(req, actor, extractToken(req.headers.get("authorization")));
  });
}
