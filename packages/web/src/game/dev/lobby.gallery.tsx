/**
 * The table lobby with the fixture table, before anyone starts. It shares its
 * header and dialogs with the game screen (ui/), so it is here to catch any
 * change to that chrome showing up in the lobby.
 */
import type { RoomView } from "@cardgame/protocol";
import { TableLobby } from "../../lobby/TableLobby";
import type { GallerySection } from "./types";

/**
 * The scenario's table with no game yet and one person watching; with
 * `?over=1`, back from a finished game that the first seated player won.
 */
function lobbyRoom(room: RoomView): RoomView {
  const over = new URLSearchParams(location.search).get("over") === "1";
  const winner = room.seats.find((s) => s)?.id;
  return {
    ...room,
    game:
      over && room.game && winner
        ? { ...room.game, result: { winners: [winner] } }
        : null,
    spectators: [{ id: "watcher", name: "Grandma Rose", connected: true }],
  };
}

const section: GallerySection = {
  title: "Table lobby",
  fullscreen: true,
  render: ({ room }) => (
    <TableLobby
      room={lobbyRoom(room)}
      send={() => {}}
      connection="open"
      error={null}
    />
  ),
};

export default section;
