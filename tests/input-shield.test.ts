// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { containOverlayInput } from "../src/content/input-shield";
const cleanup: (() => void)[] = [];
afterEach(() => {
  cleanup.splice(0).forEach((fn) => fn());
});
function setup() {
  const host = document.createElement("div"),
    root = host.attachShadow({ mode: "open" });
  root.innerHTML = "<form><textarea></textarea><button>Answer</button></form>";
  document.body.append(host);
  const controller = new AbortController();
  cleanup.push(() => {
    controller.abort();
    host.remove();
  });
  return {
    root,
    controller,
    input: root.querySelector("textarea")!,
    button: root.querySelector("button")!,
  };
}
describe("overlay event containment", () => {
  it("keeps input and IME target handlers while blocking previously registered page delegates", () => {
    const { root, controller, input } = setup();
    for (const type of [
      "keydown",
      "keyup",
      "input",
      "compositionstart",
      "compositionend",
      "paste",
    ]) {
      const page = vi.fn(),
        target = vi.fn();
      document.addEventListener(type, page, { signal: controller.signal });
      input.addEventListener(type, target, { signal: controller.signal });
      containOverlayInput(root, controller.signal);
      const event = new Event(type, {
        bubbles: true,
        composed: true,
        cancelable: true,
      });
      expect(input.dispatchEvent(event)).toBe(true);
      expect(target).toHaveBeenCalledOnce();
      expect(page).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    }
  });
  it("preserves local button behavior and removes the shield on cleanup", () => {
    const { root, controller, button } = setup();
    const page = vi.fn(),
      local = vi.fn();
    document.addEventListener("click", page);
    cleanup.push(() => document.removeEventListener("click", page));
    button.addEventListener("click", (e) => {
      e.preventDefault();
      local();
    });
    containOverlayInput(root, controller.signal);
    button.click();
    expect(local).toHaveBeenCalledOnce();
    expect(page).not.toHaveBeenCalled();
    controller.abort();
    button.click();
    expect(local).toHaveBeenCalledTimes(2);
    expect(page).toHaveBeenCalledOnce();
  });
  it("does not claim to isolate listeners already invoked in page capture", () => {
    const { root, controller, input } = setup();
    const capture = vi.fn(),
      bubble = vi.fn();
    document.addEventListener("keydown", capture, {
      capture: true,
      signal: controller.signal,
    });
    document.addEventListener("keydown", bubble, { signal: controller.signal });
    containOverlayInput(root, controller.signal);
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "x", composed: true, bubbles: true }),
    );
    expect(capture).toHaveBeenCalledOnce();
    expect(bubble).not.toHaveBeenCalled();
  });
});
