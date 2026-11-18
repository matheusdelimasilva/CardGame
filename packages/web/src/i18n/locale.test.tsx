import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";
import { KEYS } from "../storage";
import { LanguagePicker } from "../ui/LanguagePicker";
import { defaultLocale, LocaleProvider, useLocale } from "./locale";

function Probe() {
  const { t } = useLocale();
  return <p>{t("Welcome", "Boas-vindas")}</p>;
}

let renderer: ReactTestRenderer | undefined;

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
});

it("honors the first supported browser preference and falls back to English", () => {
  expect(defaultLocale(null, ["es", "pt-PT", "en"])).toBe("pt-BR");
  expect(defaultLocale(null, ["en-US", "pt-BR"])).toBe("en");
  expect(defaultLocale("es", ["de", "fr"])).toBe("en");
});

it("updates the document and saves the selection across mounts", () => {
  const values = new Map<string, string>();
  const html = { lang: "en" };
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  vi.stubGlobal("navigator", { languages: ["pt-BR"] });
  vi.stubGlobal("document", { documentElement: html });

  const mount = () => {
    act(() => {
      renderer = create(
        <LocaleProvider>
          <LanguagePicker />
          <Probe />
        </LocaleProvider>,
      );
    });
  };
  mount();
  const picker = renderer!.root.findByType("select");
  expect(picker.props.value).toBe("pt-BR");
  expect(picker.props["aria-label"]).toBe("Idioma");
  expect(html.lang).toBe("pt-BR");
  expect(renderer!.root.findByType("p").children).toEqual(["Boas-vindas"]);

  act(() => picker.props.onChange({ target: { value: "en" } }));
  expect(values.get(KEYS.locale)).toBe("en");
  expect(html.lang).toBe("en");
  expect(renderer!.root.findByType("p").children).toEqual(["Welcome"]);

  act(() => renderer?.unmount());
  mount();
  expect(renderer!.root.findByType("select").props.value).toBe("en");
  expect(html.lang).toBe("en");
});
