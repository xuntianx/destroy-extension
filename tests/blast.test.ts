import { expect, it } from "vitest";
import { blastImpactTimes } from "../src/content/blast";

it("preserves a visible sweep even when a long page has hundreds of offscreen targets", () => {
  const visible = [true, true, true, ...Array(400).fill(false)];
  const times = blastImpactTimes(visible, 0.46, 0.9);
  expect(times.slice(0, 3)).toEqual([0.46, 0.68, 0.9]);
  expect(Math.max(...times)).toBe(0.9);
  expect(times.slice(3).every((t) => t >= 0.46 && t <= 0.9)).toBe(true);
});

it("keeps a sole visible target until the end of a multi-target sweep", () => {
  expect(blastImpactTimes([false, true, false], 0.46, 0.9)).toEqual([
    0.46, 0.9, 0.9,
  ]);
  expect(blastImpactTimes([], 0.46, 0.9)).toEqual([]);
});
