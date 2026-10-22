export interface Session {
  ready: boolean;
  authenticated: boolean;
  username: string | null;
  /** true against the simulated TideCloak (npm run dev:demo). */
  demo: boolean;
  login: () => void;
  logout: () => void;
  /** fetch that carries the caller's identity: the DPoP-bound Tide token and a fresh proof. */
  api: (url: string, init?: RequestInit) => Promise<Response>;
  /** The raw access token and its decoded claims, when the session can expose them. */
  token?: string | null;
  claims?: Record<string, unknown> | null;
}
