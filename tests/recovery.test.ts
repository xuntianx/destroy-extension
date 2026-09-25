import { expect, it } from "vitest";
import { recoveryFrame } from "../src/content/recovery";

it("keeps each text line's own destination and restores its full geometry before revealing the original", () => {
  const from = { x: 40, y: 660, rotation: -17, scale: 0.68 };
  const target = { left: 300, top: 140 };
  const top = recoveryFrame(from, target, { left: 0, top: 0 }, 0.88);
  const second = recoveryFrame(from, target, { left: 0, top: 28 }, 0.88);
  expect(top.rotation).toBeCloseTo(0);
  expect(second.rotation).toBeCloseTo(0);
  expect(top).toMatchObject({
    x: 300,
    y: 140,
    scale: 1,
    opacity: 1,
    arrived: false,
  });
  expect(second).toMatchObject({
    x: 300,
    y: 168,
    scale: 1,
    opacity: 1,
  });
  expect(recoveryFrame(from, target, { left: 0, top: 28 }, 0.9).arrived).toBe(
    true,
  );
  expect(
    recoveryFrame(from, target, { left: 0, top: 28 }, 1).opacity,
  ).toBeCloseTo(0);
});

it("starts continuously from rubble and stays legible through the travel phase", () => {
  const from = { x: 100, y: 500, rotation: 12, scale: 0.6 };
  const target = { left: 330, top: 110 };
  expect(recoveryFrame(from, target, { left: 30, top: 20 }, 0)).toMatchObject({
    ...from,
    opacity: 1,
  });
  const middle = recoveryFrame(from, target, { left: 30, top: 20 }, 0.5);
  expect(middle.x).toBeGreaterThan(from.x);
  expect(middle.x).toBeLessThan(360);
  expect(middle.scale).toBeGreaterThan(0.6);
  expect(middle.opacity).toBe(1);
  expect(recoveryFrame(from, target, { left: 30, top: 20 }, 0.75).opacity).toBe(
    1,
  );
});
