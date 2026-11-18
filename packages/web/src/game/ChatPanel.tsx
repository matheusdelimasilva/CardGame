import { useLocale, translate, type Locale } from "../i18n/locale";
import { MAX_CHAT_LENGTH } from "@cardgame/protocol";
import {
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type UIEvent,
} from "react";
import type { ChatEntry } from "../useRoom";
import "./chat.css";
import type { GuessBadges } from "./types";

export type { GuessBadges };

/**
 * One row of the chat log. `system` is public game news ("Mika guessed the
 * song correctly."); `notice` is a private note to the viewer only.
 */
export type ChatLine =
  | { id: string; kind: "message"; name: string; text: string }
  | { id: string; kind: "system"; text: string }
  | { id: string; kind: "notice"; text: string };

export interface ChatPanelProps {
  lines: readonly ChatLine[];
  canSend: boolean;
  /** The viewer has chosen a name; without one they can read but not chat. */
  named: boolean;
  onSend: (text: string) => void;
  /** Present only for a player while guessing in the chat is part of the game. */
  badges?: GuessBadges | null;
}

/** The history as the log draws it. */
export function chatLines(
  entries: readonly ChatEntry[],
  locale: Locale = "en",
): ChatLine[] {
  return entries.map((e) => {
    if (e.kind === "notice" || e.kind === "system")
      return {
        id: e.id,
        kind: e.kind,
        text: translate(locale, e.text, e.textPtBR ?? e.text),
      };
    return { id: e.id, kind: "message", name: e.from.name, text: e.text };
  });
}

/** The design's first line of the chat when the table guesses in it. */
export const GUESS_HINT =
  "Type the song and the artist here. Get both for a token.";

/**
 * The log with the guessing hint as a table line, written by this page, not
 * the server: after the line with id `after` (the newest when the game
 * began), or at the top when that line is gone or there was none.
 */
export function withGuessHint(
  lines: readonly ChatLine[],
  after: string | null,
  locale: Locale = "en",
): ChatLine[] {
  const at = lines.findIndex((l) => l.id === after) + 1;
  return [
    ...lines.slice(0, at),
    {
      id: "guess-hint",
      kind: "system",
      text: translate(
        locale,
        GUESS_HINT,
        "Digite aqui o nome da música e do artista. Acerte os dois para ganhar uma ficha.",
      ),
    },
    ...lines.slice(at),
  ];
}

/** Slack, in pixels, within which the log still counts as scrolled to the end. */
const BOTTOM_SLACK = 24;

function placeholder(
  named: boolean,
  canSend: boolean,
  guessing: boolean,
  t: ReturnType<typeof useLocale>["t"],
): string {
  if (!named)
    return t("Choose a name to chat", "Escolha um nome para conversar");
  if (!canSend) return t("Reconnecting...", "Reconectando...");
  return guessing
    ? t("Guess or chat…", "Dê um palpite ou converse…")
    : t("Say something…", "Diga algo…");
}

function Badge({
  label,
  guessed,
  open,
}: {
  label: "Song" | "Artist";
  guessed: boolean;
  open: boolean;
}) {
  const { t } = useLocale();
  const missed = open ? "not guessed yet" : "not guessed";
  const song = label === "Song";
  const localizedLabel = song ? t("Song", "Música") : t("Artist", "Artista");
  const status = guessed
    ? song
      ? "Música identificada"
      : "Artista identificado"
    : song
      ? "Música não identificada"
      : "Artista não identificado";
  return (
    <span
      className={guessed ? "gs-chat-badge gs-chat-badge-got" : "gs-chat-badge"}
      aria-label={t(
        `${label} ${guessed ? "guessed" : missed}`,
        !guessed && open ? `${status} ainda` : status,
      )}
    >
      {localizedLabel.toUpperCase()}
    </span>
  );
}

function Line({ line }: { line: ChatLine }) {
  if (line.kind === "message") {
    return (
      <div className="gs-chat-line">
        <span className="gs-chat-name">{line.name}: </span>
        {line.text}
      </div>
    );
  }
  return <div className={`gs-chat-line gs-chat-${line.kind}`}>{line.text}</div>;
}

/** The chat card. Fills the box its parent gives it; the parent places and tilts it. */
export function ChatPanel({
  lines,
  canSend,
  named,
  onSend,
  badges,
}: ChatPanelProps) {
  const { t } = useLocale();
  const [text, setText] = useState("");
  const log = useRef<HTMLDivElement>(null);
  // Follow new lines only while the reader is at the end of the log.
  const pinned = useRef(true);

  useLayoutEffect(() => {
    const el = log.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    pinned.current =
      el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_SLACK;
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!canSend || !trimmed) return;
    onSend(trimmed);
    setText("");
    // Your own line should always be visible.
    pinned.current = true;
  };

  return (
    <section className="gs-chat" aria-label={t("Table chat", "Chat da mesa")}>
      <div className="gs-chat-head">
        <h2 className="gs-chat-title">Chat</h2>
        {badges && (
          <>
            <Badge label="Song" guessed={badges.song} open={badges.open} />
            <Badge label="Artist" guessed={badges.artist} open={badges.open} />
          </>
        )}
      </div>
      <div
        className="gs-chat-log"
        role="log"
        aria-live="polite"
        ref={log}
        onScroll={onScroll}
      >
        {lines.length === 0 ? (
          <div className="gs-chat-empty">
            {t("No messages yet.", "Nenhuma mensagem ainda.")}
          </div>
        ) : (
          lines.map((line) => <Line key={line.id} line={line} />)
        )}
      </div>
      <form className="gs-chat-form" onSubmit={submit}>
        <input
          className="gs-chat-input"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX_CHAT_LENGTH}
          disabled={!canSend}
          placeholder={placeholder(named, canSend, badges?.open ?? false, t)}
          aria-label={t("Chat message", "Mensagem do chat")}
          autoComplete="off"
        />
        <button
          className="gs-chat-send"
          type="submit"
          disabled={!canSend || !text.trim()}
        >
          {t("Send", "Enviar")}
        </button>
      </form>
    </section>
  );
}
