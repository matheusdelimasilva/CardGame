# CardGame

A web platform for social card games: 2 to 8 players around a round table, on phones and computers.
One player signs in with an email code and hosts; everyone else joins from a shared link with just a nickname.

## Status

| Step                                                         | State                           |
| ------------------------------------------------------------ | ------------------------------- |
| 1. Engine: cards, zones, visibility, per-player views        | Done                            |
| 2. Demo game on the engine                                   | Done                            |
| 3. Server: rooms, join by link, seats, spectators, reconnect | Done                            |
| 4. Round-table web client, portrait-first on phones          | Done                            |
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

| Variable         | Default            | Purpose                                                                            |
| ---------------- | ------------------ | ---------------------------------------------------------------------------------- |
| `PORT`           | `3001`             | HTTP and WebSocket port                                                            |
| `RESEND_API_KEY` | none               | Sends sign-in codes by email. Required when `NODE_ENV=production`                  |
| `EMAIL_FROM`     | Resend test sender | From address for sign-in emails                                                    |
| `DATA_FILE`      | `data/db.json`     | JSON storage for sessions, history and room snapshots when `DATABASE_URL` is unset |
| `DATABASE_URL`   | none               | Postgres connection URL; uses Postgres instead of `DATA_FILE`                      |

### Postgres locally

JSON remains the default. To use Postgres instead, start a local database with Docker:

```sh
docker run --name cardgame-postgres \
  -e POSTGRES_USER=cardgame -e POSTGRES_PASSWORD=cardgame -e POSTGRES_DB=cardgame \
  -p 127.0.0.1:5432:5432 -v cardgame-postgres:/var/lib/postgresql/data \
  -d postgres:17
DATABASE_URL=postgres://cardgame:cardgame@localhost:5432/cardgame pnpm dev
```

The server creates missing tables on startup: `sessions` (`token` primary key, `email`),
`history` (`host_email` primary key, `entries` JSONB array, newest first, up to 100 games),
and `rooms` (`code` primary key, `snapshot` JSONB). It loads them into memory before
accepting requests. Writes are debounced by 300 ms; only changed rows are written,
including rooms mutated in place. Shutdown waits for pending writes. Sign-in codes
stay in memory and are never persisted. Run one server process per database; active
rooms and sessions are cached in that process. Existing JSON data is not imported automatically.

Stop the database with `docker stop cardgame-postgres`; restart it with
`docker start cardgame-postgres`. The named volume preserves data between containers.

Postgres integration tests are skipped unless `TEST_DATABASE_URL` is set:

```sh
TEST_DATABASE_URL=postgres://cardgame:cardgame@localhost:5432/cardgame pnpm test
```

Use a local/test database account that can create schemas. Each integration test creates
and removes its own isolated schema. `createApp({ dataFile: null, ... })` always uses
an in-memory JSON store, even when `DATABASE_URL` is set, keeping existing tests isolated.

## Layout

- `packages/engine`: game-agnostic building blocks. No network code.
- `packages/games`: one rules module per game.
- `packages/protocol`: message and view types shared by server and client.
- `packages/server`: rooms (`rooms.ts`), HTTP and WebSocket (`app.ts`), sign-in (`auth.ts`), storage (`store.ts`).
- `packages/web`: React client. `Room.tsx` is the shared table; `games/` holds each game's table UI.

## How a table works

- The host signs in with an email code, picks a game, chooses that game's settings, and creates a table. The table gets a six-character code and a link (`/t/CODE`).
- The game and its settings are fixed for the life of the table and shown to everyone in the lobby.
- Guests open the link, type a nickname and tap an open seat. A token in their browser gives them the same seat back after a refresh or a dropped connection.
- People who arrive during a game watch it, and can take an open seat to join the next game.
- A disconnected player keeps their seat and shows as "away". The host can tap them to play their turn for them, or remove them (which ends the current game).
- Finished games are saved to the host's history.
- Rooms are snapshotted to the configured store after every change and close after 12 hours without activity.

## Adding a game

1. Write the rules as a `GameModule` in `packages/games/src` and add it to `games` in `index.ts`. It then appears in the host's game picker.
   - `settings` lists what the host can choose before creating a table. Two kinds exist: `toggle` (on/off) and `select` (one option from a dropdown). The settings screen is generated from this list, and the chosen values arrive in `setup`.
   - `currentTrack` (optional) names a recording everyone should hear at this point in the game. The server turns it into a secret per-recording URL and the table plays it; the game's UI gets playback state and a pause/replay toggle as `audio`.
   - `turnTimeLimit` (optional) returns how many seconds the current turn may take. When it runs out, the server plays the game's `autoMove` for that player.
2. Write its table UI as a `GameUI` in `packages/web/src/games` and add it to `gameUIs`. It supplies the table centre, the cards beside each seat, the seat label, your hand, your action buttons and announcements. A game whose hand and buttons share state, or need a phone's full width, supplies one `Dock` instead of `Hand` and `Actions` (Hitster does).
   - Import the rules package with `import type` only, so hidden data such as Hitster's song years is not bundled into the client.

## Games

- **Hitster** (`packages/games/src/hitster`): each player builds a timeline of songs by release year. The table draws a song on your turn and you choose where it goes; a correct spot keeps the card, a wrong one discards it. First to 10 cards wins (5 or 8 as a setting).
  - Sound: the song being placed plays on every player's and spectator's device (a 30-second Deezer preview). Tapping the record pauses or replays it, and the speaker button in the top bar turns sound off for that device. Phones refuse to start sound until the page has been tapped, so a "tap anywhere to turn on sound" strip appears when that happens.
  - The browser is given an unguessable URL per song (`/api/rooms/CODE/track/...`) that the server streams from Deezer. It does not name the song and stops working when the turn ends, so the sound cannot be used to look up the year.
  - Not built yet: betting on other players' placements. The "Show title and artist" setting (off by default) shows the song's name as well, for playing without sound.
  - Songs come from `tools/songs/out/songs.json` (see `tools/songs/README.md`). Each game deals a random 300 of those that have a Deezer id. The list lives only on the server: a client is sent a song's year only once the card is face up, and never its Deezer id.
  - Cards use the Vinyl design from `docs/design/song-cards.html`, coloured by decade; the song being placed uses its face-down back.
- **Demo** (`packages/games/src/demo.ts`): not a real game. A round of highest-card-wins that exercises dealing, hidden cards, turns, a turn timer and scoring.

## How the engine works

- Every card lives in a **zone**: a deck, a discard pile, the spot in front of a player.
- Every card records **who may see its face**: everyone, nobody, or specific players.
- Each mechanic is a move between zones plus a visibility change: `deal`, `moveCard`, `reveal`, `peek`, `shuffle`.
- The server holds the full state and sends each client only `viewTable(state, viewer)`, where hidden faces are `null`. Spectators are the `null` viewer.
- Card ids are opaque and are reissued on every shuffle, so they cannot be used to track a card.
- Shuffles come from a seed stored in the state, so a game can be saved, restored and replayed.

A game implements `GameModule`: `setup`, `applyMove` (rejects illegal moves), `view` and `result`.
See `packages/games/src/demo.ts` for a complete example.

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
