// Types only: the song list (with its years) must never be bundled into the client.
import type { HitsterView, SongCardView } from "@cardgame/games";
import type { GameView } from "@cardgame/protocol";
import { useEffect, useState } from "react";
import type { GameProps, GameUI } from "./types";

const viewOf = (game: GameView) => game.view as HitsterView;

/** A song card in a timeline. Placeholder look until the real card designs are in. */
function SongCard({ song, fresh }: { song: SongCardView; fresh?: boolean }) {
  return (
    <span className={`song-card decade-${Math.floor(song.year / 10) % 7}${fresh ? " fresh" : ""}`}>
      <span className="song-year">{song.year}</span>
      <span className="song-title">{song.title}</span>
      <span className="song-artist">{song.artist}</span>
    </span>
  );
}

/** Words for a position in a timeline: "before 1984", "between 1984 and 1991", "after 1991". */
function describeSpot(line: SongCardView[], index: number): string {
  if (line.length === 0) return "here";
  if (index === 0) return `before ${line[0]!.year}`;
  if (index === line.length) return `after ${line.at(-1)!.year}`;
  return `between ${line[index - 1]!.year} and ${line[index]!.year}`;
}

function Dock({ game, you, nameOf, move }: GameProps) {
  const view = viewOf(game);
  const [selected, setSelected] = useState<number | null>(null);
  // A choice made for one song must not carry over to the next.
  useEffect(() => setSelected(null), [view.turnNumber]);
  if (!you) return null;

  const line = view.timelines[you] ?? [];
  const myTurn = view.currentPlayer === you;
  const justWon = view.lastTurn?.player === you && view.lastTurn.outcome === "correct" ? view.lastTurn.song : null;

  const spot = (index: number) =>
    myTurn && (
      <button
        key={`spot-${index}`}
        className={`spot${selected === index ? " chosen" : ""}`}
        onClick={() => setSelected(selected === index ? null : index)}
        aria-pressed={selected === index}
        aria-label={`Place the song ${describeSpot(line, index)}`}
      >
        {selected === index ? "♪" : "+"}
      </button>
    );

  return (
    <div className="hitster-dock">
      <div className="hitster-bar">
        <p className="actions-status">
          {myTurn
            ? selected === null
              ? "Tap a + to choose where this song goes."
              : `Placing it ${describeSpot(line, selected)}.`
            : view.currentPlayer
              ? `${nameOf(view.currentPlayer)} is placing a song.`
              : ""}
        </p>
        <button
          className="btn gold"
          disabled={!myTurn || selected === null}
          onClick={() => selected !== null && move({ type: "place", index: selected })}
        >
          Place
        </button>
      </div>
      <div className="timeline" role="list" aria-label="Your timeline, oldest first">
        {line.map((song, i) => (
          <span className="timeline-item" role="listitem" key={song.id}>
            {spot(i)}
            <SongCard song={song} fresh={justWon !== null && justWon.title === song.title && justWon.artist === song.artist} />
          </span>
        ))}
        {spot(line.length)}
      </div>
    </div>
  );
}

export const hitsterUI: GameUI = {
  Center({ game, you, nameOf }) {
    const view = viewOf(game);
    const player = view.currentPlayer;
    if (!view.current || !player) return null;
    const theirLine = player !== you ? (view.timelines[player] ?? []) : null;
    return (
      <div className="center-game">
        <div className="now-playing">
          <span className="now-label">♪ now playing for {player === you ? "you" : nameOf(player)}</span>
          {view.current.title ? (
            <>
              <span className="now-title">{view.current.title}</span>
              <span className="now-artist">{view.current.artist}</span>
            </>
          ) : (
            <span className="now-title">Listen...</span>
          )}
          <span className="now-year">year ????</span>
        </div>
        {theirLine && (
          <div className="year-chips" aria-label={`${nameOf(player)}'s timeline`}>
            {theirLine.map((song) => (
              <span className="year-chip" key={song.id}>
                {song.year}
              </span>
            ))}
          </div>
        )}
        <div className="center-note">
          deck {view.deckCount} · first to {view.cardsToWin}
        </div>
      </div>
    );
  },

  SeatCards({ game, playerId }) {
    const count = viewOf(game).timelines[playerId]?.length ?? 0;
    return (
      <span className="song-stack" aria-label={`${count} cards`}>
        {count}
      </span>
    );
  },

  seatTag(game, playerId) {
    const view = viewOf(game);
    return `♪ ${view.timelines[playerId]?.length ?? 0}/${view.cardsToWin}`;
  },

  Dock,

  announcement(game, nameOf) {
    const last = viewOf(game).lastTurn;
    if (!last) return null;
    const who = nameOf(last.player);
    return {
      key: `turn-${last.turnNumber}`,
      title: last.outcome === "correct" ? `${who} got it!` : last.outcome === "wrong" ? `${who} missed` : `${who} was skipped`,
      detail: `${last.song.title} · ${last.song.artist} · ${last.song.year}`,
    };
  },
};
