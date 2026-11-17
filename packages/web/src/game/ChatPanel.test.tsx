import type { ChatMessage } from "@cardgame/protocol";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatPanel, chatLines, type ChatPanelProps } from "./ChatPanel";

let renderer: ReactTestRenderer | undefined;
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
});

const onSend = vi.fn();
function mount(props: Partial<ChatPanelProps> = {}) {
  onSend.mockClear();
  act(() => {
    renderer = create(
      createElement(ChatPanel, {
        lines: [],
        canSend: true,
        named: true,
        onSend,
        ...props,
      }),
    );
  });
  return renderer!.root;
}
const input = (r: ReturnType<typeof mount>) => r.findByType("input");
const type = (r: ReturnType<typeof mount>, value: string) =>
  act(() => input(r).props.onChange({ target: { value } }));
const submit = (r: ReturnType<typeof mount>) =>
  act(() => r.findByType("form").props.onSubmit({ preventDefault() {} }));
const badges = (r: ReturnType<typeof mount>) =>
  r.findAll(
    (n) =>
      typeof n.type === "string" &&
      String(n.props.className ?? "").includes("gs-chat-badge"),
  );

describe("chatLines", () => {
  it("maps server messages to message lines", () => {
    const m: ChatMessage = {
      id: "7",
      from: { id: "p1", name: "Ana" },
      text: "hi",
      at: 1,
    };
    expect(chatLines([m])).toEqual([
      { id: "7", kind: "message", name: "Ana", text: "hi" },
    ]);
    expect(chatLines([])).toEqual([]);
  });
});

describe("ChatPanel", () => {
  it("sends trimmed text once and clears the input", () => {
    const r = mount();
    type(r, "  hello  ");
    submit(r);
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("hello");
    expect(input(r).props.value).toBe("");
  });

  it("does not send blank text", () => {
    const r = mount();
    type(r, "   ");
    submit(r);
    expect(onSend).not.toHaveBeenCalled();
    expect(r.findByType("button").props.disabled).toBe(true);
  });

  it("does not send when it cannot send", () => {
    const r = mount({ canSend: false });
    type(r, "hello");
    submit(r);
    expect(onSend).not.toHaveBeenCalled();
    expect(input(r).props.disabled).toBe(true);
  });

  it("shows badges only when given, and reflects their state", () => {
    expect(badges(mount())).toHaveLength(0);
    act(() => renderer?.unmount());
    const r = mount({ badges: { song: true, artist: false } });
    const [song, artist] = badges(r);
    expect(song?.props["aria-label"]).toBe("Song guessed");
    expect(song?.props.className).toContain("gs-chat-badge-got");
    expect(artist?.props["aria-label"]).toBe("Artist not guessed yet");
    expect(artist?.props.className).not.toContain("gs-chat-badge-got");
  });

  it("picks the placeholder for each state", () => {
    expect(input(mount()).props.placeholder).toBe("Say something…");
    act(() => renderer?.unmount());
    expect(
      input(mount({ badges: { song: false, artist: false } })).props
        .placeholder,
    ).toBe("Guess or chat…");
    act(() => renderer?.unmount());
    expect(
      input(mount({ named: false, canSend: false })).props.placeholder,
    ).toBe("Choose a name to chat");
    act(() => renderer?.unmount());
    expect(input(mount({ canSend: false })).props.placeholder).toBe(
      "Reconnecting...",
    );
  });

  it("renders the three line kinds with their classes", () => {
    const r = mount({
      lines: [
        { id: "1", kind: "message", name: "Ana", text: "hi" },
        { id: "2", kind: "system", text: "Mika guessed the song correctly." },
        { id: "3", kind: "notice", text: "Close, but not quite." },
      ],
    });
    const cls = (c: string) => r.findAll((n) => n.props.className === c);
    expect(cls("gs-chat-line")).toHaveLength(1);
    expect(cls("gs-chat-line gs-chat-system")).toHaveLength(1);
    expect(cls("gs-chat-line gs-chat-notice")).toHaveLength(1);
    expect(cls("gs-chat-name")[0]?.children.join("")).toBe("Ana: ");
  });

  it("shows an empty state", () => {
    const r = mount();
    expect(
      r.findAll((n) => n.props.className === "gs-chat-empty"),
    ).toHaveLength(1);
  });
});
