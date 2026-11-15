import type { RoomView } from "@cardgame/protocol";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TableLobby } from "./TableLobby";

const host = {
  id: "host",
  name: "Ana",
  connected: true,
  isHost: true,
  inGame: false,
};
const guest = { ...host, id: "guest", name: "Bo", isHost: false };
const fixture = (): RoomView => ({
  code: "ABC123",
  gameInfo: {
    id: "hitster",
    name: "Hitster",
    minPlayers: 2,
    maxPlayers: 8,
    description: "Place songs in order.",
    settings: [
      {
        id: "cards",
        type: "select",
        label: "Cards to win",
        default: "5",
        options: [{ value: "5", label: "5" }],
      },
    ],
  },
  settings: { cards: "5" },
  you: { id: "host", name: "Ana", isHost: true, seat: 0 },
  seats: [host, guest, null, null, null, null, null, null],
  spectators: [],
  game: null,
});
let renderer: ReactTestRenderer | undefined;
const send = vi.fn();
const render = (
  room: RoomView,
  connection: "open" | "reconnecting" = "open",
) => {
  act(() => {
    renderer = create(
      createElement(TableLobby, { room, send, connection, error: null }),
    );
  });
  return renderer!.root;
};
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
  vi.clearAllMocks();
});

describe("table lobby controls", () => {
  it("lets only the host start when enough players are seated", () => {
    const room = fixture();
    const root = render(room);
    const start = root.findByProps({ className: "tl-button tl-start" });
    expect(start.props.disabled).toBe(false);
    act(() => start.props.onClick());
    expect(send).toHaveBeenCalledWith({ type: "start" });
    act(() =>
      renderer!.update(
        createElement(TableLobby, {
          room: {
            ...room,
            you: { id: "guest", name: "Bo", isHost: false, seat: 1 },
          },
          send,
          connection: "open",
          error: null,
        }),
      ),
    );
    expect(
      root.findByProps({ className: "tl-button tl-start" }).props.disabled,
    ).toBe(true);
  });

  it("blocks starting when under the player minimum or reconnecting", () => {
    const room = fixture();
    room.seats[1] = null;
    expect(
      render(room).findByProps({ className: "tl-button tl-start" }).props
        .disabled,
    ).toBe(true);
    act(() =>
      renderer!.update(
        createElement(TableLobby, {
          room: fixture(),
          send,
          connection: "reconnecting",
          error: null,
        }),
      ),
    );
    expect(
      renderer!.root.findByProps({ className: "tl-button tl-start" }).props
        .disabled,
    ).toBe(true);
  });

  it("preserves seat identity when sitting, switching seats, and standing", () => {
    const root = render(fixture());
    act(() =>
      root.findByProps({ "aria-label": "Sit in seat 4" }).props.onClick(),
    );
    expect(send).toHaveBeenLastCalledWith({ type: "sit", seat: 3 });
    act(() => root.findByProps({ "aria-label": "Stand up" }).props.onClick());
    expect(send).toHaveBeenLastCalledWith({ type: "stand" });
    expect(
      root.findByProps({ "aria-label": "Bo, player options" }).props.disabled,
    ).toBe(false);
  });

  it("disables occupied seats for guests and requires a name before sitting", () => {
    const room = fixture();
    room.you = { id: "watcher", name: "", isHost: false, seat: null };
    const root = render(room);
    expect(
      root.findByProps({ "aria-label": "Bo is seated" }).props.disabled,
    ).toBe(true);
    expect(
      root.findByProps({ "aria-label": "Sit in seat 4" }).props.disabled,
    ).toBe(true);
  });

  it("shows winners and replay after a game, using the same host-only rules", () => {
    const room = fixture();
    room.game = {
      gameId: "hitster",
      players: [host.id, guest.id],
      active: [],
      view: {},
      result: { winners: [guest.id] },
      track: null,
      timer: null,
      pause: null,
    };
    const root = render(room);
    expect(root.findByType("h1").children).toEqual(["Bo wins!"]);
    const replay = root.findByProps({ className: "tl-button tl-start" });
    expect(replay.children).toEqual(["Play again"]);
    act(() => replay.props.onClick());
    expect(send).toHaveBeenCalledWith({ type: "start" });
  });

  it("hides settings from assistive technology until the drawer opens", () => {
    const root = render(fixture());
    const panel = () => root.findByProps({ id: "game-settings" });
    expect(panel().props["aria-hidden"]).toBe(true);
    act(() =>
      root.findByProps({ "aria-controls": "game-settings" }).props.onClick(),
    );
    expect(panel().props["aria-hidden"]).toBe(false);
    expect(panel().props.inert).toBeUndefined();
    expect(root.findByType("dd").children).toEqual(["5"]);
  });
});
