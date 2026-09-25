import { afterEach, beforeEach, expect, it, vi } from "vitest";
let api: any, receive: any, removed: (tabId: number) => void;
let tokens: { [key: string]: unknown };
const event = () => ({ addListener: vi.fn() });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
beforeEach(async () => {
  vi.resetModules();
  tokens = { "session:7": "t7", "session:8": "t8" };
  api = {
    commands: { onCommand: event() },
    action: {},
    scripting: {},
    storage: {
      local: {},
      session: {
        get: vi.fn(async (key: string) => ({ [key]: tokens[key] })),
        set: vi.fn(async (values: object) => Object.assign(tokens, values)),
        remove: vi.fn(async (key: string) => {
          delete tokens[key];
        }),
      },
    },
    tabs: {
      onRemoved: {
        addListener: (fn: any) => {
          removed = fn;
        },
      },
    },
    offscreen: {
      Reason: { AUDIO_PLAYBACK: "AUDIO_PLAYBACK" },
      createDocument: vi.fn(async () => {}),
    },
    runtime: {
      id: "extension-id",
      getURL: (path: string) => "chrome-extension://extension-id/" + path,
      ContextType: { OFFSCREEN_DOCUMENT: "OFFSCREEN_DOCUMENT" },
      getContexts: vi.fn(async () => []),
      sendMessage: vi.fn(async () => ({ ok: true })),
      onInstalled: event(),
      onMessage: {
        addListener: (fn: any) => {
          receive = fn;
        },
      },
    },
  };
  vi.stubGlobal("chrome", api);
  await import("../src/background/index");
});
afterEach(() => vi.unstubAllGlobals());
const send = (tabId: number, seq: number, action = "heartbeat", extra = {}) =>
  new Promise<any>((resolve) => {
    receive(
      {
        type: "AUDIO",
        token: "t" + tabId,
        seq,
        action,
        phase: "DESTROYING",
        sound: true,
        musicElapsed: 4200,
        ...extra,
      },
      { id: "extension-id", tab: { id: tabId } },
      resolve,
    );
  });
it("coalesces the entire host lookup/creation and never revives audio paused or closed during creation", async () => {
  const query = deferred<any[]>(),
    creation = deferred<void>();
  api.runtime.getContexts.mockImplementation(() => query.promise);
  api.offscreen.createDocument.mockImplementation(() => creation.promise);
  const a = send(7, 1),
    b = send(8, 1);
  await vi.waitFor(() =>
    expect(api.runtime.getContexts).toHaveBeenCalledOnce(),
  );
  query.resolve([]);
  await vi.waitFor(() =>
    expect(api.offscreen.createDocument).toHaveBeenCalledOnce(),
  );
  removed(7);
  await send(8, 2, "pause");
  creation.resolve();
  await Promise.all([a, b]);
  const actions = api.runtime.sendMessage.mock.calls.map(
    ([m]: any[]) => m.action,
  );
  expect(actions).toContain("stop");
  expect(actions).toContain("pause");
  expect(actions).not.toContain("heartbeat");
  expect(api.runtime.getContexts).toHaveBeenCalledOnce();
});
it("checks latest pause again after the final asynchronous token read", async () => {
  const lateRead = deferred<any>();
  let reads = 0;
  api.storage.session.get.mockImplementation(async (key: string) => {
    if (++reads === 2) return lateRead.promise;
    return { [key]: tokens[key] };
  });
  api.runtime.getContexts.mockResolvedValue([{}]);
  const playing = send(7, 1);
  await vi.waitFor(() => expect(reads).toBe(2));
  await send(7, 2, "pause");
  lateRead.resolve({ "session:7": "t7" });
  await playing;
  expect(
    api.runtime.sendMessage.mock.calls.map(([m]: any[]) => m.action),
  ).toEqual(["pause"]);
});
it("recreates a missing host after silence using current phase offset without an old effect", async () => {
  api.runtime.getContexts.mockResolvedValueOnce([{}]).mockResolvedValue([]);
  await send(7, 1, "pause");
  expect(api.runtime.getContexts).not.toHaveBeenCalled();
  await send(7, 2, "heartbeat", { musicElapsed: 9300 });
  expect(api.offscreen.createDocument).not.toHaveBeenCalled();
  await send(7, 3, "heartbeat", { musicElapsed: 14500 });
  expect(api.offscreen.createDocument).toHaveBeenCalledOnce();
  expect(api.runtime.sendMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({ action: "heartbeat", musicElapsed: 14500 }),
  );
  expect(
    api.runtime.sendMessage.mock.calls.some(
      ([m]: any[]) => m.action === "effect",
    ),
  ).toBe(false);
});
it("can retry host creation after a failure", async () => {
  api.offscreen.createDocument.mockRejectedValueOnce(
    new Error("Host unavailable"),
  );
  expect(await send(7, 1)).toEqual({ ok: false });
  expect(await send(7, 2)).toEqual({ ok: true });
  expect(api.offscreen.createDocument).toHaveBeenCalledTimes(2);
});
