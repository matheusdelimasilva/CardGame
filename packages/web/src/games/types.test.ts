import { expectTypeOf, it } from "vitest";
import type {
  DemoMove,
  DemoView,
  HitsterMove,
  HitsterView,
} from "@cardgame/games";
import type { GameProps, GameUI } from "./types";
import type { demoUI } from "./demo";
import type { hitsterUI } from "./hitster";

it("keeps each game's concrete view and move types in its UI", () => {
  expectTypeOf<typeof demoUI>().toEqualTypeOf<GameUI<DemoView, DemoMove>>();
  expectTypeOf<typeof hitsterUI>().toEqualTypeOf<
    GameUI<HitsterView, HitsterMove>
  >();
  expectTypeOf<
    GameProps<HitsterView, HitsterMove>["game"]["view"]
  >().toEqualTypeOf<HitsterView>();
  expectTypeOf<
    GameProps<DemoView, DemoMove>["move"]
  >().parameters.toEqualTypeOf<[move: DemoMove]>();
});
