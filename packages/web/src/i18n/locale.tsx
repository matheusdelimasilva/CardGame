import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Locale } from "@cardgame/protocol";
import { KEYS, storage } from "../storage";

export type { Locale } from "@cardgame/protocol";

export function defaultLocale(
  saved: string | null,
  preferredLanguages: readonly string[],
): Locale {
  if (saved === "en" || saved === "pt-BR") return saved;

  for (const language of preferredLanguages) {
    const primary = language.toLowerCase().split("-")[0];
    if (primary === "pt") return "pt-BR";
    if (primary === "en") return "en";
  }

  return "en";
}

export function translate(
  locale: Locale,
  english: string,
  brazilianPortuguese: string,
): string {
  return locale === "pt-BR" ? brazilianPortuguese : english;
}

type LocaleContext = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (english: string, brazilianPortuguese: string) => string;
};

const LocaleContext = createContext<LocaleContext>({
  locale: "en",
  setLocale: () => {},
  t: (english) => english,
});

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() =>
    defaultLocale(
      storage.get(KEYS.locale),
      navigator.languages.length ? navigator.languages : [navigator.language],
    ),
  );

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<LocaleContext>(
    () => ({
      locale,
      setLocale(next) {
        storage.set(KEYS.locale, next);
        setLocale(next);
      },
      t: (english, brazilianPortuguese) =>
        translate(locale, english, brazilianPortuguese),
    }),
    [locale],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}
