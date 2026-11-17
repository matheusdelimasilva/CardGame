import { InviteButton } from "../ui/InviteButton";
import { TableHeader } from "../ui/TableHeader";
import "./overlays.css";

/** The game screen's header: the lobby's, with a sound switch and the round's instructions. */
export function GameHeader({
  code,
  gameName,
  watchers,
  soundOn,
  onLeave,
  onToggleSound,
  onInstructions,
}: {
  code: string;
  gameName: string;
  /** Names of the people watching. */
  watchers: readonly string[];
  soundOn: boolean;
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
          {/* The name stays "Sound" so the pressed state is what changes, not the label read out. */}
          <button
            className="tl-button"
            aria-label="Sound"
            aria-pressed={soundOn}
            onClick={onToggleSound}
          >
            {soundOn ? "Sound on" : "Sound off"}
          </button>
          <button
            className="tl-button tl-gold"
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
