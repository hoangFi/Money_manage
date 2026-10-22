export interface Session {
  ready: boolean;
  authenticated: boolean;
  username: string | null;
  demo: boolean;
  login: () => void;
  logout: () => void;
  /** fetch that carries the caller's identity (DPoP-bound Tide token, or the demo header). */
  api: (url: string, init?: RequestInit) => Promise<Response>;
  /** Demo mode only: switch the acting user. */
  switchUser?: (username: string) => void;
}
