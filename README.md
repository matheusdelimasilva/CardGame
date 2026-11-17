# CardGame

A web platform for social card games: 2 to 8 players around a round table, on phones and computers.
One player signs in with an email code and hosts; everyone else joins from a shared link with just a nickname.

## Status

| Step                                                         | State                           |
| ------------------------------------------------------------ | ------------------------------- |
| 1. Engine: cards, zones, visibility, per-player views        | Done                            |
| 2. First demo game on the engine (since removed)             | Done                            |
| 3. Server: rooms, join by link, seats, spectators, reconnect | Done                            |
| 4. Web client: lobby and game screen, portrait on phones     | Done                            |
| 5. Email sign-in for hosts, game history                     | Done (emails need a Resend key) |
| 6. Deploy                                                    | Not started                     |

Screenshots of every screen are in `docs/screenshots`.

## Run it

```
pnpm install
pnpm dev        # server on :3001, web client on http://localhost:5173
```

Without a `RESEND_API_KEY` the server runs in development mode: no email is sent and the sign-in code is shown on the sign-in screen.
To try a table alone, open the invite link in a few private windows.
To try it from a phone on the same Wi-Fi, open `http://<your computer's IP>:5173`.

Production-style run, one process serving both the API and the built client:

```
pnpm build
RESEND_API_KEY=... EMAIL_FROM="CardGame <you@your-domain>" NODE_ENV=production pnpm start
```

| Variable         | Default            | Purpose                                                                                                     |
| ---------------- | ------------------ | ----------------------------------------------------------------------------------------------------------- |
| `PORT`           | `3001`             | HTTP and WebSocket port                                                                                     |
| `RESEND_API_KEY` | none               | Sends sign-in codes by email. Required when `NODE_ENV=production`                                           |
| `EMAIL_FROM`     | Resend test sender | From address for sign-in emails                                                                             |
| `DATA_FILE`      | `data/db.json`     | JSON storage for sessions, history and room snapshots when `DATABASE_URL` is unset                          |
| `DATABASE_URL`   | none               | Postgres connection URL; uses Postgres instead of `DATA_FILE`                                               |
| `TRUST_PROXY`    | unset              | Set to `1` only behind a trusted reverse proxy to use the first `X-Forwarded-For` address for rate limiting |

Sign-in code requests are limited to five per IP per ten-minute fixed window,
in memory per server process. By default the IP is `req.socket.remoteAddress`;
forwarded headers are ignored. With `TRUST_PROXY=1`, the proxy must overwrite
`X-Forwarded-For` and prevent direct untrusted access to the server. Expired codes
and rate-limit entries are pruned every minute. Sessions expire after 30 days
without a successful authenticated use; each use refreshes their stored timestamp.
Existing sessions without timestamps are migrated as last used at startup.

### Postgres locally

JSON remains the default. To use Postgres instead, start a local database with Docker:

```sh
docker run --name cardgame-postgres \
  -e POSTGRES_USER=cardgame -e POSTGRES_PASSWORD=cardgame -e POSTGRES_DB=cardgame \
  -p 127.0.0.1:5432:5432 -v cardgame-postgres:/var/lib/postgresql/data \
  -d postgres:17
DATABASE_URL=postgres://cardgame:cardgame@localhost:5432/cardgame pnpm dev
```

The server creates missing tables on startup: `sessions` (`token` primary key, `email`, `last_used` epoch milliseconds),
`history` (`host_email` primary key, `entries` JSONB array, newest first, up to 100 games),
and `rooms` (`code` primary key, `snapshot` JSONB). It loads them into memory before
accepting requests. Writes are debounced by 300 ms; only changed rows are written,
including rooms mutated in place. Shutdown waits for pending writes. Sign-in codes
stay in memory and are never persisted. Run one server process per database; active
rooms and sessions are cached in that process. Existing JSON data is not imported automatically.

Snapshots have a data version and a per-room version. Ordered startup migrations
upgrade unversioned (v0) data, including legacy sessions, room settings/audio fields
and Hitster's International song-list default. Postgres records the data version in
`store_metadata` and applies migrations transactionally. Newer-than-supported versions
refuse startup; upgrade the server instead of editing version numbers.

The service, registry and authentication layer mark dirty room/session/history keys;
Postgres only serializes and upserts/deletes those rows. JSON writes the whole file
asynchronously through a serialized temporary-file/rename queue, also debounced by
300 ms and flushed on shutdown. Only a missing JSON file starts empty: corrupt or
unreadable snapshots abort startup with the path and are never silently overwritten.

Stop the database with `docker stop cardgame-postgres`; restart it with
`docker start cardgame-postgres`. The named volume preserves data between containers.

Postgres integration tests are skipped unless `TEST_DATABASE_URL` is set:

```sh
TEST_DATABASE_URL=postgres://cardgame:cardgame@localhost:5432/cardgame pnpm test
```

Use a local/test database account that can create schemas. Each integration test creates
and removes its own isolated schema. `createApp({ dataFile: null, ... })` always uses
an in-memory JSON store, even when `DATABASE_URL` is set, keeping existing tests isolated.
CI supplies a PostgreSQL 17 service and sets `TEST_DATABASE_URL`, so these tests run there too.

## Layout

- `packages/engine`: game-agnostic building blocks. No network code.
- `packages/games`: one rules module per game.
- `packages/protocol`: message and view types shared by server and client.
- `packages/server`: `app.ts` wires transports, room lifecycle, sign-in (`auth.ts`) and storage (`store.ts`).
- `packages/web`: React client. `Room.tsx` routes a table to the lobby (`lobby/`, before a game) or the game screen (`game/`); `ui/` holds the table chrome both share. The dev-only gallery at `/dev/game` (`game/dev`) shows the game screen's parts and every scenario (your turn, reveals, final scores, spectator, many players) with fixtures, no server needed.

### Server boundaries

- `rooms/registry.ts` owns room identity, snapshot restore/validation, persistence and idle eviction.
- `rooms/service.ts` runs member commands without sockets: validates game moves, records finished-game history, recovers failures to lobby and notifies listeners.
- `rooms/clock.ts` submits expired turns to the service after startup restore completes.
- `rooms.ts` exports the room rules API, implemented by `rooms/model.ts`, `members.ts`, `game.ts` and `view.ts` (data, seating, game orchestration and per-member projection).
- `ws/gateway.ts` owns upgrades, hello/session handling, protocol parsing and per-room connections. It subscribes to service changes to build and broadcast views; projection failures flow back into the room recovery guard.
- `http/routes.ts` dispatches a route table from `http/auth.ts` and `http/rooms.ts`; `http/static.ts` serves the built client. HTTP errors are contained without ending live games. `http.ts` holds JSON schemas/body parsing and trusted-proxy IP selection.
- The game registry exposes `getGame(id)` as an erased `AnyGame`. `defineGame` confines state/move type erasure to that boundary; game implementations retain their concrete types.

## How a table works

- The host signs in with an email code, picks a game, chooses that game's settings, and creates a table. The table gets a six-character code and a link (`/t/CODE`).
- The game and its settings are fixed for the life of the table and shown to everyone in the lobby.
- Guests open the link, type a nickname and tap an open seat. A token in their browser gives them the same seat back after a refresh or a dropped connection.
- People who arrive during a game watch it, and can take an open seat to join the next game.
- A disconnected player keeps their seat and shows as "away". The host can tap them to play their turn for them, or remove them (which ends the current game).
- Finished games are saved to the host's history.
- Rooms are snapshotted to the configured store after every change and close after 12 hours without activity.

## Adding a game

1. Implement the engine's `GameModule<State, Move, View>` in `packages/games/src`, exporting the game's view and move types. Supply a Zod `moveSchema` owned by the game; the room service validates wire payloads with it before calling the rules. Keep legality checks (turn, available cards, placement bounds) in `applyMove`.
   - `settings` lists what the host can choose before creating a table. Two kinds exist: `toggle` (on/off) and `select` (one option from a dropdown). The settings screen is generated from this list, and the chosen values arrive in `setup`.
   - `currentTrack` (optional) names a recording everyone should hear at this point in the game. The server turns it into a secret per-recording URL and the table plays it, with a pause/replay toggle.
   - `turnTimeLimit` (optional) returns how many seconds the current turn may take. When it runs out, the server plays the game's `autoMove` for that player.
2. Register `defineGame(yourModule)` in `games` in `packages/games/src/index.ts`. It then appears in the host's game picker; the server resolves ids through `getGame` rather than indexing an untyped registry.
3. Give it a screen. The game screen in `packages/web/src/game` is built for Hitster only (`model.ts` turns a `RoomView` into what it draws; `Room.tsx` shows it for `hitster` games and the lobby otherwise), so a second game needs its own screen model and scenes there.
   - Import the rules package with `import type` only, so hidden data such as Hitster's song years is not bundled into the client.
4. Add rules, move-schema and room-service tests. Run the checks below and inspect the built JS for private game data before shipping.

## Games

- **Hitster** (`packages/games/src/hitster`): each player builds a timeline of songs by release year. The table draws a song on your turn and you choose where it goes; a correct spot keeps the card, a wrong one discards it. First to 10 cards wins (5 or 8 as a setting).
  - Game screen (`packages/web/src/game`): the table is a stage that scales to the window, designed in `docs/design/game-screen.dc.html`. On your turn the mystery card waits face down; drag it into your timeline (or focus it, choose a spot with the arrow keys and press Enter), then "Lock it in". Dragging again changes your mind until you lock in. Everyone sees the placement revealed, then the card kept or discarded, with the song's title, artist and year. A "Get ready" note with the rules and a countdown opens each game; the Instructions button (a "?" on phones) shows the rules again; the host can tap a player's seat to play an away player's turn or remove them. When someone reaches the goal, final scores show with Play again (host) and Back to lobby.
  - On phones held upright the table is laid out in portrait: the timeline scrolls sideways under the table and chat opens from a Chat button that shows a dot for unread messages. Tables of up to 8 players, long timelines and spectators (who can take an open seat for the next game) are handled by the same screen.
  - Sound: the song being placed plays on every player's and spectator's device (a 30-second Deezer preview). Tapping the record pauses or replays it, and the speaker button turns sound off for that device. Phones refuse to start sound until the page has been tapped, so a "tap anywhere to turn on sound" strip appears when that happens.
  - The browser is given an unguessable URL per song (`/api/rooms/CODE/track/...`) that the server streams from Deezer. It does not name the song and stops working when the turn ends, so the sound cannot be used to look up the year.
  - Not built yet: betting on other players' placements. The "Show title and artist" setting (off by default) shows the song's name as well, for playing without sound.
  - Songs come from `tools/songs/out/songs.json` (see `tools/songs/README.md`). Each game deals a random 300 of those that have a Deezer id. The list lives only on the server: a client is sent a song's year only once the card is face up, and never its Deezer id.
  - Cards use the Vinyl design from `docs/design/song-cards.html`, coloured by decade; the song being placed uses its face-down back.
- Hitster is the only game. An earlier highest-card-wins Demo game was removed; rooms saved with it are dropped when the server starts, and their history entries stay readable.

## How the engine works

- Every card lives in a **zone**: a deck, a discard pile, the spot in front of a player.
- Every card records **who may see its face**: everyone, nobody, or specific players.
- Each mechanic is a move between zones plus a visibility change: `deal`, `moveCard`, `reveal`, `peek`, `shuffle`.
- The server holds the full state and sends each client only `viewTable(state, viewer)`, where hidden faces are `null`. Spectators are the `null` viewer.
- Card ids are opaque and are reissued on every shuffle, so they cannot be used to track a card.
- Shuffles come from a seed stored in the state, so a game can be saved, restored and replayed.

A game implements `GameModule`: `setup`, `applyMove` (rejects illegal moves), `view` and `result`.
See `packages/games/src/hitster` for a complete example.

## Checks

Use Node 22 and the pinned pnpm version (via Corepack). CI runs these checks on
pushes and pull requests:

```
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
```

Run `pnpm format` to apply Prettier formatting. Generated song datasets and caches
are excluded. Run `node --test tools/songs/brazil/*.node-test.mjs` for the offline
song pipeline regression tests, and `pnpm audit` to check dependencies.
