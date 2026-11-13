# CardGame

A web platform for social card games: 2 to 8 players around a round table, on phones and computers.
One player signs in with an email code and hosts; everyone else joins from a shared link with just a nickname.

## Status

| Step | State |
|---|---|
| 1. Engine: cards, zones, visibility, per-player views | Done |
| 2. Demo game (High Card) on the engine | Done |
| 3. Server: rooms, join by link, seats, spectators, reconnect | Not started |
| 4. Round-table web client | Not started |
| 5. Email login for hosts, game history | Not started |
| 6. Deploy | Not started |

## Layout

- `packages/engine`: game-agnostic building blocks. No network code.
- `packages/games`: one module per game.
- `packages/server` and `packages/web`: to come.

## How the engine works

- Every card lives in a **zone**: a deck, a discard pile, the spot in front of a player.
- Every card records **who may see its face**: everyone, nobody, or specific players.
- Each mechanic is a move between zones plus a visibility change: `deal`, `moveCard`, `reveal`, `peek`, `shuffle`.
- The server holds the full state and sends each client only `viewTable(state, viewer)`, where hidden faces are `null`. Spectators are the `null` viewer.
- Card ids are opaque and are reissued on every shuffle, so they cannot be used to track a card.
- Shuffles come from a seed stored in the state, so a game can be saved, restored and replayed.

A game implements `GameModule`: `setup`, `applyMove` (rejects illegal moves), `view` and `result`.
See `packages/games/src/high-card.ts` for a complete example.

## Commands

```
pnpm install
pnpm test
pnpm typecheck
```
