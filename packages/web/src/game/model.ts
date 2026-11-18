import { translate, type Locale } from "../i18n/locale";
/**
 * Pure functions from a RoomView to what the game screen draws. Nothing here
 * keeps state: the viewer's own, not yet sent placement is passed in.
 */
import type { GameView, RoomView } from "@cardgame/protocol";
import { seatLook } from "../ui/seats";
import type {
  GameModel,
  GuessBadges,
  HitsterView,
  MyBet,
  Placement,
  RankRow,
  SongCardView,
  Stage,
  StatusText,
  TablePlayer,
  TurnSummary,
  Whose,
} from "./types";

/** The player with this id as the table draws them. Players who left their seat keep their name if the room still knows it. */
export function tablePlayer(room: RoomView, id: string): TablePlayer {
  const seat = room.seats.findIndex((s) => s?.id === id);
  const seated = seat >= 0 ? room.seats[seat]! : null;
  const isMe = id === room.you.id;
  return {
    id,
    name:
      seated?.name ??
      (isMe ? room.you.name : null) ??
      room.spectators.find((s) => s.id === id)?.name ??
      "Someone",
    seat: seated ? seat : null,
    ...seatLook(seated ? seat : null, isMe),
    connected:
      seated?.connected ??
      room.spectators.find((s) => s.id === id)?.connected ??
      isMe,
    isHost: seated?.isHost ?? false,
    isMe,
  };
}

/**
 * The viewer (when they play in this game) and everyone else in it,
 * clockwise from the seat after the viewer's. Without a seat the viewer
 * sees plain seat order; players with no seat come last, in turn order.
 */
export function seating(
  room: RoomView,
  players: readonly string[],
): { me: TablePlayer | null; opponents: TablePlayer[] } {
  const me = players.includes(room.you.id)
    ? tablePlayer(room, room.you.id)
    : null;
  const start = room.you.seat === null ? 0 : room.you.seat + 1;
  const seats = room.seats.length;
  const order = (p: TablePlayer) =>
    p.seat === null ? Infinity : (p.seat - start + seats) % seats;
  const opponents = players
    .filter((id) => id !== room.you.id)
    .map((id) => tablePlayer(room, id))
    .sort((a, b) => order(a) - order(b));
  return { me, opponents };
}

/** Which stage of play a Hitster view is in. */
export function stageOf(
  view: HitsterView,
  game: Pick<GameView, "result" | "pause">,
): Stage {
  const winners = game.result?.winners ?? view.winners;
  if (winners) return { kind: "over", winners };
  if (view.intro)
    return { kind: "intro", remainingMs: game.pause?.remainingMs ?? null };
  if (view.revealing && view.lastTurn)
    return { kind: "revealing", turn: view.lastTurn, next: view.nextPlayer };
  if (view.currentPlayer && view.current)
    return {
      kind: "placing",
      player: view.currentPlayer,
      song: view.current,
      locked: view.locked,
      lockedIndex: view.lockedIndex,
      bets: view.bets,
      declined: view.declined,
      canBet: view.canBet,
    };
  return { kind: "dealing" };
}

/** The player a stage is about, if any. */
export function stagePlayer(stage: Stage): string | null {
  switch (stage.kind) {
    case "placing":
      return stage.player;
    case "revealing":
      return stage.turn.player;
    default:
      return null;
  }
}

/** Whose turn a stage shows, from the viewer's side. */
export function whoseTurn(stage: Stage, meId: string | null): Whose {
  const player = stagePlayer(stage);
  if (player === null) return "nobody";
  return player === meId ? "mine" : "opponent";
}

/** The viewer's part in the betting of the turn in play. */
export function myBetOf(
  stage: Stage,
  meId: string | null,
  tokens: Record<string, number>,
): MyBet {
  if (meId === null || stage.kind !== "placing" || stage.player === meId)
    return { kind: "none" };
  const mine = stage.bets.find((b) => b.player === meId);
  if (mine) return { kind: "placed", index: mine.index ?? 0 };
  if (stage.declined.includes(meId)) return { kind: "passed" };
  if (stage.canBet.includes(meId)) return { kind: "open" };
  return (tokens[meId] ?? 0) < 1 ? { kind: "noTokens" } : { kind: "none" };
}

/** The Hitster game in a room, typed, or null when the room is not running one. */
export function hitsterGame(
  room: RoomView,
): (Omit<GameView, "view"> & { view: HitsterView }) | null {
  const game = room.game;
  if (!game || game.gameId !== "hitster") return null;
  return game as Omit<GameView, "view"> & { view: HitsterView };
}

/** Everything the game screen draws, or null when the room has no Hitster game. */
export function gameModel(room: RoomView): GameModel | null {
  const game = hitsterGame(room);
  if (!game) return null;
  const view = game.view;
  const { me, opponents } = seating(room, view.players);
  const everyone = me ? [me, ...opponents] : opponents;
  const byId = (id: string) =>
    everyone.find((p) => p.id === id) ?? tablePlayer(room, id);
  const stage = stageOf(view, game);
  const active = stagePlayer(stage);
  return {
    code: room.code,
    me,
    opponents,
    goal: view.cardsToWin,
    timelines: view.timelines,
    stage,
    whose: whoseTurn(stage, me?.id ?? null),
    active: active === null ? null : byId(active),
    lastTurn: view.lastTurn,
    winners: stage.kind === "over" ? stage.winners.map(byId) : [],
    deckCount: view.deckCount,
    turnNumber: view.turnNumber,
    pauseMs: game.pause?.remainingMs ?? null,
    timer: stage.kind === "placing" ? game.timer : null,
    viewerIsHost: room.you.isHost,
    tokens: view.tokens,
    myBet: myBetOf(stage, me?.id ?? null, view.tokens),
    guessing: view.guessing,
    yourGuess: view.yourGuess,
  };
}

/**
 * The chat's badges, for players of a game that guesses in the chat. Guesses
 * count only while a song is being placed; through its reveal the badges
 * keep what the viewer got of it, as the server does. Before the first song
 * and after the game there is nothing to guess, so there are none.
 */
export function guessBadges(model: GameModel): GuessBadges | null {
  const kind = model.stage.kind;
  if (
    !model.guessing ||
    !model.yourGuess ||
    kind === "intro" ||
    kind === "over"
  )
    return null;
  return {
    song: model.yourGuess.title,
    artist: model.yourGuess.artist,
    open: kind === "placing",
  };
}

/** Someone's timeline, empty if the view has none for them. */
export function timelineOf(model: GameModel, id: string): SongCardView[] {
  return model.timelines[id] ?? [];
}

/**
 * During a reveal, the revealed player's timeline without the revealed card,
 * and the gap the card was placed in (null for a skipped turn). A correct
 * card is already in the timeline the server sends, so it is taken out to be
 * drawn on its own.
 */
export function revealedPlacement(model: GameModel): {
  player: string;
  line: SongCardView[];
  placedAt: number | null;
} | null {
  if (model.stage.kind !== "revealing") return null;
  const { player, outcome, index } = model.stage.turn;
  const line = timelineOf(model, player);
  if (outcome === "passed" || index === undefined)
    return { player, line, placedAt: null };
  return {
    player,
    line:
      outcome === "correct" ? line.filter((_, i) => i !== index) : line.slice(),
    placedAt: index,
  };
}

/**
 * During a reveal with a thief, the stolen card: the server has already put
 * it in the thief's timeline, at `index`, so it is taken out until it has
 * flown there.
 */
export function stolenCard(model: GameModel): {
  thief: string;
  index: number;
  card: SongCardView;
} | null {
  if (model.stage.kind !== "revealing") return null;
  const { thief, song } = model.stage.turn;
  if (!thief) return null;
  const line = timelineOf(model, thief);
  const index = line.findIndex(
    (c) =>
      c.year === song.year &&
      c.title === song.title &&
      c.artist === song.artist,
  );
  return index < 0 ? null : { thief, index, card: line[index]! };
}

/** "Between 1976 and 1981", "Before 1976", "After 1981", or null for an empty timeline. */
export function describeGap(
  line: readonly { year: number }[],
  index: number,
  locale: Locale = "en",
): string | null {
  const t = translate.bind(null, locale);
  if (line.length === 0) return null;
  if (index <= 0)
    return t(`Before ${line[0]!.year}`, `Antes de ${line[0]!.year}`);
  if (index >= line.length)
    return t(`After ${line.at(-1)!.year}`, `Depois de ${line.at(-1)!.year}`);
  return t(
    `Between ${line[index - 1]!.year} and ${line[index]!.year}`,
    `Entre ${line[index - 1]!.year} e ${line[index]!.year}`,
  );
}

/** "Title, Artist, 1983." */
export function songLine(song: TurnSummary["song"]): string {
  return `${song.title}, ${song.artist}, ${song.year}.`;
}

/** Names joined for a sentence: "Mika", "Mika and Jon", "Mika, Jon and Priya". */
export function joinNames(
  names: readonly string[],
  locale: Locale = "en",
): string {
  const t = translate.bind(null, locale);
  if (names.length <= 1) return names[0] ?? "";
  return t(
    `${names.slice(0, -1).join(", ")} and ${names.at(-1)!}`,
    `${names.slice(0, -1).join(", ")} e ${names.at(-1)!}`,
  );
}

/** A player of this game by id, as the table draws them. */
export function playerOf(model: GameModel, id: string): TablePlayer | null {
  if (model.me?.id === id) return model.me;
  return model.opponents.find((p) => p.id === id) ?? null;
}

/** "Mika placed a bet.", "Mika and Jon placed bets.", or null with no bets. */
function bettorsNote(
  model: GameModel,
  bets: readonly { player: string }[],
  locale: Locale,
) {
  const t = translate.bind(null, locale);
  if (bets.length === 0) return null;
  const names = bets.map(
    (b) => playerOf(model, b.player)?.name ?? t("Someone", "Alguém"),
  );
  return names.length === 1
    ? t(`${names[0]!} placed a bet.`, `${names[0]!} fez uma aposta.`)
    : t(
        `${joinNames(names)} placed bets.`,
        `${joinNames(names, locale)} fizeram apostas.`,
      );
}

const sentence = (...parts: (string | null)[]) =>
  parts.filter(Boolean).join(" ");

function myTurnStatus(
  model: GameModel,
  stage: Extract<Stage, { kind: "placing" }>,
  placement: Placement | null,
  secondsLeft: number | null,
  locale: Locale,
): StatusText {
  const t = translate.bind(null, locale);
  if (stage.locked)
    return {
      headline: t("Locked in", "Posição confirmada"),
      sub: bettorsNote(model, stage.bets, locale) ?? "",
      timer:
        secondsLeft === null
          ? t("Opponents can still bet.", "Ainda é possível apostar.")
          : t(
              `Opponents can bet for ${secondsLeft}s.`,
              `Você pode receber apostas por mais ${secondsLeft}s.`,
            ),
    };
  const line = model.me ? timelineOf(model, model.me.id) : [];
  if (!placement)
    return {
      headline: t("Your turn", "Sua vez"),
      sub:
        line.length === 0
          ? t(
              "Listen, then drag the card to start your timeline.",
              "Ouça a música e arraste a carta para iniciar sua linha do tempo.",
            )
          : t(
              "Listen, then drag the card into your timeline.",
              "Ouça a música e arraste a carta para sua linha do tempo.",
            ),
    };
  const where =
    describeGap(line, placement.index, locale) ??
    t("Start your timeline", "Comece sua linha do tempo");
  return placement.dragging
    ? {
        headline: where,
        sub: t("Drop to place it.", "Solte a carta para posicioná-la."),
      }
    : {
        headline: `${where}?`,
        sub: t(
          "Drag again to change your mind.",
          "Arraste de novo para mudar a posição.",
        ),
      };
}

/** The viewer's part in an opponent's turn, said before what the opponent is doing. */
function myBetNote(myBet: MyBet, locale: Locale): string | null {
  const t = translate.bind(null, locale);
  switch (myBet.kind) {
    case "open":
      return t(
        "Tap a gap to bet they miss.",
        "Toque em um espaço para apostar que a pessoa vai errar.",
      );
    case "placed":
      return t("Bet placed.", "Aposta feita.");
    case "passed":
      return t("You passed.", "Você passou.");
    case "noTokens":
      return t("No tokens left to bet.", "Você está sem fichas para apostar.");
    case "none":
      return null;
  }
}

/** The headline already names the player, so the line under it does not repeat a long name. */
function opponentTurnStatus(
  model: GameModel,
  stage: Extract<Stage, { kind: "placing" }>,
  secondsLeft: number | null,
  locale: Locale,
): StatusText {
  const t = translate.bind(null, locale);
  const player = model.active!;
  const note = myBetNote(model.myBet, locale);
  if (stage.locked)
    return {
      headline: t(
        `${player.name} has placed`,
        `${player.name} posicionou a carta`,
      ),
      sub: note ?? "",
      timer:
        secondsLeft === null
          ? t("Bets close soon.", "As apostas encerram em breve.")
          : t(
              `Bets close in ${secondsLeft}s.`,
              `As apostas encerram em ${secondsLeft}s.`,
            ),
    };
  const headline = t(`${player.name}'s turn`, `Vez de ${player.name}`);
  if (!player.connected)
    return {
      headline,
      sub: sentence(
        note,
        model.viewerIsHost
          ? t(
              "They're away. You can skip their turn.",
              "Essa pessoa está ausente. Você pode pular a vez dela.",
            )
          : t(
              "They're away. The host can skip their turn.",
              "Essa pessoa está ausente. O anfitrião pode pular a vez dela.",
            ),
      ),
    };
  // Everyone who could bet has bet or passed: the card is judged as soon as it is locked in.
  const allIn =
    stage.canBet.length === 0 && stage.bets.length + stage.declined.length > 0;
  const before = sentence(
    note,
    allIn ? t("All bets are in.", "Todas as apostas foram feitas.") : null,
  );
  return {
    headline,
    sub: before
      ? t(
          `${before} They're still choosing.`,
          `${before} A posição ainda está sendo escolhida.`,
        )
      : t("Still choosing.", "Ainda escolhendo a posição."),
  };
}

/** What became of the viewer's own bet, if they made one and did not steal the card. */
function myBetResult(
  model: GameModel,
  turn: TurnSummary,
  locale: Locale,
): string | null {
  const t = translate.bind(null, locale);
  const mine = turn.bets.find((b) => b.player === model.me?.id);
  if (mine?.result === "refunded")
    return t("Your token comes back.", "Você recupera sua ficha.");
  if (mine?.result === "lost")
    return t("You lose your token.", "Você perde sua ficha.");
  return null;
}

function revealStatus(
  model: GameModel,
  turn: TurnSummary,
  locale: Locale,
): StatusText {
  const t = translate.bind(null, locale);
  const song = songLine(turn.song);
  const mine = model.whose === "mine";
  const name = model.active?.name ?? t("Someone", "Alguém");
  const result = myBetResult(model, turn, locale);
  if (turn.thief) {
    const thief = playerOf(model, turn.thief);
    const won = timelineOf(model, turn.thief).length >= model.goal;
    return {
      headline: thief?.isMe
        ? t("You steal it!", "Você roubou a carta!")
        : t(
            `${thief?.name ?? "Someone"} steals it`,
            `${thief?.name ?? "Alguém"} roubou a carta`,
          ),
      sub: sentence(
        song,
        won
          ? t(
              `That's ${model.goal} songs: ${thief?.isMe ? "you win!" : "they win!"}`,
              `${model.goal} músicas: ${thief?.isMe ? "você venceu!" : "vitória de " + (thief?.name ?? "quem fez a aposta") + "!"}`,
            )
          : null,
        result,
      ),
    };
  }
  switch (turn.outcome) {
    case "correct":
      return mine
        ? { headline: t("Nailed it!", "Você acertou!"), sub: song }
        : {
            headline: t(`${name} got it`, `${name} acertou`),
            sub: sentence(song, result),
          };
    case "wrong":
      return mine
        ? {
            headline: t("Not quite", "Você errou"),
            sub: t(
              `${song} The card is discarded.`,
              `${song} A carta foi descartada.`,
            ),
          }
        : {
            headline: t(`${name} missed`, `${name} errou`),
            sub: sentence(song, result),
          };
    case "passed":
      return mine
        ? {
            headline: t("Turn skipped", "Vez pulada"),
            sub: t(
              `You were away. ${song} The card is discarded.`,
              `Você estava ausente. ${song} A carta foi descartada.`,
            ),
          }
        : {
            headline: t(`${name} was skipped`, `A vez de ${name} foi pulada`),
            sub: sentence(
              song,
              t("The card is discarded.", "A carta foi descartada."),
              result,
            ),
          };
  }
}

function overStatus(model: GameModel, locale: Locale): StatusText {
  const t = translate.bind(null, locale);
  const winners = model.winners;
  const first = winners[0];
  if (!first)
    return {
      headline: t("Game over", "Fim de jogo"),
      sub: t("The game has ended.", "A partida terminou."),
    };
  const count = timelineOf(model, first.id).length;
  const reachedGoal = count >= model.goal;
  if (winners.length > 1) {
    const names = winners.map((p) => (p.isMe ? t("You", "Você") : p.name));
    // Only an empty deck ends a game with several winners.
    return {
      headline: t("It's a tie!", "Empate!"),
      sub: t(
        `The deck ran out. ${joinNames(names)} have ${count} songs each.`,
        `O baralho acabou. ${joinNames(names, locale)} têm ${count} ${count === 1 ? "música cada" : "músicas cada"}.`,
      ),
    };
  }
  if (first.isMe)
    return {
      headline: t("You win!", "Você venceu!"),
      sub: reachedGoal
        ? t(
            `${model.goal} songs in the right order.`,
            `${model.goal} músicas na ordem certa.`,
          )
        : t(
            "The deck ran out and you have the most songs.",
            "O baralho acabou e você tem mais músicas.",
          ),
    };
  return {
    headline: t(`${first.name} wins`, `${first.name} venceu`),
    sub: reachedGoal
      ? t(
          `They reached ${model.goal} songs first.`,
          `Chegou a ${model.goal} músicas primeiro.`,
        )
      : t(
          "The deck ran out and they have the most songs.",
          "O baralho acabou e essa pessoa tem mais músicas.",
        ),
  };
}

/**
 * The status headline and the line under it. `placement` is the viewer's
 * local choice on their own turn (ignored otherwise); `secondsLeft` is the
 * betting window's countdown, ticking on the client.
 */
export function statusText(
  model: GameModel,
  placement: Placement | null = null,
  secondsLeft: number | null = null,
  locale: Locale = "en",
): StatusText {
  const t = translate.bind(null, locale);
  const stage = model.stage;
  switch (stage.kind) {
    case "intro":
      return {
        headline: t("Shuffling…", "Embaralhando…"),
        sub: t(
          "Dealing everyone a starting card.",
          "Distribuindo uma carta inicial para cada pessoa.",
        ),
      };
    case "dealing":
      return { headline: t("Dealing…", "Distribuindo…"), sub: "" };
    case "placing":
      return model.whose === "mine"
        ? myTurnStatus(model, stage, placement, secondsLeft, locale)
        : opponentTurnStatus(model, stage, secondsLeft, locale);
    case "revealing":
      return revealStatus(model, stage.turn, locale);
    case "over":
      return overStatus(model, locale);
  }
}

const ORDINALS = ["1ST", "2ND", "3RD", "4TH", "5TH", "6TH", "7TH", "8TH"];

/** "1ST" for rank 1, and so on. */
export function rankLabel(rank: number, locale: Locale = "en"): string {
  return translate(locale, ORDINALS[rank - 1] ?? `${rank}TH`, `${rank}º`);
}

/**
 * Final scores: winners first, then by number of cards. Rows that tie on
 * both share a rank label; the viewer comes first among equals.
 */
export function ranking(model: GameModel, locale: Locale = "en"): RankRow[] {
  const winners = new Set(model.winners.map((p) => p.id));
  const everyone = model.me ? [model.me, ...model.opponents] : model.opponents;
  const rows = everyone
    .map((player) => ({
      player,
      count: timelineOf(model, player.id).length,
      winner: winners.has(player.id),
      isMe: player.isMe,
    }))
    .sort((a, b) => Number(b.winner) - Number(a.winner) || b.count - a.count);
  return rows.map((row) => {
    const ahead = rows.filter(
      (o) =>
        Number(o.winner) > Number(row.winner) ||
        (o.winner === row.winner && o.count > row.count),
    ).length;
    return { ...row, rank: rankLabel(ahead + 1, locale) };
  });
}
