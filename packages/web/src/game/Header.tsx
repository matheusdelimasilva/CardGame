import { useLocale } from "../i18n/locale";
import { InviteButton } from "../ui/InviteButton";
import { TableHeader } from "../ui/TableHeader";
import "./overlays.css";

/** The sound switch. The name stays "Sound" so the pressed state is what changes, not the label read out. */
export function SoundToggle({
  on,
  onToggle,
}: {
  on: boolean;
  onToggle: () => void;
}) {
  const { t } = useLocale();
  return (
    <button
      className="tl-button gs-sound"
      aria-label={t("Sound", "Som")}
      aria-pressed={on}
      onClick={onToggle}
    >
      {on ? t("Sound on", "Som ligado") : t("Sound off", "Som desligado")}
    </button>
  );
}

/** The game screen's header: the lobby's, with a sound switch and the round's instructions. */
export function GameHeader({
  code,
  gameName,
  watchers,
  soundOn,
  withSound = true,
  onLeave,
  onToggleSound,
  onInstructions,
}: {
  code: string;
  gameName: string;
  /** Names of the people watching. */
  watchers: readonly string[];
  soundOn: boolean;
  /** False when the stage keeps the sound switch elsewhere (StageLayout.tools). */
  withSound?: boolean;
  onLeave: () => void;
  onToggleSound: () => void;
  onInstructions: () => void;
}) {
  const { t } = useLocale();
  return (
    <TableHeader
      className="gs-header"
      code={code}
      gameName={gameName}
      watchers={watchers}
      onLeave={onLeave}
      withLanguage={withSound}
      actions={
        <>
          {withSound && <SoundToggle on={soundOn} onToggle={onToggleSound} />}
          <button
            className="tl-button tl-gold gs-help"
            aria-haspopup="dialog"
            aria-label={t("Instructions", "Instruções")}
            onClick={onInstructions}
          >
            {t("Instructions", "Instruções")}
          </button>
          <InviteButton code={code} />
        </>
      }
    />
  );
}
