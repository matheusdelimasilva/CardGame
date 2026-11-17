/** Every card and piece of table furniture from game/cards.tsx, in every state. */
import { useState, type CSSProperties, type ReactNode } from "react";
import {
  Deck,
  MePlate,
  MiniCard,
  MysteryCard,
  Pips,
  SeatCard,
  SongBack,
  SongCard,
  type SongFace,
} from "../cards";
import { opponentSpots } from "../layout";
import { gameModel, timelineOf } from "../model";
import type { TablePlayer } from "../types";
import type { GalleryContext, GallerySection } from "./types";

/** One song per decade, short and long titles, solo and featured artists. */
const DECADE_SONGS: SongFace[] = [
  { title: "Johnny B. Goode", artist: "Chuck Berry", year: 1958 },
  {
    title: "(I Can't Get No) Satisfaction",
    artist: "The Rolling Stones",
    year: 1965,
  },
  { title: "Dancing Queen", artist: "ABBA", year: 1976 },
  {
    title: "I Wanna Dance with Somebody (Who Loves Me)",
    artist: "Whitney Houston",
    year: 1987,
  },
  { title: "Wonderwall", artist: "Oasis", year: 1995 },
  { title: "Crazy in Love", artist: "Beyoncé featuring Jay-Z", year: 2003 },
  {
    title: "Uptown Funk",
    artist: "Mark Ronson featuring Bruno Mars",
    year: 2014,
  },
  { title: "As It Was", artist: "Harry Styles", year: 2022 },
];
/** Stress cases beyond the fixtures: one unbreakable word, a very long title and artist. */
const EXTREMES: SongFace[] = [
  {
    title: "Supercalifragilisticexpialidocious",
    artist: "Julie Andrews",
    year: 1964,
  },
  {
    title: "The Girl Is Mine (Single Version with Extended Ending)",
    artist: "Michael Jackson featuring Paul McCartney and Friends",
    year: 1982,
  },
  { title: "Hey Ya!", artist: "OutKast", year: 2003 },
];
const SPOT_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8];
const TILTS = [-3, 2, -2, 3, -1];

const page: CSSProperties = {
  position: "absolute",
  inset: 0,
  overflow: "auto",
  padding: "calc(var(--u) * 3) calc(var(--u) * 4) calc(var(--u) * 8)",
  color: "#fffaf0",
  userSelect: "text",
};
const heading: CSSProperties = {
  margin: "calc(var(--u) * 3) 0 calc(var(--u) * 1.4)",
  font: "800 calc(var(--u) * 2) / 1 Rubik, sans-serif",
};
const row: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "flex-end",
  gap: "calc(var(--u) * 3) calc(var(--u) * 2.4)",
};
const captionStyle: CSSProperties = {
  font: "400 calc(var(--u) * 1.3) / 1.2 var(--mono)",
  letterSpacing: "0.04em",
  maxWidth: "calc(var(--u) * 14)",
  textAlign: "center",
};

function Item({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <figure
      style={{
        margin: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "calc(var(--u) * 1.4)",
      }}
    >
      {children}
      <figcaption style={captionStyle}>{caption}</figcaption>
    </figure>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 style={heading}>{title}</h2>
      <div style={row}>{children}</div>
    </section>
  );
}

/** A stand-in player for when the scenario has fewer opponents than a row needs. */
function stub(base: TablePlayer, name: string): TablePlayer {
  return { ...base, id: `stub-${name}`, name };
}

function CardsGallery({ context }: { context: GalleryContext }) {
  const model = gameModel(context.room);
  const [revealed, setRevealed] = useState(false);
  const [lastMenu, setLastMenu] = useState<string | null>(null);
  if (!model) return <p>This scenario has no game.</p>;
  const goal = model.goal;
  const opponents = model.opponents;
  const first = opponents[0]!;
  const longest = [...opponents].sort(
    (a, b) => b.name.length - a.name.length,
  )[0]!;
  const me = model.me ?? stub(first, "matt");
  const count = (p: TablePlayer) => timelineOf(model, p.id).length;
  const mySongs = model.me ? timelineOf(model, model.me.id) : [];
  const flipSong = DECADE_SONGS[3]!;

  return (
    <div style={page}>
      <Section title="SongCard: one per decade">
        {DECADE_SONGS.map((song) => (
          <Item key={song.year} caption={`${song.year}`}>
            <SongCard song={song} />
          </Item>
        ))}
      </Section>

      <Section title="SongCard: extremes and spinning">
        {EXTREMES.map((song) => (
          <Item key={song.title} caption={`${song.title.length} chars`}>
            <SongCard song={song} />
          </Item>
        ))}
        <Item caption="spinning">
          <SongCard song={DECADE_SONGS[2]!} spinning />
        </Item>
        {mySongs.slice(0, 3).map((song) => (
          <Item key={song.id} caption="fixture timeline">
            <SongCard song={song} />
          </Item>
        ))}
      </Section>

      <Section title="SongBack">
        <Item caption="idle">
          <SongBack />
        </Item>
        <Item caption="playing">
          <SongBack playing />
        </Item>
        <Item caption="title and artist shown">
          <SongBack title="Bohemian Rhapsody" artist="Queen" />
        </Item>
        <Item caption="shown, long, playing">
          <SongBack
            playing
            title="I Wanna Dance with Somebody (Who Loves Me)"
            artist="Whitney Houston"
          />
        </Item>
        <Item caption="title only">
          <SongBack playing title="Despacito" />
        </Item>
      </Section>

      <Section title="MysteryCard">
        <Item caption="interactive: hover to wiggle">
          <MysteryCard interactive playing tabIndex={0} />
        </Item>
        <Item caption="dragging">
          <MysteryCard
            interactive
            dragging
            style={{ transform: "scale(1.08) rotate(5deg)" }}
          />
        </Item>
        <Item caption="revealed">
          <MysteryCard song={DECADE_SONGS[0]!} revealed />
        </Item>
        <Item caption="revealed, correct">
          <MysteryCard song={DECADE_SONGS[5]!} revealed correct />
        </Item>
        <Item caption="click to flip">
          <MysteryCard
            song={flipSong}
            revealed={revealed}
            playing={!revealed}
            correct={revealed}
            role="button"
            tabIndex={0}
            aria-label="Flip the card"
            onClick={() => setRevealed((r) => !r)}
            style={{ cursor: "pointer" }}
          />
        </Item>
      </Section>

      <Section title="MiniCard">
        {[...DECADE_SONGS.map((s) => s.year), null].map((year) => (
          <Item
            key={year ?? "unknown"}
            caption={year === null ? "unknown" : ""}
          >
            <MiniCard year={year} />
          </Item>
        ))}
        <Item caption="glow">
          <MiniCard year={1983} glow />
        </Item>
        <Item caption="unknown, glow">
          <MiniCard year={null} glow />
        </Item>
        <Item caption="hover zoom 2.4">
          <HoverMini year={1995} zoom={2.4} />
        </Item>
        <Item caption="felt: scale 2">
          <div
            style={{
              padding: "calc(var(--u) * 1.6) calc(var(--u) * 1.2)",
            }}
          >
            <MiniCard year={1972} style={{ transform: "scale(2)" }} />
          </div>
        </Item>
      </Section>

      <Section title="Deck">
        <Item caption="still">
          <Deck />
        </Item>
        {/* Room for the riffle, which throws cards 5.2u to either side. */}
        <Item caption="shuffling">
          <Deck shuffling style={{ margin: "0 calc(var(--u) * 6)" }} />
        </Item>
      </Section>

      <Section title={`SeatCard (goal ${goal})`}>
        {opponents.map((p, i) => (
          <Item key={p.id} caption={p.name}>
            <SeatCard
              player={p}
              count={count(p)}
              goal={goal}
              tilt={TILTS[i % TILTS.length]}
            />
          </Item>
        ))}
        <Item caption="active">
          <SeatCard
            player={first}
            count={count(first)}
            goal={goal}
            tilt={2}
            active
          />
        </Item>
        <Item caption="away">
          <SeatCard
            player={{ ...first, connected: false }}
            count={count(first)}
            goal={goal}
            tilt={-2}
          />
        </Item>
        <Item caption="badge">
          <SeatCard
            player={first}
            count={count(first)}
            goal={goal}
            tilt={3}
            badge="BET"
          />
        </Item>
        <Item caption="active, away, badge">
          <SeatCard
            player={{ ...longest, connected: false }}
            count={count(longest)}
            goal={goal}
            active
            badge="BET"
          />
        </Item>
        <Item
          caption={`button: ${lastMenu ? `opened ${lastMenu}` : "click me"}`}
        >
          <SeatCard
            player={stub(first, "Bartholomew K.")}
            count={goal - 1}
            goal={goal}
            tilt={-1}
            onClick={() => setLastMenu("Bartholomew K.")}
          />
        </Item>
      </Section>

      <Section title="SeatCard at each table size (smallest opponentSpots scale)">
        {SPOT_COUNTS.map((n) => {
          const scale = Math.min(...opponentSpots(n).map((s) => s.scale));
          const p = opponents[(n - 1) % opponents.length]!;
          return (
            <Item key={n} caption={`${n} opp: ×${scale}`}>
              <SeatCard
                player={p}
                count={count(p)}
                goal={goal}
                tilt={TILTS[(n - 1) % TILTS.length]}
                style={{ transform: `scale(${scale})` }}
              />
            </Item>
          );
        })}
      </Section>

      <Section title="MePlate and Pips">
        {[5, 8, 10].map((g) => (
          <Item key={g} caption={`goal ${g}, 3 held`}>
            <MePlate player={me} count={3} goal={g} />
          </Item>
        ))}
        <Item caption="active">
          <MePlate player={me} count={count(me)} goal={goal} active />
        </Item>
        <Item caption="long name, goal 10 full">
          <MePlate
            player={stub(me, "Alexandrina V.")}
            count={10}
            goal={10}
            active
          />
        </Item>
        <Item caption="Pips alone, cream">
          <Pips count={4} goal={8} color="#fffaf0" />
        </Item>
      </Section>
    </div>
  );
}

/** The design zooms a mini card while the pointer is over it. */
function HoverMini({ year, zoom }: { year: number; zoom: number }) {
  const [hover, setHover] = useState(false);
  return (
    <MiniCard
      year={year}
      zoom={hover ? zoom : 1}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    />
  );
}

const section: GallerySection = {
  title: "Cards and table furniture",
  fullscreen: true,
  render: (context) => <CardsGallery context={context} />,
};
export default section;
