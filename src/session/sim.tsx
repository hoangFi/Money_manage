"use client";

import { decodeJwt } from "jose";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { clearSession, dpopProof, loadToken } from "./simDpop";
import type { Session } from "./types";

// Session against the simulated TideCloak (NEXT_PUBLIC_SIM_TIDE=1, see next.config.ts): sign-in
// goes through /sim-tide/login, and every API call carries the DPoP-bound token plus a fresh proof,
// exactly as secureFetch does with a real realm.
const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = loadToken();
    const exp = t ? decodeJwt(t).exp : undefined;
    if (t && exp && exp * 1000 > Date.now()) setToken(t);
    else clearSession();
    setReady(true);
  }, []);

  const login = useCallback(() => {
    location.href = `/sim-tide/login?return=${encodeURIComponent(location.pathname)}`;
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setToken(null);
    location.href = "/sim-tide/login";
  }, []);

  const api = useCallback(
    async (url: string, init?: RequestInit) => {
      if (!token) throw new Error("Chưa đăng nhập.");
      const method = init?.method ?? "GET";
      const headers = new Headers(init?.headers);
      headers.set("Authorization", `DPoP ${token}`);
      headers.set("DPoP", await dpopProof(method, url, token));
      return fetch(url, { ...init, headers });
    },
    [token]
  );

  const claims = token ? (decodeJwt(token) as Record<string, unknown>) : null;
  const session: Session = {
    ready,
    authenticated: !!token,
    username: (claims?.preferred_username as string) ?? null,
    demo: true,
    login,
    logout,
    api,
    token,
    claims,
  };
  return <Ctx.Provider value={session}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSession outside SessionProvider");
  return s;
}
