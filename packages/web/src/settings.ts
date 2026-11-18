import type { GameInfo, SettingValues } from "@cardgame/protocol";
import { translate, type Locale } from "./i18n/locale";

/** Every setting at its default value. */
export const defaultsOf = (game: GameInfo): SettingValues =>
  Object.fromEntries(game.settings.map((s) => [s.id, s.default]));

const hitsterSettings: Record<
  string,
  { label: string; description?: string; options?: Record<string, string> }
> = {
  songList: {
    label: "Lista de músicas",
    options: { international: "Internacional", brasil: "Brasil" },
  },
  cardsToWin: {
    label: "Cartas para vencer",
    description:
      "Quem atingir primeiro essa quantidade de músicas na linha do tempo vence.",
    options: { "5": "5: partida rápida", "10": "10: partida clássica" },
  },
  guessInChat: {
    label: "Palpites no chat",
    description:
      "Digite o nome da música e do artista no chat. Acerte os dois para ganhar uma ficha.",
  },
  showSongInfo: {
    label: "Mostrar título e artista",
    description:
      "Mostra o nome da música enquanto ela toca. Facilita a partida e permite jogar sem som.",
  },
};

export function localizedGame(game: GameInfo, locale: Locale): GameInfo {
  if (locale !== "pt-BR" || game.id !== "hitster") return game;
  return {
    ...game,
    description:
      "Ouça uma música e coloque-a na sua linha do tempo pelo ano de lançamento. Quem completar a linha primeiro vence.",
    settings: game.settings.map((def) => {
      const copy = hitsterSettings[def.id];
      if (!copy) return def;
      const text = {
        label: copy.label,
        description: copy.description ?? def.description,
      };
      if (def.type === "toggle") return { ...def, ...text };
      return {
        ...def,
        ...text,
        options: def.options.map((option) => ({
          ...option,
          label: copy.options?.[option.value] ?? option.label,
        })),
      };
    }),
  };
}

/** One short line per setting, for showing a table's settings in the lobby. */
export function describeSettings(
  game: GameInfo,
  values: SettingValues,
  locale: Locale = "en",
): string[] {
  return localizedGame(game, locale).settings.map((def) => {
    const value = values[def.id] ?? def.default;
    if (def.type === "toggle")
      return `${def.label}: ${value === true ? translate(locale, "on", "ativado") : translate(locale, "off", "desativado")}`;
    const label =
      def.options.find((o) => o.value === value)?.label ?? String(value);
    return `${def.label}: ${label.split(":")[0]}`;
  });
}
