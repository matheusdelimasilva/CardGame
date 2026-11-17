/**
 * Pure functions from a RoomView to what the game screen draws. Nothing here
 * keeps state: the viewer's own, not yet sent placement is passed in.
 */
import type { GameView, RoomView } from "@cardgame/protocol";
import { seatLook } from "../ui/seats";
import type {
  GameModel,
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
): string | null {
  if (line.length === 0) return null;
  if (index <= 0) return `Before ${line[0]!.year}`;
  if (index >= line.length) return `After ${line.at(-1)!.year}`;
  return `Between ${line[index - 1]!.year} and ${line[index]!.year}`;
}

/** "Title, Artist, 1983." */
export function songLine(song: TurnSummary["song"]): string {
  return `${song.title}, ${song.artist}, ${song.year}.`;
}

/** Names joined for a sentence: "Mika", "Mika and Jon", "Mika, Jon and Priya". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)!}`;
}

/** A player of this game by id, as the table draws them. */
export function playerOf(model: GameModel, id: string): TablePlayer | null {
  if (model.me?.id === id) return model.me;
  return model.opponents.find((p) => p.id === id) ?? null;
}

/** "Mika placed a bet.", "Mika and Jon placed bets.", or null with no bets. */
function bettorsNote(model: GameModel, bets: readonly { player: string }[]) {
  if (bets.length === 0) return null;
  const names = bets.map((b) => playerOf(model, b.player)?.name ?? "Someone");
  return names.length === 1
    ? `${names[0]!} placed a bet.`
    : `${joinNames(names)} placed bets.`;
}

const sentence = (...parts: (string | null)[]) =>
  parts.filter(Boolean).join(" ");

function myTurnStatus(
  model: GameModel,
  stage: Extract<Stage, { kind: "placing" }>,
  placement: Placement | null,
  secondsLeft: number | null,
): StatusText {
  if (stage.locked)
    return {
      headline: "Locked in",
      sub: bettorsNote(model, stage.bets) ?? "",
      timer:
        secondsLeft === null
          ? "Opponents can still bet."
          : `Opponents can bet for ${secondsLeft}s.`,
    };
  const line = model.me ? timelineOf(model, model.me.id) : [];
  if (!placement)
    return {
      headline: "Your turn",
      sub:
        line.length === 0
          ? "Listen, then drag the card to start your timeline."
          : "Listen, then drag the card into your timeline.",
    };
  const where = describeGap(line, placement.index) ?? "Start your timeline";
  return placement.dragging
    ? { headline: where, sub: "Drop to place it." }
    : { headline: `${where}?`, sub: "Drag again to change your mind." };
}

/** The viewer's part in an opponent's turn, said before what the opponent is doing. */
function myBetNote(myBet: MyBet): string | null {
  switch (myBet.kind) {
    case "open":
      return "Tap a gap to bet they miss.";
    case "placed":
      return "Bet placed.";
    case "passed":
      return "You passed.";
    case "noTokens":
      return "No tokens left to bet.";
    case "none":
      return null;
  }
}

/** The headline already names the player, so the line under it does not repeat a long name. */
function opponentTurnStatus(
  model: GameModel,
  stage: Extract<Stage, { kind: "placing" }>,
  secondsLeft: number | null,
): StatusText {
  const player = model.active!;
  const note = myBetNote(model.myBet);
  if (stage.locked)
    return {
      headline: `${player.name} has placed`,
      sub: note ?? "",
      timer:
        secondsLeft === null
          ? "Bets close soon."
          : `Bets close in ${secondsLeft}s.`,
    };
  const headline = `${player.name}'s turn`;
  if (!player.connected)
    return {
      headline,
      sub: sentence(
        note,
        model.viewerIsHost
          ? "They're away. You can skip their turn."
          : "They're away. The host can skip their turn.",
      ),
    };
  // Everyone who could bet has bet or passed: the card is judged as soon as it is locked in.
  const allIn =
    stage.canBet.length === 0 && stage.bets.length + stage.declined.length > 0;
  const before = sentence(note, allIn ? "All bets are in." : null);
  return {
    headline,
    sub: before ? `${before} They're still choosing.` : "Still choosing.",
  };
}

/** What became of the viewer's own bet, if they made one and did not steal the card. */
function myBetResult(model: GameModel, turn: TurnSummary): string | null {
  const mine = turn.bets.find((b) => b.player === model.me?.id);
  if (mine?.result === "refunded") return "Your token comes back.";
  if (mine?.result === "lost") return "You lose your token.";
  return null;
}

function revealStatus(model: GameModel, turn: TurnSummary): StatusText {
  const song = songLine(turn.song);
  const mine = model.whose === "mine";
  const name = model.active?.name ?? "Someone";
  const result = myBetResult(model, turn);
  if (turn.thief) {
    const thief = playerOf(model, turn.thief);
    const won = timelineOf(model, turn.thief).length >= model.goal;
    return {
      headline: thief?.isMe
        ? "You steal it!"
        : `${thief?.name ?? "Someone"} steals it`,
      sub: sentence(
        song,
        won
          ? `That's ${model.goal} songs: ${thief?.isMe ? "you win!" : "they win!"}`
          : null,
        result,
      ),
    };
  }
  switch (turn.outcome) {
    case "correct":
      return mine
        ? { headline: "Nailed it!", sub: song }
        : { headline: `${name} got it`, sub: sentence(song, result) };
    case "wrong":
      return mine
        ? { headline: "Not quite", sub: `${song} The card is discarded.` }
        : { headline: `${name} missed`, sub: sentence(song, result) };
    case "passed":
      return mine
        ? {
            headline: "Turn skipped",
            sub: `You were away. ${song} The card is discarded.`,
          }
        : {
            headline: `${name} was skipped`,
            sub: sentence(song, "The card is discarded.", result),
          };
  }
}

function overStatus(model: GameModel): StatusText {
  const winners = model.winners;
  const first = winners[0];
  if (!first) return { headline: "Game over", sub: "The game has ended." };
  const count = timelineOf(model, first.id).length;
  const reachedGoal = count >= model.goal;
  if (winners.length > 1) {
    const names = winners.map((p) => (p.isMe ? "You" : p.name));
    // Only an empty deck ends a game with several winners.
    return {
      headline: "It's a tie!",
      sub: `The deck ran out. ${joinNames(names)} have ${count} songs each.`,
    };
  }
  if (first.isMe)
    return {
      headline: "You win!",
      sub: reachedGoal
        ? `${model.goal} songs in the right order.`
        : "The deck ran out and you have the most songs.",
    };
  return {
    headline: `${first.name} wins`,
    sub: reachedGoal
      ? `They reached ${model.goal} songs first.`
      : "The deck ran out and they have the most songs.",
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
): StatusText {
  const stage = model.stage;
  switch (stage.kind) {
    case "intro":
      return {
        headline: "Shuffling…",
        sub: "Dealing everyone a starting card.",
      };
    case "dealing":
      return { headline: "Dealing…", sub: "" };
    case "placing":
      return model.whose === "mine"
        ? myTurnStatus(model, stage, placement, secondsLeft)
        : opponentTurnStatus(model, stage, secondsLeft);
    case "revealing":
      return revealStatus(model, stage.turn);
    case "over":
      return overStatus(model);
  }
}

const ORDINALS = ["1ST", "2ND", "3RD", "4TH", "5TH", "6TH", "7TH", "8TH"];

/** "1ST" for rank 1, and so on. */
export function rankLabel(rank: number): string {
  return ORDINALS[rank - 1] ?? `${rank}TH`;
}

/**
 * Final scores: winners first, then by number of cards. Rows that tie on
 * both share a rank label; the viewer comes first among equals.
 */
export function ranking(model: GameModel): RankRow[] {
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
    return { ...row, rank: rankLabel(ahead + 1) };
  });
}
