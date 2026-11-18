/** The chat panel at its stage size in each state it can be in. */
import { useState } from "react";
import { ChatPanel, type ChatLine, type GuessBadges } from "../ChatPanel";
import { CHAT_BOX, u } from "../layout";
import type { GallerySection } from "./types";

const msg = (id: number, name: string, text: string): ChatLine => ({
  id: String(id),
  kind: "message",
  name,
  text,
});

const FEW: ChatLine[] = [
  msg(1, "Ana", "this one is easy"),
  msg(2, "Bo", "no way, 1983?"),
  msg(3, "Ana", "trust me"),
];

const LONG: ChatLine[] = Array.from({ length: 30 }, (_, i) =>
  i % 5 === 0
    ? msg(
        i,
        "WWWWWWWWWWWWWW",
        "Supercalifragilisticexpialidocious_and_then_some_more_unbroken_text_here",
      )
    : msg(i, i % 2 ? "Ana" : "Bo", `message number ${i + 1}, a bit longer`),
);

const KINDS: ChatLine[] = [
  msg(1, "Mika", "is it the 80s?"),
  { id: "2", kind: "system", text: "Mika guessed the song correctly." },
  {
    id: "3",
    kind: "notice",
    text: "Close, but not quite. Your message wasn't sent.",
  },
  msg(4, "Ana", "nice one"),
];

const BADGES: [string, GuessBadges | undefined][] = [
  ["Badges absent", undefined],
  ["None guessed", { song: false, artist: false, open: true }],
  ["Song guessed", { song: true, artist: false, open: true }],
  ["Both guessed", { song: true, artist: true, open: true }],
  ["Reveal: artist missed", { song: true, artist: false, open: false }],
];

/** A panel with its own log, so sending appends a line. */
function Demo({
  title,
  initial,
  canSend = true,
  named = true,
  badges,
}: {
  title: string;
  initial: ChatLine[];
  canSend?: boolean;
  named?: boolean;
  badges?: GuessBadges;
}) {
  const [lines, setLines] = useState(initial);
  return (
    <figure style={{ margin: 0 }}>
      <figcaption
        style={{ color: "#fffaf0", font: `500 ${u(1.2)}/1.4 var(--mono)` }}
      >
        {title}
      </figcaption>
      <div style={{ width: u(CHAT_BOX.w), height: u(CHAT_BOX.h) }}>
        <ChatPanel
          lines={lines}
          canSend={canSend}
          named={named}
          badges={badges}
          onSend={(text) =>
            setLines((l) => [...l, msg(Date.now() + l.length, "You", text)])
          }
        />
      </div>
    </figure>
  );
}

function ChatGallery() {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: u(3),
        padding: u(2),
        width: u(100),
        boxSizing: "border-box",
      }}
    >
      <Demo title="Empty" initial={[]} />
      <Demo title="A few lines" initial={FEW} />
      <Demo title="Long log, long words" initial={LONG} />
      <Demo title="All three kinds" initial={KINDS} badges={BADGES[1]![1]} />
      {BADGES.map(([title, badges]) => (
        <Demo key={title} title={title} initial={FEW} badges={badges} />
      ))}
      <Demo title="No name" initial={FEW} named={false} canSend={false} />
      <Demo title="Reconnecting" initial={FEW} canSend={false} />
    </div>
  );
}

const section: GallerySection = {
  title: "Chat panel",
  render: () => <ChatGallery />,
};
export default section;
