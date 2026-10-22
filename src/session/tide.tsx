"use client";

import { useTideCloak } from "@tidecloak/nextjs";
import { Providers } from "@/app/providers";
import type { Session } from "./types";

// Real auth: the template's TideCloakProvider (with DPoP). secureFetch attaches the
// DPoP-bound token and a fresh proof, which the server's withAuth verifies.
export function SessionProvider({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers>;
}

export function useSession(): Session {
  const tc = useTideCloak();
  return {
    ready: !tc.isInitializing,
    authenticated: tc.authenticated,
    username: tc.authenticated ? (tc.getValueFromIdToken("preferred_username") as string) : null,
    demo: false,
    login: tc.login,
    logout: tc.logout,
    api: (url, init) => tc.secureFetch(url, init),
  };
}
