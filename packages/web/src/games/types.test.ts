import { expectTypeOf, it } from "vitest";
import type { HitsterMove, HitsterView } from "@cardgame/games";
import type { GameProps, GameUI } from "./types";
import type { hitsterUI } from "./hitster";

it("keeps each game's concrete view and move types in its UI", () => {
  expectTypeOf<typeof hitsterUI>().toEqualTypeOf<
    GameUI<HitsterView, HitsterMove>
  >();
  expectTypeOf<
    GameProps<HitsterView, HitsterMove>["game"]["view"]
  >().toEqualTypeOf<HitsterView>();
  expectTypeOf<
    GameProps<HitsterView, HitsterMove>["move"]
  >().parameters.toEqualTypeOf<[move: HitsterMove]>();
});
