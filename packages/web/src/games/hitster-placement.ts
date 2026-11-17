/** The insertion boundary under a pointer; midpoints are viewport coordinates in timeline order. */
export function crossedDragThreshold(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) > 7;
}

export function dropIndex(x: number, midpoints: readonly number[]): number {
  const index = midpoints.findIndex((middle) => x < middle);
  return index < 0 ? midpoints.length : index;
}

export function shiftPlacement(
  index: number | null,
  direction: -1 | 1,
  count: number,
): number {
  const start = index ?? (direction === 1 ? -1 : count + 1);
  return Math.max(0, Math.min(count, start + direction));
}

/** Scroll speed in pixels per 60Hz frame, ramping up near either edge. */
export function edgeScroll(x: number, left: number, right: number): number {
  if (x < left || x > right) return 0;
  const edge = Math.min(48, (right - left) / 2);
  if (edge <= 0) return 0;
  if (x < left + edge) return -12 * (1 - (x - left) / edge);
  if (x > right - edge) return 12 * (1 - (right - x) / edge);
  return 0;
}

export function describeSpot(
  line: readonly { year: number }[],
  index: number,
): string {
  if (line.length === 0) return "in your empty timeline";
  if (index === 0) return `before ${line[0]!.year}`;
  if (index === line.length) return `after ${line.at(-1)!.year}`;
  return `between ${line[index - 1]!.year} and ${line[index]!.year}`;
}
