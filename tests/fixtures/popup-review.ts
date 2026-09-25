// Local visual fixture for the real popup UI; not a Chrome integration test.
import popup from "../../popup.html?raw";
let settings = { language: "zh" };
document.body.innerHTML = new DOMParser().parseFromString(popup, "text/html").body.innerHTML;
(globalThis as any).chrome = {
  storage: { local: {
    get: async () => ({ settings }),
    set: async (value: { settings: typeof settings }) => { settings = value.settings; },
  } },
  i18n: { getUILanguage: () => "zh-CN" },
  commands: { getAll: async () => [{ name: "summon-monster", shortcut: "Alt+Shift+D" }] },
  runtime: { getURL: (path: string) => "/" + path, sendMessage: async () => ({ ok: false, error: "unsupported" }) },
  tabs: { create: async () => {} },
};
await import("../../src/popup/index");
