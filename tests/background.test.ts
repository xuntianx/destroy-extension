import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { strings } from "../src/shared/strings";
let api: any, command: (name: string) => void, active: boolean;
const event = () => ({ addListener: vi.fn() });
beforeEach(() => {
  vi.resetModules();
  active = true;
  api = {
    commands: {
      onCommand: {
        addListener: (fn: typeof command) => {
          command = fn;
        },
      },
    },
    i18n: { getUILanguage: () => "en-US" },
    action: {
      setBadgeText: vi.fn(async () => {}),
      setTitle: vi.fn(async () => {}),
    },
    storage: {
      local: {
        get: vi.fn(async () => ({
          settings: { language: "zh" },
          questionHistory: [],
        })),
        set: vi.fn(async () => {}),
      },
      session: { set: vi.fn(async () => {}), remove: vi.fn(async () => {}) },
    },
    scripting: { executeScript: vi.fn(async () => {}) },
    tabs: {
      query: vi.fn(async () => [{ id: 7 }]),
      get: vi.fn(async () => ({ url: "https://example.org/article" })),
      sendMessage: vi.fn(async (_id: number, message: any) =>
        message.type === "DESTROY_STATUS" ? { active } : { ok: true },
      ),
      onRemoved: event(),
    },
    runtime: { onInstalled: event(), onMessage: event() },
  };
  vi.stubGlobal("chrome", api);
});
afterEach(() => vi.unstubAllGlobals());
describe("summon toolbar feedback", () => {
  it("reports duplicate in the selected language and clears it on a later success", async () => {
    await import("../src/background/index");
    command("summon-monster");
    await vi.waitFor(() =>
      expect(api.action.setTitle).toHaveBeenCalledWith({
        tabId: 7,
        title: `Destroy: ${strings.zh.duplicate}`,
      }),
    );
    expect(api.storage.local.set).not.toHaveBeenCalled();
    active = false;
    api.action.setBadgeText.mockClear();
    api.action.setTitle.mockClear();
    command("summon-monster");
    await vi.waitFor(() =>
      expect(api.action.setTitle).toHaveBeenCalledWith({
        tabId: 7,
        title: "Destroy",
      }),
    );
    expect(api.action.setBadgeText).toHaveBeenCalledWith({
      tabId: 7,
      text: "",
    });
    expect(api.storage.local.set).toHaveBeenCalledOnce();
  });
  it("handles a closed tab instead of leaving an unhandled command failure", async () => {
    api.tabs.get.mockRejectedValue(new Error("Tab closed"));
    await import("../src/background/index");
    command("summon-monster");
    await vi.waitFor(() =>
      expect(api.action.setTitle).toHaveBeenCalledWith({
        tabId: 7,
        title: `Destroy: ${strings.zh.failed}`,
      }),
    );
    expect(api.scripting.executeScript).not.toHaveBeenCalled();
  });
});
