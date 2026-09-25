import { describe, it, expect } from "vitest";
import { meleeStance, feedScroll } from "../src/content/director";
const box = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});
const reaches = { claw: { x: 175, y: 140 }, tail: { x: 201, y: 123 } };
describe("grounded attack and scroll director", () => {
  it("never moves the monster vertically to fake a distant contact", () => {
    expect(
      meleeStance(box(300, 60, 400, 80), reaches, 400, 1200, 476, "claw"),
    ).toBeUndefined();
    const stance = meleeStance(
      box(300, 510, 400, 80),
      reaches,
      400,
      1200,
      476,
      "claw",
    )!;
    expect(stance.point.y).toBe(540);
  });
  it("reaches left, center and right targets with a real in-bounds contact", () => {
    for (const [left, lane] of [
      [20, "left"],
      [500, "center"],
      [1030, "right"],
    ] as const) {
      const rect = box(left, 510, 150, 80),
        stance = meleeStance(rect, reaches, 400, 1200, 476, "claw")!;
      expect(stance.lane).toBe(lane);
      expect(stance.left).toBeGreaterThanOrEqual(8);
      expect(stance.left + 248).toBeLessThanOrEqual(1192);
      expect(stance.point.x).toBeGreaterThan(rect.left);
      expect(stance.point.x).toBeLessThan(rect.right);
    }
  });
  it("uses the alternate action only when that contact actually overlaps", () => {
    const stance = meleeStance(
      box(300, 517, 400, 15),
      reaches,
      400,
      1200,
      476,
      "claw",
    )!;
    expect(stance.action).toBe("tail");
    expect(stance.point.y).toBe(523);
  });
  it("feeds the next lower target to the strike line rather than scrolling an arbitrary screen", () => {
    const next = feedScroll(
      [{ rect: box(200, 760, 500, 100) }],
      540,
      1800,
      1800,
      720,
      6,
      9000,
    );
    expect(next).toBe(2055);
  });
  it("never revisits above-band or anchored content by scrolling", () => {
    expect(
      feedScroll(
        [
          { rect: box(200, 100, 500, 100) },
          { rect: box(0, 700, 100, 30), anchored: true },
        ],
        540,
        1800,
        1800,
        720,
        6,
        9000,
      ),
    ).toBeUndefined();
  });
  it("stops at either the initial screen budget or the document bottom", () => {
    const targets = [{ rect: box(100, 900, 500, 100) }];
    expect(feedScroll(targets, 540, 5300, 1800, 720, 6, 10000)).toBe(5400);
    expect(feedScroll(targets, 540, 5300, 1800, 720, 6, 5320)).toBe(5320);
    expect(feedScroll(targets, 540, 5400, 1800, 720, 6, 10000)).toBeUndefined();
  });
});
