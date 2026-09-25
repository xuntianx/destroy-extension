// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { SessionClock } from "../src/content/clock";
afterEach(() => vi.unstubAllGlobals());
describe("foreground session time", () => {
  it("counts long foreground frames instead of silently stretching the sixty-second budget", async () => {
    let tick: (time: number) => void = () => {};
    vi.stubGlobal("requestAnimationFrame", (cb: typeof tick) => {
      tick = cb;
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    Object.defineProperty(document, "hidden", {
      value: false,
      configurable: true,
    });
    const clock = new SessionClock((e) => {
      throw e;
    });
    let progress = 0;
    const done = clock.animate(3000, (p) => (progress = p));
    tick(100);
    tick(5100);
    await done;
    expect(clock.time).toBe(5000);
    expect(progress).toBe(1);
    clock.cancel();
  });
  it("does not charge hidden-tab time on resume", async () => {
    let tick: (time: number) => void = () => {};
    vi.stubGlobal("requestAnimationFrame", (cb: typeof tick) => {
      tick = cb;
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    Object.defineProperty(document, "hidden", {
      value: false,
      configurable: true,
    });
    const clock = new SessionClock((e) => {
      throw e;
    });
    const done = clock.animate(2000, () => {});
    tick(10);
    tick(1010);
    Object.defineProperty(document, "hidden", {
      value: true,
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    tick(40000);
    expect(clock.time).toBe(1000);
    Object.defineProperty(document, "hidden", {
      value: false,
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    tick(50000);
    tick(51000);
    await done;
    expect(clock.time).toBe(2000);
    clock.cancel();
  });
});
