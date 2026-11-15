import { describe, expect, it } from "vitest";
import {
  describeSpot,
  dropIndex,
  edgeScroll,
  shiftPlacement,
} from "./hitster-placement";

describe("pointer insertion boundary", () => {
  it.each([
    { x: 10, centers: [], index: 0 },
    { x: 50, centers: [100, 200, 300], index: 0 },
    { x: 100, centers: [100, 200, 300], index: 1 },
    { x: 150, centers: [100, 200, 300], index: 1 },
    { x: 250, centers: [100, 200, 300], index: 2 },
    { x: 350, centers: [100, 200, 300], index: 3 },
    { x: 0, centers: [-50, 50, 150], index: 1 },
  ])(
    "maps viewport x=$x and $centers to boundary $index",
    ({ x, centers, index }) => {
      expect(dropIndex(x, centers)).toBe(index);
    },
  );
});

describe("keyboard insertion boundary", () => {
  it.each([
    { index: null, direction: 1, count: 3, next: 0 },
    { index: null, direction: -1, count: 3, next: 3 },
    { index: 0, direction: -1, count: 3, next: 0 },
    { index: 3, direction: 1, count: 3, next: 3 },
    { index: 1, direction: 1, count: 3, next: 2 },
    { index: 2, direction: -1, count: 3, next: 1 },
    { index: null, direction: 1, count: 0, next: 0 },
    { index: null, direction: -1, count: 0, next: 0 },
  ] as const)(
    "moves $index by $direction to $next",
    ({ index, direction, count, next }) => {
      expect(shiftPlacement(index, direction, count)).toBe(next);
    },
  );
});

it("ramps auto-scroll near edges and stops in the center or outside the timeline", () => {
  expect(edgeScroll(0, 0, 200)).toBe(-12);
  expect(edgeScroll(24, 0, 200)).toBe(-6);
  expect(edgeScroll(176, 0, 200)).toBe(6);
  expect(edgeScroll(200, 0, 200)).toBe(12);
  expect(edgeScroll(100, 0, 200)).toBe(0);
  expect(edgeScroll(-1, 0, 200)).toBe(0);
  expect(edgeScroll(201, 0, 200)).toBe(0);
  expect(edgeScroll(10, 0, 40)).toBe(-6);
  expect(edgeScroll(0, 0, 0)).toBe(0);
});

it("describes empty, first, middle and last tentative gaps", () => {
  const line = [{ year: 1984 }, { year: 1991 }];
  expect(describeSpot([], 0)).toBe("in your empty timeline");
  expect(describeSpot(line, 0)).toBe("before 1984");
  expect(describeSpot(line, 1)).toBe("between 1984 and 1991");
  expect(describeSpot(line, 2)).toBe("after 1991");
});
