import { useLocale } from "../i18n/locale";
import { SEAT_COUNT, type RoomView } from "@cardgame/protocol";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { navigate } from "../App";
import { localizedGame } from "../settings";
import { inert } from "../home/inert";
import { InviteButton } from "../ui/InviteButton";
import { PaperDialog } from "../ui/PaperDialog";
import { ANIMALS, CHIPS } from "../ui/seats";
import { TableHeader } from "../ui/TableHeader";
import type { Connection, useRoom } from "../useRoom";
import "./lobby.css";

const POSITIONS = [
  [50, 0, 0, -2],
  [78, 0, 0, 3],
  [100, 50, 2, -3],
  [78, 100, 0, 2],
  [50, 100, 0, -1],
  [22, 100, 0, 3],
  [0, 50, -2, 2],
  [22, 0, 0, -3],
] as const;

export function TableLobby({
  room,
  send,
  connection,
  error,
  children,
}: {
  room: RoomView;
  send: ReturnType<typeof useRoom>["send"];
  connection: Connection;
  error: string | null;
  children?: ReactNode;
}) {
  const { t, locale } = useLocale();
  const [dialog, setDialog] = useState<"help" | string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(leaveTimer.current), []);
  const { you } = room;
  const info = localizedGame(room.gameInfo, locale);
  const seated = room.seats.filter((seat) => seat !== null).length;
  const enough = seated >= info.minPlayers && seated <= info.maxPlayers;
  const online = connection === "open";
  const winners = room.game?.result?.winners.map(
    (id) =>
      room.seats.find((seat) => seat?.id === id)?.name ??
      t("Someone", "Alguém"),
  );
  const status = winners
    ? t(
        `${winners.join(" & ")} ${winners.length === 1 ? "wins" : "win"}!`,
        `${winners.join(" e ")} ${winners.length === 1 ? "venceu" : "venceram"}!`,
      )
    : you.seat === null
      ? t("Pick a seat", "Escolha um lugar")
      : !enough
        ? t("Waiting for players", "Aguardando jogadores")
        : t("Ready to start", "Pronto para começar");
  const count = t(
    `${seated} of ${SEAT_COUNT} seated.`,
    `${seated} de ${SEAT_COUNT} lugares ocupados.`,
  );
  const sub =
    you.seat === null
      ? t(
          `Flip any face-down card around the table. ${count}`,
          `Vire uma das cartas na mesa. ${count}`,
        )
      : !enough
        ? t(
            `Share the invite link. You need at least ${info.minPlayers} to start.`,
            `Compartilhe o convite. É preciso ter pelo menos ${info.minPlayers} jogadores para começar.`,
          )
        : `${count} ${you.isHost ? t("Friends can still join until you start.", "Seus amigos podem entrar até você começar.") : t("Waiting for the host to start.", "Aguardando o anfitrião iniciar a partida.")}`;
  const menuPlayer = room.seats.find((seat) => seat?.id === dialog);

  return (
    <main className={`table-lobby${leaving ? " tl-leaving" : ""}`}>
      <TableHeader
        code={room.code}
        gameName={info.name}
        watchers={room.spectators.flatMap((s) => (s.connected ? [s.name] : []))}
        onLeave={() => {
          setLeaving(true);
          leaveTimer.current = setTimeout(
            () => navigate("/"),
            matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 280,
          );
        }}
        actions={
          <>
            <button
              className="tl-button"
              onClick={() => setDialog("help")}
              aria-haspopup="dialog"
            >
              {t("Instructions", "Instruções")}
            </button>
            <InviteButton code={room.code} />
          </>
        }
      />

      {connection === "reconnecting" && (
        <div className="tl-connection" role="status">
          {t(
            "Connection lost. Reconnecting…",
            "Conexão perdida. Reconectando…",
          )}
        </div>
      )}

      <div className="tl-table">
        <div className="tl-rail" aria-hidden="true">
          <div className="tl-felt" />
        </div>
        <div className="tl-status" aria-live="polite">
          {winners && (
            <div className="tl-game-over">{t("GAME OVER", "FIM DE JOGO")}</div>
          )}
          <h1 key={status}>{status}</h1>
          <p>{sub}</p>
          <button
            className="tl-button tl-start"
            disabled={!you.isHost || !enough || !online}
            onClick={() => send({ type: "start" })}
          >
            {winners
              ? t("Play again", "Jogar de novo")
              : t("Start game", "Iniciar partida")}
          </button>
          {!you.isHost && (
            <span className="tl-host-hint">
              {t(
                "Only the host can start the game.",
                "Só o anfitrião pode iniciar a partida.",
              )}
            </span>
          )}
        </div>
        {room.seats.map((player, seat) => {
          const [x, y, offset, rotation] = POSITIONS[seat]!;
          const mine = player?.id === you.id;
          const canSit = !player && !!you.name && online;
          const canManage = !!player && (mine || you.isHost) && online;
          const [chip, edge] = CHIPS[seat % CHIPS.length]!;
          const style = {
            "--x": `${x}%`,
            "--y": `${y}%`,
            "--offset": offset,
            "--rotation": `${rotation}deg`,
            "--delay": `${150 + seat * 90}ms`,
            "--deal-x": `${(50 - x) * 0.84}em`,
            "--deal-y": `${(50 - y) * 0.32}em`,
            "--deal-rotation": `${seat * 50}deg`,
            "--chip": mine ? "#ffd84a" : chip,
            "--chip-edge": mine ? "#c9a52e" : edge,
          } as CSSProperties;
          return (
            <div
              className={`tl-seat-spot tl-seat-${seat}`}
              key={seat}
              style={style}
            >
              <div className="tl-seat-deal">
                <button
                  className={`tl-seat${player ? " occupied" : ""}${mine ? " mine" : ""}${player && !player.connected ? " away" : ""}`}
                  disabled={!canSit && !canManage}
                  aria-label={
                    player
                      ? mine
                        ? t("Stand up", "Levantar")
                        : `${player.name}${!player.connected ? t(", away", ", ausente") : ""}${canManage ? t(", player options", ", opções da pessoa") : t(" is seated", " está na mesa")}`
                      : t(
                          `Sit in seat ${seat + 1}`,
                          `Sentar no lugar ${seat + 1}`,
                        )
                  }
                  aria-haspopup={
                    player && !mine && canManage ? "dialog" : undefined
                  }
                  onClick={() => {
                    if (mine) send({ type: "stand" });
                    else if (canSit) send({ type: "sit", seat });
                    else if (canManage) setDialog(player!.id);
                  }}
                >
                  <span className="tl-seat-flip">
                    <span className="tl-card-back" aria-hidden="true">
                      <span>{ANIMALS[seat]}</span>
                    </span>
                    <span className="tl-card-front" aria-hidden="true">
                      <span className={`tl-suit${seat % 2 ? " red" : ""}`}>
                        {["♠", "♥", "♣", "♦"][seat % 4]}
                      </span>
                      <span className="tl-chip">{ANIMALS[seat]}</span>
                      <span className="tl-player-name">
                        {player?.name || "\u00a0"}
                      </span>
                      {player && !player.connected && (
                        <span className="tl-away-label">
                          {t("away", "ausente")}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {you.name && (
        <div className="tl-identity">
          <span
            style={{ background: you.seat === null ? "#d8d2bf" : "#ffd84a" }}
          >
            {you.seat === null ? "🃏" : ANIMALS[you.seat]}
          </span>
          <span className="tl-identity-name">{you.name}</span>
        </div>
      )}
      <SettingsDrawer info={info} settings={room.settings} />

      {dialog === "help" && (
        <PaperDialog
          title={t(`How to play ${info.name}`, `Como jogar ${info.name}`)}
          onClose={() => setDialog(null)}
        >
          {info.id === "hitster" ? (
            <ol className="tl-instructions">
              <li>
                <b>{t("Sit down.", "Sente-se.")}</b>
                {t(
                  " Flip a card to take a seat and pick your animal.",
                  " Vire uma carta para escolher seu lugar e seu animal.",
                )}
              </li>
              <li>
                <b>{t("Place a song.", "Posicione uma música.")}</b>
                {t(
                  " On your turn, listen to the mystery song and place it on your timeline where you think its release year fits.",
                  " Na sua vez, ouça a música misteriosa e coloque a carta na posição que você acha que corresponde ao ano de lançamento.",
                )}
              </li>
              <li>
                <b>{t("Check it.", "Confira.")}</b>
                {t(
                  " The year is revealed. Right spot: keep the card. Wrong spot: it is discarded.",
                  " O ano será revelado. Se acertar, você fica com a carta. Se errar, ela é descartada.",
                )}
              </li>
              <li>
                <b>{t("Win.", "Vença.")}</b>
                {t(
                  " First to collect the set number of cards wins.",
                  " Quem juntar primeiro a quantidade de cartas definida para a partida vence.",
                )}
              </li>
            </ol>
          ) : (
            <>
              <p>{info.description}</p>
              <p>
                {t(
                  `Flip a face-down card to take a seat. The host starts when at least ${info.minPlayers} players are seated.`,
                  `Vire uma carta para se sentar. O anfitrião começa a partida quando houver pelo menos ${info.minPlayers} jogadores na mesa.`,
                )}
              </p>
            </>
          )}
        </PaperDialog>
      )}
      {menuPlayer && (
        <PaperDialog title={menuPlayer.name} onClose={() => setDialog(null)}>
          <button
            className="tl-button tl-danger"
            onClick={() => {
              send({ type: "kick", playerId: menuPlayer.id });
              setDialog(null);
            }}
          >
            {t("Remove from table", "Remover da mesa")}
          </button>
        </PaperDialog>
      )}
      {children}
      {error && (
        <div className="toast" role="alert">
          {error}
        </div>
      )}
    </main>
  );
}

function SettingsDrawer({
  info,
  settings,
}: Pick<RoomView, "settings"> & { info: RoomView["gameInfo"] }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [peek, setPeek] = useState(false);
  const expanded = open || peek;
  const button = useRef<HTMLButtonElement>(null);
  return (
    <section
      className={`tl-settings${expanded ? " expanded" : ""}`}
      onMouseEnter={() => {
        if (matchMedia("(hover: hover) and (pointer: fine)").matches)
          setPeek(true);
      }}
      onMouseLeave={() => setPeek(false)}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
          setPeek(false);
          button.current?.focus();
        }
      }}
    >
      <h2>
        <button
          ref={button}
          className="tl-settings-toggle"
          aria-expanded={expanded}
          aria-controls="game-settings"
          onClick={() => {
            setPeek(false);
            setOpen(!open);
          }}
        >
          {t("Game settings", "Configurações da partida")}{" "}
          <span aria-hidden="true" />
        </button>
      </h2>
      <div
        id="game-settings"
        className="tl-settings-paper"
        role="region"
        aria-label={t("Game settings", "Configurações da partida")}
        {...inert(!expanded)}
        aria-hidden={!expanded}
      >
        {info.settings.length ? (
          info.settings.map((def) => {
            const value = settings[def.id] ?? def.default;
            const label =
              def.type === "toggle"
                ? value === true
                  ? t("On", "Ativado")
                  : t("Off", "Desativado")
                : (def.options
                    .find((option) => option.value === value)
                    ?.label.split(":")[0] ?? String(value));
            return (
              <dl className="tl-setting" key={def.id}>
                <dt>{def.label}</dt>
                <dd>{label}</dd>
              </dl>
            );
          })
        ) : (
          <p>
            {t(
              "No additional settings for this game.",
              "Este jogo não tem configurações adicionais.",
            )}
          </p>
        )}
      </div>
    </section>
  );
}
