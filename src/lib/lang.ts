import { AsyncLocalStorage } from "node:async_hooks";

// Server side of the language switch: the API handler runs inside withLang(), and any message
// built with L("tiếng Việt", "English") during that request comes out in the caller's language.
type Lang = "vi" | "en";
const store = new AsyncLocalStorage<Lang>();

export const langOf = (req: { headers: { get(name: string): string | null } }): Lang =>
  req.headers.get("x-lang") === "en" ? "en" : "vi";

export const withLang = <T>(lang: Lang, fn: () => T): T => store.run(lang, fn);

export const L = (vi: string, en: string) => (store.getStore() === "en" ? en : vi);
