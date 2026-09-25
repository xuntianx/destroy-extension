// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import {
  StyleLease,
  restoreAll,
  hideTarget,
  visualClone,
  type Target,
  collectTargets,
} from "../src/content/page";
describe("page ownership and recovery", () => {
  it("collects empty card paint and pseudo decorations separately from child text", () => {
    document.body.innerHTML =
      '<div id="card" style="background:white;border:1px solid gray"><p>Words</p><div id="dot" style="background:purple"></div><div id="pseudo"></div></div><div id="canvas" style="background:beige"></div>';
    const nodes = [...document.body.querySelectorAll<HTMLElement>("*")];
    nodes.forEach((el) => {
      el.getBoundingClientRect = () =>
        new DOMRect(
          0,
          0,
          el.id === "canvas" ? innerWidth : 200,
          el.id === "canvas" ? innerHeight : 100,
        );
    });
    const computed = window.getComputedStyle.bind(window);
    const spy = vi
      .spyOn(window, "getComputedStyle")
      .mockImplementation((el, pseudo) => {
        if (pseudo)
          return {
            content: el.id === "pseudo" ? '""' : "none",
          } as CSSStyleDeclaration;
        return computed(el);
      });
    try {
      const targets = collectTargets(nodes, document.documentElement);
      expect(
        targets.find((t) => t.element.tagName === "P")?.decoration,
      ).toBeUndefined();
      for (const id of ["card", "dot", "pseudo"])
        expect(targets.find((t) => t.element.id === id)?.decoration).toBe(true);
      expect(targets.some((t) => t.element.id === "canvas")).toBe(false);
    } finally {
      spy.mockRestore();
      document.body.replaceChildren();
    }
  });
  it("clears card paint without hiding its children and cancels pseudo effects on restore", () => {
    const element = document.createElement("div");
    element.innerHTML = "<textarea>draft</textarea>";
    document.body.append(element);
    const animations: {
      pause: ReturnType<typeof vi.fn>;
      cancel: ReturnType<typeof vi.fn>;
      currentTime: number;
    }[] = [];
    element.animate = vi.fn().mockImplementation(() => {
      const animation = { pause: vi.fn(), cancel: vi.fn(), currentTime: 0 };
      animations.push(animation);
      return animation;
    });
    const target: Target = {
      element,
      rect: new DOMRect(),
      fragments: [],
      kind: "card",
      decoration: true,
    };
    hideTarget(target);
    expect(element.animate).toHaveBeenNthCalledWith(
      1,
      expect.arrayContaining([
        expect.objectContaining({
          backgroundColor: "transparent",
          borderColor: "transparent",
        }),
      ]),
      expect.anything(),
    );
    expect(
      (element.animate as ReturnType<typeof vi.fn>).mock.calls[0][0][0].opacity,
    ).toBeUndefined();
    restoreAll([target]);
    expect(animations).toHaveLength(3);
    animations.forEach((a) => expect(a.cancel).toHaveBeenCalledTimes(1));
    expect(element.querySelector("textarea")?.value).toBe("draft");
    element.remove();
  });
  it("preserves website changes made while a property was leased", () => {
    const el = document.createElement("div");
    el.style.overflow = "auto";
    el.style.color = "red";
    const lease = new StyleLease();
    lease.set(el, "overflow", "hidden");
    el.style.overflow = "scroll";
    el.style.color = "blue";
    lease.restore();
    expect(el.style.overflow).toBe("scroll");
    expect(el.style.color).toBe("blue");
    lease.restore();
  });
  it("restores original priorities without replacing the style attribute", () => {
    const el = document.createElement("div");
    el.style.setProperty("overflow", "auto", "important");
    const lease = new StyleLease();
    lease.set(el, "overflow", "hidden");
    el.style.color = "blue";
    lease.restore();
    expect(el.style.getPropertyValue("overflow")).toBe("auto");
    expect(el.style.getPropertyPriority("overflow")).toBe("important");
    expect(el.style.color).toBe("blue");
  });
  it("only cancels its own opacity animation, keeps the original node and form values", () => {
    const el = document.createElement("textarea");
    el.value = "unsaved draft";
    document.body.append(el);
    const own = { pause: vi.fn(), cancel: vi.fn(), currentTime: 0 };
    el.animate = vi.fn().mockReturnValue(own);
    const siteCancel = vi.fn();
    el.getAnimations = vi.fn().mockReturnValue([{ cancel: siteCancel }]);
    const target: Target = {
      element: el,
      rect: el.getBoundingClientRect(),
      fragments: [],
      kind: "card",
    };
    hideTarget(target);
    restoreAll([target]);
    restoreAll([target]);
    expect(own.cancel).toHaveBeenCalledTimes(1);
    expect(siteCancel).not.toHaveBeenCalled();
    expect(el.isConnected).toBe(true);
    expect(el.value).toBe("unsaved draft");
  });
  it("sanitizes visual clones and masks password values", () => {
    const source = document.createElement("div");
    source.innerHTML =
      '<a id="same" onclick="bad()" href="javascript:bad()">Original <b>word</b></a><script>bad()</script><input type="password" value="secret">';
    const clone = visualClone(source, false);
    expect(
      clone.querySelector("[onclick],[id],[href],script,input"),
    ).toBeNull();
    expect(clone.textContent).toContain("Original word");
    expect(clone.textContent).not.toContain("secret");
  });
  it("retains inline image size and language without copying navigation behavior", () => {
    const source = document.createElement("p");
    source.lang = "en";
    source.innerHTML =
      '<a href="/outside"><img src="https://example.test/image.png" style="width:36px;height:26px;vertical-align:middle;margin:0 8px">A word</a>';
    document.body.append(source);
    const clone = visualClone(source, false);
    const img = clone.querySelector("img")!;
    expect(img.style.width).toBe("36px");
    expect(img.style.height).toBe("26px");
    expect(img.style.marginLeft).toBe("8px");
    expect(clone.lang).toBe("en");
    expect(clone.querySelector("a,[href]")).toBeNull();
    expect(source.querySelector("a")!.getAttribute("href")).toBe("/outside");
    source.remove();
  });
});
