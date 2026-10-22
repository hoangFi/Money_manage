import { NextRequest } from "next/server";
import { withAuth } from "./auth/protect";
import { extractToken } from "./auth/tideJWT";
import { loadDB } from "./fund/store";
import type { User } from "./fund/types";

// `tideToken` is the verified Tide access token of the caller (undefined in demo mode).
type ActorHandler = (req: NextRequest, actor: User, tideToken?: string) => Promise<Response>;

export const DEMO_AUTH = process.env.DEMO_AUTH === "1";

// Resolves who is calling. With Tide (default) the identity comes from the verified JWT + DPoP
// proof via the template's withAuth. DEMO_AUTH=1 trusts an `x-demo-user` header instead, so the
// app can be developed before TideCloak runs. Never deploy with DEMO_AUTH=1.
export function withActor(handler: ActorHandler) {
  if (DEMO_AUTH) {
    return async (req: NextRequest) => {
      const username = req.headers.get("x-demo-user");
      const user = loadDB().users.find((u) => u.username === username);
      if (!user) return Response.json({ error: "Chưa chọn người dùng demo." }, { status: 401 });
      return handler(req, user);
    };
  }
  return withAuth(async (req, jwt) => {
    const username = jwt.preferred_username as string | undefined;
    const user = loadDB().users.find((u) => u.username === username);
    if (!user) {
      return Response.json({ error: `Tài khoản "${username}" chưa có trong dữ liệu quỹ.` }, { status: 403 });
    }
    return handler(req, user, extractToken(req.headers.get("authorization")));
  });
}
