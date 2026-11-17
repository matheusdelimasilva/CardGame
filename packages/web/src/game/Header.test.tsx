import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GameHeader } from "./Header";

let renderer: ReactTestRenderer | undefined;
const props = {
  code: "92S7BT",
  gameName: "Hitster",
  watchers: [] as string[],
  soundOn: true,
  onLeave: vi.fn(),
  onToggleSound: vi.fn(),
  onInstructions: vi.fn(),
};
const render = (overrides: Partial<typeof props> = {}) => {
  act(() => {
    renderer = create(<GameHeader {...props} {...overrides} />);
  });
  return renderer!.root;
};
const textOf = (node: ReturnType<typeof render>): string =>
  node.children.map((c) => (typeof c === "string" ? c : textOf(c))).join("");
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
  vi.clearAllMocks();
});

describe("game header", () => {
  it("shows the sound state on the toggle and reports presses", () => {
    const root = render();
    const sound = root.findByProps({ "aria-label": "Sound" });
    expect(sound.props["aria-pressed"]).toBe(true);
    expect(sound.children).toEqual(["Sound on"]);
    act(() => sound.props.onClick());
    expect(props.onToggleSound).toHaveBeenCalledTimes(1);

    act(() => renderer!.update(<GameHeader {...props} soundOn={false} />));
    const off = root.findByProps({ "aria-label": "Sound" });
    expect(off.props["aria-pressed"]).toBe(false);
    expect(off.children).toEqual(["Sound off"]);
  });

  it("leaves the table and opens the instructions through its props", () => {
    const root = render();
    act(() =>
      root.findByProps({ "aria-label": "Leave table" }).props.onClick(),
    );
    expect(props.onLeave).toHaveBeenCalledTimes(1);
    const instructions = root
      .findAllByType("button")
      .find((b) => b.children[0] === "Instructions")!;
    expect(instructions.props["aria-haspopup"]).toBe("dialog");
    act(() => instructions.props.onClick());
    expect(props.onInstructions).toHaveBeenCalledTimes(1);
  });

  it("shows the table code, the watchers, the game and the invite button", () => {
    const root = render({ watchers: ["Rose", "Tom"] });
    expect(textOf(root.findByProps({ className: "tl-code" }))).toBe(
      "TABLE 92S7BT",
    );
    expect(textOf(root.findByProps({ className: "tl-watchers" }))).toBe(
      "Watching: Rose, Tom",
    );
    expect(
      root.findByProps({ className: "tl-marquee" }).props["aria-label"],
    ).toBe("Now playing Hitster");
    expect(
      root.findAllByType("button").map((b) => b.children.join("")),
    ).toContain("Invite");
    act(() => renderer!.update(<GameHeader {...props} />));
    expect(textOf(root.findByProps({ className: "tl-watchers" }))).toBe(
      "Watching: Nobody yet",
    );
  });
});
