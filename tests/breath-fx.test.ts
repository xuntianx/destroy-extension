import { expect, it } from "vitest";
import { breathAim } from "../src/content/breath-fx";
it("keeps the plume in the facing hemisphere even when sweep targets are above or behind the actor", () => {
  const mouth = { x: 600, y: 600 };
  for (const mirror of [false, true])
    for (const target of [
      { x: 1, y: 100 },
      { x: 600, y: 0 },
      { x: 1200, y: 100 },
      { x: 600, y: 720 },
    ]) {
      const end = breathAim(mouth, target, mirror),
        direction = mirror ? -1 : 1;
      const angle =
        (Math.atan2(end.y - mouth.y, (end.x - mouth.x) * direction) * 180) /
        Math.PI;
      expect(angle).toBeGreaterThanOrEqual(-55.0001);
      expect(angle).toBeLessThanOrEqual(25.0001);
      expect(Math.hypot(end.x - mouth.x, end.y - mouth.y)).toBeCloseTo(
        Math.hypot(target.x - mouth.x, target.y - mouth.y),
      );
    }
});
