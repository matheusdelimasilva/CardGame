import { useLocale } from "./i18n/locale";
import { MAX_NAME_LENGTH, type RoomView } from "@cardgame/protocol";
import { useState, type FormEvent } from "react";
import { navigate } from "./App";
import { useTrackAudio } from "./audio";
import { GameScreen } from "./game/GameScreen";
import { TableLobby } from "./lobby/TableLobby";
import { KEYS, storage } from "./storage";
import { LanguagePicker } from "./ui/LanguagePicker";
import { useRoom } from "./useRoom";

/**
 * Which screen a table shows. A running game is always played on the game
 * screen. A finished one stays there (final scores) only for a viewer who
 * watched it run in this page and has not gone back to the lobby; anyone
 * arriving later goes straight to the lobby, which names the winner.
 */
export function roomScreen(room: RoomView, watched: boolean): "lobby" | "game" {
  const game = room.game;
  if (!game || game.gameId !== "hitster") return "lobby";
  if (game.result === null) return "game";
  return watched ? "game" : "lobby";
}

export function Room({ code }: { code: string }) {
  const { t } = useLocale();
  const { room, connection, error, send, chats } = useRoom(code);
  // Whether this page saw the current game running; "Back to lobby" clears it.
  const [watched, setWatched] = useState(false);
  const running = !!room?.game && room.game.result === null;
  if (running && !watched) setWatched(true);
  const audio = useTrackAudio(
    running ? (room!.game!.track?.url ?? null) : null,
  );

  if (connection === "gone") {
    return (
      <Notice
        title={t("Table not found", "Mesa não encontrada")}
        text={t(
          "This table has closed or the link is wrong.",
          "Esta mesa foi fechada ou o link está incorreto.",
        )}
      />
    );
  }
  if (connection === "kicked") {
    return (
      <Notice
        title={t("Removed", "Você não está mais na mesa")}
        text={t(
          "The host removed you from this table.",
          "O anfitrião removeu você desta mesa.",
        )}
      />
    );
  }
  if (!room)
    return (
      <Notice
        title={t("Joining table...", "Entrando na mesa...")}
        text={code}
        quiet
      />
    );

  const namePrompt = !room.you.name && (
    <NamePrompt onSubmit={(name) => send({ type: "setName", name })} />
  );
  if (roomScreen(room, watched) === "lobby")
    return (
      <TableLobby room={room} send={send} connection={connection} error={error}>
        {namePrompt}
      </TableLobby>
    );
  return (
    <GameScreen
      room={room}
      connection={connection}
      error={error}
      chats={chats}
      send={send}
      audio={audio}
      onLeave={() => navigate("/")}
      onBackToLobby={() => setWatched(false)}
    >
      {namePrompt}
    </GameScreen>
  );
}

function NamePrompt({ onSubmit }: { onSubmit: (name: string) => void }) {
  const { t } = useLocale();
  const [name, setName] = useState(storage.get(KEYS.name) ?? "");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) return;
    storage.set(KEYS.name, clean);
    onSubmit(clean);
  };
  return (
    <div className="overlay">
      <form className="modal" onSubmit={submit}>
        <h2>{t("What's your name?", "Qual é seu nome?")}</h2>
        <p className="muted">
          {t(
            "This is how the others see you at the table.",
            "Esse é o nome que os outros verão na mesa.",
          )}
        </p>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={MAX_NAME_LENGTH}
          placeholder={t("Nickname", "Apelido")}
          aria-label={t("Nickname", "Apelido")}
          autoFocus
        />
        <button className="btn gold big" disabled={!name.trim()}>
          {t("Join table", "Entrar na mesa")}
        </button>
        <LanguagePicker compact />
      </form>
    </div>
  );
}

function Notice({
  title,
  text,
  quiet,
}: {
  title: string;
  text: string;
  quiet?: boolean;
}) {
  const { t } = useLocale();
  return (
    <main className="home">
      <section className="panel notice">
        <h2>{title}</h2>
        <p className="muted">{text}</p>
        <LanguagePicker compact />
        {!quiet && (
          <button className="btn gold" onClick={() => navigate("/")}>
            {t("Back to start", "Voltar ao início")}
          </button>
        )}
      </section>
    </main>
  );
}
