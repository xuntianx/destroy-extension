export type Action = "claw" | "tail";
export type Point = { x: number; y: number };
export type Box = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
};
export type Stance = {
  action: Action;
  left: number;
  mirror: boolean;
  point: Point;
  lane: "left" | "center" | "right";
};
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
/** Vertical position is fixed by the ground. Only a horizontal stance may be selected. */
export function meleeStance(
  rect: Box,
  reaches: Record<Action, Point>,
  top: number,
  width: number,
  currentLeft: number,
  preferred: Action,
): Stance | undefined {
  const center = (rect.left + rect.right) * 0.5;
  const lane =
    center < width / 3 ? "left" : center > (width * 2) / 3 ? "right" : "center";
  const mirror =
    lane === "left" || (lane === "center" && center < currentLeft + 124);
  for (const action of [
    preferred,
    preferred === "claw" ? "tail" : "claw",
  ] as Action[]) {
    const reach = reaches[action],
      y = top + reach.y;
    if (y < rect.top + 1 || y > rect.bottom - 1) continue;
    const localX = mirror ? 248 - reach.x : reach.x;
    const minLeft = Math.max(8, rect.left + 2 - localX),
      maxLeft = Math.min(width - 256, rect.right - 2 - localX);
    if (minLeft > maxLeft) continue;
    const nominal =
      lane === "left" ? 8 : lane === "right" ? width - 256 : width / 2 - 124;
    const left = clamp(nominal, minLeft, maxLeft),
      x = left + localX;
    if (x < 8 || x > width - 8) continue;
    return { action, left, mirror, point: { x, y }, lane };
  }
}
/** Feed the next lower target into the strike line; never scroll backward to missed content. */
export function feedScroll(
  targets: { rect: Box; anchored?: boolean }[],
  strikeY: number,
  current: number,
  initial: number,
  height: number,
  screens: number,
  maximum: number,
): number | undefined {
  const lower = targets
    .filter((t) => !t.anchored && t.rect.top > strikeY && t.rect.right > 0)
    .sort((a, b) => a.rect.top - b.rect.top)[0];
  if (!lower) return undefined;
  const desired =
    current + lower.rect.top + Math.min(35, lower.rect.height * 0.5) - strikeY;
  const limit = Math.min(maximum, initial + (screens - 1) * height);
  const next = Math.min(desired, current + height * 0.65, limit);
  return next > current + 1 ? next : undefined;
}
