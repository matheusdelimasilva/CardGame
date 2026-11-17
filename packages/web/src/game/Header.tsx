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
  return (
    <button
      className="tl-button gs-sound"
      aria-label="Sound"
      aria-pressed={on}
      onClick={onToggle}
    >
      {on ? "Sound on" : "Sound off"}
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
  return (
    <TableHeader
      className="gs-header"
      code={code}
      gameName={gameName}
      watchers={watchers}
      onLeave={onLeave}
      actions={
        <>
          {withSound && <SoundToggle on={soundOn} onToggle={onToggleSound} />}
          <button
            className="tl-button tl-gold gs-help"
            aria-haspopup="dialog"
            onClick={onInstructions}
          >
            Instructions
          </button>
          <InviteButton code={code} />
        </>
      }
    />
  );
}
