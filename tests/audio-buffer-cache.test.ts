import { describe, expect, it, vi } from "vitest";
import { AudioBufferCache, pcmBytes } from "../src/audio/buffer-cache";

const buffer = (frames = 10, channels = 2) =>
  ({ length: frames, numberOfChannels: channels }) as AudioBuffer;
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

describe("decoded PCM ownership", () => {
  it("counts actual frames and channels, and shares pending and completed decodes", async () => {
    const decode = vi.fn(async () => buffer());
    const cache = new AudioBufferCache(decode);
    const first = cache.load("music");
    expect(cache.load("music")).toBe(first);
    await first;
    expect(cache.load("music")).toBe(first);
    expect(decode).toHaveBeenCalledTimes(1);
    expect(cache.snapshot()).toMatchObject({
      cachedBytes: 80,
      decodedFiles: 1,
      pendingFiles: 0,
    });
    expect(pcmBytes(buffer(48000, 2))).toBe(384000);
    expect(() => pcmBytes(buffer(NaN))).toThrow();
    cache.close();
  });

  it("enforces an aggregate byte budget across concurrent completions", async () => {
    const cache = new AudioBufferCache(async () => buffer(), 100);
    const results = await Promise.allSettled([
      cache.load("a"),
      cache.load("b"),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    expect(cache.snapshot()).toMatchObject({
      cachedBytes: 80,
      decodedFiles: 1,
      pendingFiles: 0,
    });
    cache.close();
  });

  it("limits fetch/decode concurrency to two, then drains the queue", async () => {
    const resolvers: Array<(value: AudioBuffer) => void> = [];
    const decode = vi.fn(
      () => new Promise<AudioBuffer>((resolve) => resolvers.push(resolve)),
    );
    const cache = new AudioBufferCache(decode);
    const pending = ["a", "b", "c", "d"].map((id) => cache.load(id));
    await flush();
    expect(decode).toHaveBeenCalledTimes(2);
    resolvers[0](buffer());
    await flush();
    expect(decode).toHaveBeenCalledTimes(3);
    resolvers[1](buffer());
    await flush();
    expect(decode).toHaveBeenCalledTimes(4);
    resolvers[2](buffer());
    resolvers[3](buffer());
    await Promise.all(pending);
    await flush();
    expect(cache.snapshot()).toMatchObject({
      activeDecodes: 0,
      cachedBytes: 320,
    });
    cache.close();
  });

  it("aborts fetches, rejects queued work, and does not retain late decodes after disposal", async () => {
    const resolvers: Array<(value: AudioBuffer) => void> = [];
    const signals: AbortSignal[] = [];
    const decode = vi.fn((_id: string, signal: AbortSignal) => {
      signals.push(signal);
      return new Promise<AudioBuffer>((resolve) => resolvers.push(resolve));
    });
    const cache = new AudioBufferCache(decode);
    const pending = Promise.allSettled([
      cache.load("a"),
      cache.load("b"),
      cache.load("c"),
    ]);
    await flush();
    cache.close();
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    resolvers.forEach((resolve) => resolve(buffer()));
    expect(
      (await pending).every((result) => result.status === "rejected"),
    ).toBe(true);
    await flush();
    expect(decode).toHaveBeenCalledTimes(2);
    expect(cache.snapshot()).toMatchObject({
      cachedBytes: 0,
      decodedFiles: 0,
      pendingFiles: 0,
      activeDecodes: 0,
    });
    await expect(cache.load("d")).rejects.toThrow("closed");
  });

  it("retries a failed file without corrupting retained byte accounting", async () => {
    const decode = vi
      .fn()
      .mockRejectedValueOnce(Error("decode failed"))
      .mockResolvedValue(buffer());
    const cache = new AudioBufferCache(decode);
    await expect(cache.load("a")).rejects.toThrow("decode failed");
    expect(cache.snapshot().cachedBytes).toBe(0);
    await cache.load("a");
    expect(cache.snapshot().cachedBytes).toBe(80);
    cache.close();
    expect(cache.snapshot().cachedBytes).toBe(0);
  });
});
