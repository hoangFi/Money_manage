// "quy-session" is a webpack alias (next.config.ts) that points at tide.tsx, or at demo.tsx
// when NEXT_PUBLIC_DEMO_AUTH=1. Both export the same API; types come from the Tide one.
declare module "quy-session" {
  export { SessionProvider, useSession } from "@/session/tide";
  export type { Session } from "@/session/types";
}
