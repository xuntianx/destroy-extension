import { expect, it } from "vitest";
import {
  motionFrame,
  motionDuration,
  motionMarkers,
  type MotionName,
} from "../src/content/motions";
import { neutral } from "../src/content/rig.js";
it("places landing on the ground and settles to neutral before the first attack", () => {
  expect(motionFrame("entrance", 0).opacity).toBe(0);
  expect(motionFrame("entrance", 0.35).y).toBeLessThan(-30);
  const land = motionFrame("entrance", motionMarkers.entrance.landing);
  expect(land.x).toBeCloseTo(0);
  expect(land.y).toBeCloseTo(0);
  const finish = motionFrame("entrance", 1);
  for (const key of Object.keys(neutral) as (keyof typeof neutral)[])
    expect(finish.pose[key]).toBeCloseTo(neutral[key]);
});
it("keeps the jaw open while the breath effect is visible and ends in neutral", () => {
  for (const p of [0.39, 0.57, 0.85]) {
    const frame = motionFrame("breath", p);
    expect(frame.beam).toBe(true);
    expect(frame.pose.jawOpen).toBeGreaterThan(0.9);
  }
  expect(motionFrame("breath", 1).beam).toBe(false);
  expect(motionFrame("breath", 1).pose.jawOpen).toBe(0);
});
it("closes the eyes progressively, keeps sleep visible, then fades away", () => {
  expect(motionFrame("sleep", 0).pose.eyesClosed).toBe(0);
  expect(motionFrame("sleep", 0.125).pose.eyesClosed).toBeCloseTo(0.5);
  expect(motionFrame("sleep", 0.5).pose.eyesClosed).toBe(1);
  expect(motionFrame("sleep", 0.5).opacity).toBe(1);
  expect(motionFrame("sleep", 1).opacity).toBe(0);
  for (const key of Object.keys(neutral) as (keyof typeof neutral)[])
    expect(motionFrame("sleep", 0).pose[key]).toBeCloseTo(neutral[key]);
});
it("can seek all five actions backward without retaining a previous pose", () => {
  const names = Object.keys(motionDuration) as MotionName[];
  expect(names).toHaveLength(5);
  for (const name of names) {
    const baseline = motionFrame(name, 0.2);
    motionFrame(name, 1);
    expect(motionFrame(name, 0.2)).toEqual(baseline);
    for (let i = 0; i <= 100; i++) {
      const frame = motionFrame(name, i / 100);
      expect(Object.values(frame.pose).every(Number.isFinite)).toBe(true);
      expect(frame.opacity).toBeGreaterThanOrEqual(0);
      expect(frame.opacity).toBeLessThanOrEqual(1);
    }
  }
});
