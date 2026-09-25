// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UiBridge } from "../src/content/ui-bridge";
import { isUiEvent } from "../src/shared/ui-protocol";
import { StateMachine } from "../src/shared/core";

class Port {
  onmessage?: (event: { data: unknown }) => void;
  onmessageerror?: () => void;
  postMessage = vi.fn();
  close = vi.fn();
  deliver(data: unknown) {
    this.onmessage?.({ data });
  }
}
const pairs: { port1: Port; port2: Port }[] = [];
const bridges: UiBridge[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.stubGlobal(
    "MessageChannel",
    class {
      port1 = new Port();
      port2 = new Port();
      constructor() {
        pairs.push(this);
      }
    },
  );
});
afterEach(() => {
  bridges.splice(0).forEach((bridge) => bridge.dispose());
  pairs.length = 0;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function setup() {
  const event = vi.fn(),
    failure = vi.fn();
  const bridge = new UiBridge(
    "http://localhost/overlay.html",
    {
      language: "zh",
      question: "你愿意先做哪件事？",
    },
    event,
    failure,
  );
  bridges.push(bridge);
  document.body.append(bridge.frame);
  const promise = bridge.initialize();
  const post = vi
    .spyOn(bridge.frame.contentWindow!, "postMessage")
    .mockImplementation(() => {});
  bridge.frame.dispatchEvent(new Event("load"));
  const init = post.mock.calls[0][0] as { channel: string };
  return {
    bridge,
    event,
    failure,
    promise,
    post,
    channel: init.channel,
    port: pairs.at(-1)!.port1,
  };
}
describe("private interaction bridge", () => {
  it("leaves a healthy unanswered interface open indefinitely", async () => {
    const s = setup();
    s.port.deliver({ type: "ready", channel: s.channel });
    await s.promise;
    for (let second = 0; second < 120; second++) {
      vi.advanceTimersByTime(1000);
      const ping = s.port.postMessage.mock.calls.at(-1)![0];
      s.port.deliver({ ...ping, type: "pong" });
    }
    expect(s.failure).not.toHaveBeenCalled();
    expect(s.event).not.toHaveBeenCalled();
    expect(s.bridge.frame.isConnected).toBe(true);
  });
  it("cleans an initialized but silent frame, ignoring forged or stale acknowledgments", async () => {
    const s = setup();
    s.port.deliver({ type: "ready", channel: s.channel });
    await s.promise;
    vi.advanceTimersByTime(1000);
    const ping = s.port.postMessage.mock.calls.at(-1)![0];
    for (const data of [
      { ...ping, type: "pong", channel: "old" },
      { ...ping, type: "pong", id: ping.id + 1 },
      { ...ping, type: "pong", answer: "not allowed" },
    ])
      s.port.deliver(data);
    vi.advanceTimersByTime(8000);
    expect(s.failure).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ message: "Interface stopped responding" }),
    );
    expect(s.bridge.frame.isConnected).toBe(false);
    expect(s.event).not.toHaveBeenCalled();
  });
  it("does not expire during a hidden tab and starts a fresh probe on return", async () => {
    const s = setup();
    s.port.deliver({ type: "ready", channel: s.channel });
    await s.promise;
    vi.advanceTimersByTime(1000);
    const old = s.port.postMessage.mock.calls.at(-1)![0];
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(60000);
    expect(s.failure).not.toHaveBeenCalled();
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(1000);
    const fresh = s.port.postMessage.mock.calls.at(-1)![0];
    expect(fresh.id).toBeGreaterThan(old.id);
    s.port.deliver({ ...old, type: "pong" });
    vi.advanceTimersByTime(7000);
    expect(s.failure).not.toHaveBeenCalled();
    s.port.deliver({ ...fresh, type: "pong" });
    s.bridge.dispose();
    vi.advanceTimersByTime(60000);
    expect(s.failure).not.toHaveBeenCalled();
  });
  it("does not interpret a whole-browser scheduling stall as a dead child", async () => {
    const s = setup();
    s.port.deliver({ type: "ready", channel: s.channel });
    await s.promise;
    vi.advanceTimersByTime(1000);
    const ping = s.port.postMessage.mock.calls.at(-1)![0];
    vi.spyOn(performance, "now").mockReturnValue(61000);
    vi.advanceTimersByTime(1000);
    expect(s.failure).not.toHaveBeenCalled();
    s.port.deliver({ ...ping, type: "pong" });
    expect(s.bridge.frame.isConnected).toBe(true);
  });
  it("accepts only the transferred port and exact channel/control shape, never answer text", async () => {
    const s = setup();
    expect(s.post.mock.calls[0][1]).toBe("http://localhost");
    expect(s.post.mock.calls[0][2]).toEqual([pairs[0].port2]);
    s.port.deliver({ type: "answered", channel: s.channel });
    expect(s.event).not.toHaveBeenCalled();
    s.port.deliver({ type: "ready", channel: s.channel });
    await s.promise;
    for (const data of [
      { type: "answered", channel: "old-session" },
      { type: "answered", channel: s.channel, answer: "private" },
      { type: "skip", channel: s.channel },
    ])
      s.port.deliver(data);
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "answered", channel: s.channel },
      }),
    );
    expect(s.event).not.toHaveBeenCalled();
    s.port.deliver({ type: "answered", channel: s.channel });
    expect(s.event).toHaveBeenCalledExactlyOnceWith("answered");
    s.bridge.dispose();
    s.port.deliver({ type: "toggle-sound", channel: s.channel });
    expect(s.event).toHaveBeenCalledTimes(1);
    expect(s.port.close).toHaveBeenCalledOnce();
  });
  it("fails initialization after eight seconds and removes the dead frame", async () => {
    const s = setup();
    const rejected = expect(s.promise).rejects.toThrow(
      "Interface did not initialize",
    );
    vi.advanceTimersByTime(8000);
    await rejected;
    expect(s.failure).toHaveBeenCalledOnce();
    expect(s.bridge.frame.isConnected).toBe(false);
  });
  it.each(["navigation", "closed", "decode-error"])(
    "fails closed after %s",
    async (cause) => {
      const s = setup();
      s.port.deliver({ type: "ready", channel: s.channel });
      await s.promise;
      if (cause === "navigation")
        s.bridge.frame.dispatchEvent(new Event("load"));
      else if (cause === "closed")
        s.port.deliver({ type: "closed", channel: s.channel });
      else s.port.onmessageerror?.();
      expect(s.failure).toHaveBeenCalledOnce();
      expect(s.bridge.frame.isConnected).toBe(false);
      s.bridge.state({
        phase: "AWAITING_ANSWER",
        label: "test",
        sound: true,
        audioAvailable: true,
      });
      expect(s.port.postMessage).not.toHaveBeenCalled();
    },
  );
  it("cancels pending initialization without reporting another failure", async () => {
    const s = setup();
    const rejected = expect(s.promise).rejects.toThrow("Interface cancelled");
    s.bridge.dispose();
    await rejected;
    vi.advanceTimersByTime(10000);
    expect(s.failure).not.toHaveBeenCalled();
  });
  it("requires a string control type and admits the acknowledged answer only while waiting", () => {
    expect(
      isUiEvent({ channel: "x", type: { toString: () => "answered" } }, "x"),
    ).toBe(false);
    const state = new StateMachine();
    expect(state.acknowledgeAnswer()).toBe(false);
    state.move("SUMMONING");
    state.move("DESTROYING");
    expect(state.acknowledgeAnswer()).toBe(false);
    state.move("RUINS");
    state.move("AWAITING_ANSWER");
    expect(state.acknowledgeAnswer()).toBe(true);
    expect(state.acknowledgeAnswer()).toBe(false);
  });
});
