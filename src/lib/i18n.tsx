"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

// Vietnamese / English. Strings are written in place as t("tiếng Việt", "English"), so each
// translation sits next to its text. The choice is remembered per browser and sent to the API
// (x-lang) so server messages come back in the same language.
export type Lang = "vi" | "en";
const KEY = "quy-chung-lang";

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: "vi", setLang: () => {} });

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("vi");
  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === "en") setLangState("en");
    } catch {}
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(KEY, l);
    } catch {}
  }, []);
  return <Ctx.Provider value={{ lang, setLang }}>{children}</Ctx.Provider>;
}

export function useLang() {
  return useContext(Ctx);
}

/** t("Tiếng Việt", "English") returns the text for the current language. */
export function useT() {
  const { lang } = useContext(Ctx);
  return useCallback((vi: string, en: string) => (lang === "en" ? en : vi), [lang]);
}

/** A [vi, en] pair, for labels kept in lookup tables. */
export type Text = readonly [vi: string, en: string];
