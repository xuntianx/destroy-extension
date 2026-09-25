import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioMixer } from "../src/audio/mixer";
import { musicFor, type AudioMessage } from "../src/audio/catalog";
const param = () => ({
  value: 1,
  cancelScheduledValues: vi.fn(),
  setTargetAtTime: vi.fn(),
  setValueAtTime: vi.fn(),
  linearRampToValueAtTime: vi.fn(),
});
const node = () => ({
  connect: vi.fn(function (this: unknown) {
    return this;
  }),
  disconnect: vi.fn(),
});
function fakeContext() {
  const start = Date.now();
  const sources: any[] = [],
    gains: any[] = [];
  return {
    sources,
    gains,
    state: "running",
    destination: {},
    get currentTime() {
      return (Date.now() - start) / 1000;
    },
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    decodeAudioData: vi.fn(async () => ({
      duration: 10,
      length: 480000,
      numberOfChannels: 2,
    })),
    createGain: () => {
      const n = { ...node(), gain: param() };
      gains.push(n);
      return n;
    },
    createStereoPanner: () => ({ ...node(), pan: param() }),
    createDynamicsCompressor: () => ({
      ...node(),
      threshold: param(),
      knee: param(),
      ratio: param(),
      attack: param(),
      release: param(),
    }),
    createBufferSource: () => {
      const n = {
        ...node(),
        start: vi.fn(),
        stop: vi.fn(),
        buffer: null,
        onended: null,
      };
      sources.push(n);
      return n;
    },
  };
}
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
let context: ReturnType<typeof fakeContext>, mixer: AudioMixer, seq: number;
const message = (overrides: Partial<AudioMessage> = {}): AudioMessage => ({
  type: "AUDIO",
  tabId: 1,
  token: "a",
  seq: ++seq,
  action: "heartbeat",
  phase: "DESTROYING",
  musicElapsed: 0,
  sentAt: Date.now(),
  sound: true,
  volume: 0.5,
  musicVolume: 0.55,
  effectsVolume: 0.8,
  ...overrides,
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-22T00:00:00Z"));
  seq = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(1),
    })),
  );
  context = fakeContext();
  mixer = new AudioMixer(
    (f) => f,
    () => context as unknown as AudioContext,
  );
});
afterEach(() => {
  mixer.dispose();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("audio ownership and timeline", () => {
  it("alternates distinct source buffers for the actual restoration event", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    await mixer.handle(
      message({ phase: "PREPARING", action: "effect", event: "assemble" }),
    );
    await vi.advanceTimersByTimeAsync(100);
    await mixer.handle(
      message({ phase: "PREPARING", action: "effect", event: "assemble" }),
    );
    await vi.advanceTimersByTimeAsync(100);
    await mixer.handle(
      message({ phase: "PREPARING", action: "effect", event: "assemble" }),
    );
    expect(vi.mocked(fetch).mock.calls.map((call) => call[0])).toEqual([
      "assemble.opus",
      "assemble1.opus",
    ]);
    expect(context.sources).toHaveLength(3);
    expect(context.sources[0].buffer).not.toBe(context.sources[1].buffer);
    expect(context.sources[2].buffer).toBe(context.sources[0].buffer);
    vi.mocked(Math.random).mockRestore();
  });
  it("shares music between adjacent stages but has five distinct sections", () => {
    expect(musicFor("FINAL_BLAST")).toBe(musicFor("DESTROYING"));
    expect(musicFor("AWAITING_ANSWER")).toBe(musicFor("RUINS"));
    expect(musicFor("RETURNING")).toBe(musicFor("RESTORING"));
    expect(
      new Set(
        ["SUMMONING", "DESTROYING", "RUINS", "RESTORING", "SLEEPING"].map((p) =>
          musicFor(p as any),
        ),
      ).size,
    ).toBe(5);
  });
  it("schedules overlapping sources for a loop and never restarts it on heartbeat", async () => {
    await mixer.handle(message());
    await flush();
    expect(context.sources).toHaveLength(1);
    await mixer.handle(message({ musicElapsed: 5 }));
    await flush();
    expect(context.sources).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(9700);
    expect(context.sources).toHaveLength(2);
    const first = context.sources[0],
      second = context.sources[1];
    expect(second.start.mock.calls[0][0]).toBeLessThan(
      first.stop.mock.calls[0][0],
    );
    expect(
      first.stop.mock.calls[0][0] - second.start.mock.calls[0][0],
    ).toBeCloseTo(0.12);
  });
  it("pause stops every voice, stale messages cannot revive it, resume uses current offset", async () => {
    await mixer.handle(message());
    await flush();
    const old = message();
    await mixer.handle(message({ action: "pause" }));
    expect(context.sources[0].stop).toHaveBeenLastCalledWith(0.06);
    await mixer.handle(old);
    await flush();
    expect(context.sources).toHaveLength(1);
    await mixer.handle(message({ musicElapsed: 25 }));
    await flush();
    expect(context.sources[1].start.mock.calls[0][1]).toBeCloseTo(25 % 9.88);
  });
  it("pending decode cannot produce ghost music after stop", async () => {
    let resolve!: (x: any) => void;
    context.decodeAudioData.mockImplementation(
      () => new Promise((r) => (resolve = r)),
    );
    await mixer.handle(message());
    await flush();
    mixer.stop(1);
    resolve({ duration: 10, length: 480000, numberOfChannels: 2 });
    await flush();
    expect(context.sources).toHaveLength(0);
  });
  it("keeps tabs isolated and ignores a stale token stop", async () => {
    await mixer.handle(message());
    await mixer.handle(message({ tabId: 2, token: "b" }));
    await flush();
    mixer.stop(1, "old-token");
    expect(context.sources[0].stop).not.toHaveBeenLastCalledWith();
    mixer.stop(1, "a");
    expect(context.sources[0].stop).toHaveBeenLastCalledWith();
    expect(context.sources[1].stop).not.toHaveBeenLastCalledWith();
  });
  it("does not discard simultaneous hit and debris effects", async () => {
    await Promise.all([
      mixer.handle(
        message({ phase: "PREPARING", action: "effect", event: "claw" }),
      ),
      mixer.handle(
        message({ phase: "PREPARING", action: "effect", event: "debris" }),
      ),
    ]);
    expect(context.sources).toHaveLength(2);
  });
  it("drops delayed effects and enforces the six-voice cap", async () => {
    await mixer.handle(
      message({
        phase: "PREPARING",
        action: "effect",
        event: "claw",
        sentAt: Date.now() - 500,
      }),
    );
    expect(context.sources).toHaveLength(0);
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(100);
      await mixer.handle(
        message({ phase: "PREPARING", action: "effect", event: "claw" }),
      );
    }
    expect(context.sources).toHaveLength(6);
  });
  it("updates three independent buses and expires orphaned sessions", async () => {
    await mixer.handle(
      message({ volume: 0.2, musicVolume: 0.3, effectsVolume: 0.4 }),
    );
    await flush();
    for (const [index, level] of [
      [0, 0.2],
      [1, 0.3],
      [2, 0.4],
    ])
      expect(
        context.gains[index].gain.setTargetAtTime,
      ).toHaveBeenLastCalledWith(level, 0, 0.015);
    mixer.sweep(Date.now() + 15001);
    expect(context.sources[0].stop).toHaveBeenLastCalledWith();
  });
  it("converts a deadline to the audio clock and ducks at impact, not at receipt", async () => {
    await mixer.handle(
      message({
        phase: "PREPARING",
        action: "effect",
        event: "claw",
        dueAt: Date.now() + 120,
      }),
    );
    expect(context.sources).toHaveLength(1);
    expect(context.sources[0].start).toHaveBeenCalledWith(0.12);
    expect(context.gains[3].gain.setTargetAtTime).toHaveBeenCalledWith(
      0.42,
      0.12,
      0.012,
    );
  });
  it("cancels unplayed impacts immediately on pause and permits re-planning", async () => {
    await mixer.handle(
      message({
        phase: "PREPARING",
        action: "effect",
        event: "claw",
        dueAt: Date.now() + 120,
      }),
    );
    await mixer.handle(message({ phase: "PREPARING", action: "pause" }));
    expect(context.sources[0].stop).toHaveBeenLastCalledWith();
    await vi.advanceTimersByTimeAsync(20);
    await mixer.handle(
      message({
        phase: "PREPARING",
        action: "effect",
        event: "claw",
        dueAt: Date.now() + 100,
      }),
    );
    expect(context.sources).toHaveLength(2);
  });
  it("drops an impact if decoding misses its deadline or its plan is too far ahead", async () => {
    await mixer.handle(
      message({
        phase: "PREPARING",
        action: "effect",
        event: "claw",
        dueAt: Date.now() + 400,
      }),
    );
    expect(context.sources).toHaveLength(0);
    let resolve!: (buffer: any) => void;
    context.decodeAudioData.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const pending = mixer.handle(
      message({
        phase: "PREPARING",
        action: "effect",
        event: "claw",
        dueAt: Date.now() + 100,
      }),
    );
    await flush();
    await vi.advanceTimersByTimeAsync(200);
    resolve({ duration: 1, length: 48000, numberOfChannels: 2 });
    await pending;
    expect(context.sources).toHaveLength(0);
  });
  it("cancels future effects when the session changes phase", async () => {
    await mixer.handle(
      message({
        phase: "PREPARING",
        action: "effect",
        event: "claw",
        dueAt: Date.now() + 120,
      }),
    );
    await mixer.handle(message({ phase: "RUINS" }));
    expect(context.sources[0].stop).toHaveBeenLastCalledWith();
  });
  it("cancels a moved target's pending impact while leaving the music running", async () => {
    await mixer.handle(message());
    await flush();
    await mixer.handle(
      message({ action: "effect", event: "claw", dueAt: Date.now() + 120 }),
    );
    await mixer.handle(message({ action: "cancel-effects" }));
    expect(context.sources[1].stop).toHaveBeenLastCalledWith();
    expect(context.sources[0].stop).not.toHaveBeenLastCalledWith();
  });
});
