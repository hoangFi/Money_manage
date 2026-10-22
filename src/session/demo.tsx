"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Session } from "./types";

// Demo auth for building without TideCloak: pick who you are from a list.
// Only compiled in when NEXT_PUBLIC_DEMO_AUTH=1 (see next.config.ts).
const Ctx = createContext<Session | null>(null);
const KEY = "quy-chung-demo-user";

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [username, setUsername] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setUsername(localStorage.getItem(KEY));
    } catch {}
    setReady(true);
  }, []);

  const switchUser = useCallback((u: string) => {
    try {
      localStorage.setItem(KEY, u);
    } catch {}
    setUsername(u);
  }, []);

  const api = useCallback(
    (url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      if (username) headers.set("x-demo-user", username);
      return fetch(url, { ...init, headers });
    },
    [username]
  );

  const session: Session = {
    ready,
    authenticated: !!username,
    username,
    demo: true,
    login: () => switchUser("an"),
    logout: () => {
      try {
        localStorage.removeItem(KEY);
      } catch {}
      setUsername(null);
    },
    api,
    switchUser,
  };
  return <Ctx.Provider value={session}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSession outside SessionProvider");
  return s;
}
