// @vitest-environment jsdom
import popupHtml from "../popup.html?raw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { strings } from "../src/shared/strings";
let api: any;
const flush = async () => {
  for (let n = 0; n < 20; n++) await Promise.resolve();
};
beforeEach(() => {
  vi.resetModules();
  document.documentElement.innerHTML = popupHtml;
  api = {
    storage: {
      local: {
        get: vi.fn(async () => ({ settings: { language: "zh" } })),
        set: vi.fn(async () => {}),
      },
    },
    i18n: { getUILanguage: () => "en-US" },
    commands: { getAll: vi.fn(async () => []) },
    runtime: {
      sendMessage: vi.fn(async () => ({ ok: false, error: "duplicate" })),
      getURL: (path: string) => path,
    },
    tabs: { create: vi.fn() },
  };
  vi.stubGlobal("chrome", api);
});
afterEach(() => vi.unstubAllGlobals());
async function language(value: string) {
  const select = document.querySelector<HTMLSelectElement>("#language")!;
  select.value = value;
  select.dispatchEvent(new Event("change"));
  await flush();
}
describe("bilingual popup", () => {
  it("translates an existing failure and the browser-language choice without resubmitting", async () => {
    await import("../src/popup/index");
    document.querySelector<HTMLButtonElement>("#summon")!.click();
    await flush();
    expect(document.querySelector("#notice")!.textContent).toBe(
      strings.zh.duplicate,
    );
    await language("en");
    expect(document.querySelector("#notice")!.textContent).toBe(
      strings.en.duplicate,
    );
    expect(document.querySelector('option[value="auto"]')!.textContent).toBe(
      strings.en.auto,
    );
    expect(document.title).toBe("Destroy");
    expect(api.runtime.sendMessage).toHaveBeenCalledOnce();
  });
  it("ignores old shortcut lookups after a language change", async () => {
    let resolve!: (commands: any[]) => void;
    api.commands.getAll.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    await import("../src/popup/index");
    await language("en");
    resolve([]);
    await flush();
    expect(document.querySelector("#shortcut")!.textContent).toBe(
      strings.en.unbound,
    );
  });
});
