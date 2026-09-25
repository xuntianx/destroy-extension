import { expect, it, vi } from "vitest";
import {
  AudioSessions,
  type AudioControl,
} from "../src/background/audio-sessions";
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function setup() {
  const data: { [key: string]: unknown } = { "session:7": "old" };
  const store = {
    get: vi.fn(async (key: string) => ({ [key]: data[key] })),
    set: vi.fn(async (items: object) => {
      Object.assign(data, items);
    }),
    remove: vi.fn(async (key: string) => {
      delete data[key];
    }),
  };
  return { data, store, sessions: new AudioSessions(store as any) };
}
const message = (
  token: string,
  seq: number,
  action = "heartbeat",
): AudioControl => ({ token, seq, action, phase: "DESTROYING", sound: true });
it("restores authorization after worker restart and rejects a foreign token without poisoning control", async () => {
  const s = setup(),
    live = message("old", 1);
  expect(await s.sessions.admit(7, live)).toBe("accepted");
  expect(await s.sessions.admit(7, message("foreign", 999))).toBe("rejected");
  expect(s.sessions.current(7, live)).toBe(true);
});
it("rejects a delayed old validation after a new session has been registered", async () => {
  const s = setup(),
    delayed = deferred<{ [key: string]: unknown }>();
  s.store.get.mockImplementationOnce(() => delayed.promise);
  const old = s.sessions.admit(7, message("old", 1));
  await vi.waitFor(() => expect(s.store.get).toHaveBeenCalledOnce());
  await s.sessions.open(7, "new");
  const live = message("new", 1);
  expect(await s.sessions.admit(7, live)).toBe("accepted");
  delayed.resolve({ "session:7": "old" });
  expect(await old).toBe("rejected");
  expect(s.sessions.current(7, live)).toBe(true);
});
it("does not let an invalid token erase valid authorization still pending after worker restart", async () => {
  const s = setup(),
    delayed = deferred<{ [key: string]: unknown }>();
  s.store.get.mockImplementationOnce(() => delayed.promise);
  const live = message("old", 1);
  const pending = s.sessions.admit(7, live);
  await vi.waitFor(() => expect(s.store.get).toHaveBeenCalledOnce());
  expect(await s.sessions.admit(7, message("foreign", 999))).toBe("rejected");
  delayed.resolve({ "session:7": "old" });
  expect(await pending).toBe("accepted");
  expect(s.sessions.current(7, live)).toBe(true);
});
it("orders old removal before a new token write and ignores a late stop for the old token", async () => {
  const s = setup(),
    removed = deferred<void>();
  await s.sessions.admit(7, message("old", 1));
  s.store.remove.mockImplementationOnce(async (key) => {
    await removed.promise;
    delete s.data[key];
  });
  const closing = s.sessions.close(7, "old");
  await vi.waitFor(() => expect(s.store.remove).toHaveBeenCalledOnce());
  const opening = s.sessions.open(7, "new");
  expect(s.data["session:7"]).toBe("old");
  removed.resolve();
  await Promise.all([closing, opening]);
  expect(s.data["session:7"]).toBe("new");
  await s.sessions.close(7, "old");
  expect(s.data["session:7"]).toBe("new");
  expect(s.store.remove).toHaveBeenCalledOnce();
});
it("invalidates pending authorization on tab close, including a late message waiting for removal", async () => {
  const s = setup(),
    delayed = deferred<{ [key: string]: unknown }>();
  s.store.get.mockImplementationOnce(() => delayed.promise);
  const pending = s.sessions.admit(7, message("old", 1));
  await vi.waitFor(() => expect(s.store.get).toHaveBeenCalledOnce());
  await s.sessions.close(7);
  delayed.resolve({ "session:7": "old" });
  expect(await pending).toBe("rejected");
  expect(await s.sessions.admit(7, message("old", 2))).toBe("rejected");
});
it("preserves ordered active effects while invalidating old control, pause and phase messages", async () => {
  const s = setup(),
    effect = message("old", 1, "effect"),
    heartbeat = message("old", 2);
  await s.sessions.admit(7, effect);
  await s.sessions.admit(7, heartbeat);
  expect(s.sessions.current(7, effect)).toBe(true);
  expect(await s.sessions.admit(7, effect)).toBe("stale");
  await s.sessions.admit(7, message("old", 3, "pause"));
  expect(s.sessions.current(7, effect)).toBe(false);
  expect(s.sessions.current(7, heartbeat)).toBe(false);
  await s.sessions.admit(7, { ...message("old", 4), phase: "RUINS" });
  expect(s.sessions.current(7, effect)).toBe(false);
});
