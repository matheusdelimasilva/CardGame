import type { GameInfo, SettingValues } from "@cardgame/protocol";

/** Every setting at its default value. */
export const defaultsOf = (game: GameInfo): SettingValues =>
  Object.fromEntries(game.settings.map((s) => [s.id, s.default]));

/** One short line per setting, for showing a table's settings in the lobby. */
export function describeSettings(
  game: GameInfo,
  values: SettingValues,
): string[] {
  return game.settings.map((def) => {
    const value = values[def.id] ?? def.default;
    if (def.type === "toggle")
      return `${def.label}: ${value === true ? "on" : "off"}`;
    const label =
      def.options.find((o) => o.value === value)?.label ?? String(value);
    return `${def.label}: ${label.split(":")[0]}`;
  });
}
