import { createRef, type ReactElement } from "react";
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import {
  MePlate,
  MiniCard,
  MysteryCard,
  Pips,
  SeatCard,
  SongBack,
  SongCard,
  splitArtist,
} from "./cards";
import type { TablePlayer } from "./types";

const player: TablePlayer = {
  id: "p1",
  name: "Jonathan Silva",
  seat: 2,
  animal: "🐻",
  chip: "#ef4a3c",
  chipEdge: "#b8362b",
  connected: true,
  isHost: false,
  isMe: false,
};
const song = {
  title: "Crazy in Love",
  artist: "Beyoncé featuring Jay-Z",
  year: 2003,
};

function render(element: ReactElement): ReactTestInstance {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(element);
  });
  return renderer!.root;
}
/** All text under `node`, in order. */
function text(node: ReactTestInstance | string): string {
  return typeof node === "string" ? node : node.children.map(text).join("");
}
const labelled = (root: ReactTestInstance) =>
  root
    .findAll((n) => typeof n.type === "string" && n.props["aria-label"])
    .map((n) => n.props["aria-label"] as string);

describe("splitArtist", () => {
  it.each([
    ["Beyoncé featuring Jay-Z", "Beyoncé", "Jay-Z"],
    ["Rihanna feat. Jay-Z", "Rihanna", "Jay-Z"],
    ["Drake ft Rihanna", "Drake", "Rihanna"],
    ["Mark Ronson FEATURING Bruno Mars", "Mark Ronson", "Bruno Mars"],
  ])("splits %s", (name, main, feat) => {
    expect(splitArtist(name)).toEqual({ main, feat });
  });

  it("leaves a solo artist and words that only contain 'feat' alone", () => {
    expect(splitArtist("Queen")).toEqual({ main: "Queen", feat: null });
    expect(splitArtist("Feather Fifty")).toEqual({
      main: "Feather Fifty",
      feat: null,
    });
  });
});

describe("SongCard", () => {
  it("is named by title, artist and year and shows the featured artist on its own line", () => {
    const root = render(<SongCard song={song} />);
    expect(labelled(root)).toEqual([
      "Crazy in Love, Beyoncé featuring Jay-Z, 2003",
    ]);
    const feat = root.find((n) => n.props.className === "gs-feat");
    expect(text(feat)).toBe("feat. Jay-Z");
    expect(text(root)).toContain("2003");
  });
});

describe("SongBack", () => {
  it("hides the song unless title and artist are shown", () => {
    const hidden = render(<SongBack />);
    expect(text(hidden)).toBe("???");
    expect(labelled(hidden)).toEqual(["Mystery song card"]);

    const shown = render(<SongBack title="Africa" artist="Toto" />);
    expect(text(shown)).toBe("AfricaToto");
    expect(labelled(shown)).toEqual(["Mystery song: Africa, Toto"]);
  });

  it("shows the equalizer only while playing", () => {
    const eq = (root: ReactTestInstance) =>
      root.findAll((n) => n.props.className === "gs-eq").length;
    expect(eq(render(<SongBack />))).toBe(0);
    expect(eq(render(<SongBack playing />))).toBe(1);
  });
});

describe("MysteryCard", () => {
  const sides = (root: ReactTestInstance) =>
    root.findAll(
      (n) =>
        typeof n.type === "string" &&
        String(n.props.className).startsWith("gs-mystery-side"),
    );

  it("stays face down, with the year nowhere in the tree, until revealed", () => {
    const root = render(<MysteryCard song={song} />);
    const [back, front] = sides(root);
    expect(back!.props["aria-hidden"]).toBe(false);
    expect(front!.props["aria-hidden"]).toBe(true);
    expect(text(root)).not.toContain("2003");
  });

  it("does not render the face before it has a song, even when revealed", () => {
    const root = render(<MysteryCard revealed />);
    expect(text(sides(root)[1]!)).toBe("");
  });

  it("flips to the song's face when revealed", () => {
    const root = render(<MysteryCard song={song} revealed correct />);
    const [back, front] = sides(root);
    expect(back!.props["aria-hidden"]).toBe(true);
    expect(front!.props["aria-hidden"]).toBe(false);
    expect(labelled(front!)).toEqual([
      "Crazy in Love, Beyoncé featuring Jay-Z, 2003",
    ]);
    expect(root.findByType("div").props.className).toBe(
      "gs-mystery is-correct is-revealed",
    );
  });

  it("forwards its ref and passes handlers and attributes to the root", () => {
    const ref = createRef<HTMLDivElement>();
    const onPointerDown = vi.fn();
    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = create(
        <MysteryCard
          ref={ref}
          role="button"
          tabIndex={0}
          aria-label="Mystery song card"
          onPointerDown={onPointerDown}
        />,
        // Only the root gets a node: the plates' fit-text effect needs a real DOM.
        {
          createNodeMock: (el) =>
            String(el.props.className).startsWith("gs-mystery")
              ? { tag: "node" }
              : null,
        },
      );
    });
    const div = renderer!.root.findByType("div");
    expect(div.props.role).toBe("button");
    expect(div.props.tabIndex).toBe(0);
    div.props.onPointerDown();
    expect(onPointerDown).toHaveBeenCalled();
    expect(ref.current).toEqual({ tag: "node" });
  });
});

describe("MiniCard", () => {
  it("shows the year, or a ? when it is unknown", () => {
    expect(text(render(<MiniCard year={1987} />))).toBe("1987");
    const unknown = render(<MiniCard year={null} />);
    expect(text(unknown)).toBe("?");
    expect(labelled(unknown)).toEqual(["Face-down card"]);
  });
});

describe("SeatCard", () => {
  it("is a plain element without onClick", () => {
    const root = render(<SeatCard player={player} count={2} goal={5} />);
    expect(root.findAllByType("button")).toHaveLength(0);
    expect(text(root)).toContain("Jonathan Silva");
    expect(text(root)).toContain("2/5");
  });

  it("is a labelled button with onClick", () => {
    const onClick = vi.fn();
    const root = render(
      <SeatCard
        player={{ ...player, connected: false }}
        count={2}
        goal={5}
        badge="BET"
        active
        onClick={onClick}
      />,
    );
    const button = root.findByType("button");
    expect(button.props["aria-label"]).toBe(
      "Jonathan Silva, 2 of 5 cards, away, BET, player options",
    );
    expect(button.props["aria-current"]).toBe("true");
    button.props.onClick();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("tags a disconnected player as away", () => {
    const away = render(
      <SeatCard player={{ ...player, connected: false }} count={1} goal={5} />,
    );
    expect(text(away)).toContain("away");
    expect(
      text(render(<SeatCard player={player} count={1} goal={5} />)),
    ).not.toContain("away");
  });
});

describe("Pips and MePlate", () => {
  const pips = (root: ReactTestInstance) =>
    root.findAll((n) => /^gs-pip( |$)/.test(String(n.props.className)));
  const filled = (root: ReactTestInstance) =>
    root.findAll((n) => n.props.className === "gs-pip is-filled");

  it.each([5, 8, 10])("draws one pip per card of a goal of %i", (goal) => {
    const root = render(<Pips count={3} goal={goal} />);
    expect(pips(root)).toHaveLength(goal);
    expect(filled(root)).toHaveLength(3);
    expect(labelled(root)).toEqual([`3 of ${goal} cards`]);
  });

  it("puts the player's name and progress on the plate", () => {
    const root = render(
      <MePlate player={{ ...player, isMe: true }} count={4} goal={8} active />,
    );
    expect(text(root)).toContain("Jonathan Silva");
    expect(filled(root)).toHaveLength(4);
    expect(root.findByType("div").props.className).toBe("gs-me is-active");
  });
});
