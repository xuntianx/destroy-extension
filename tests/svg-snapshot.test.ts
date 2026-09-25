// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { visualClone, cloneVisualTemplate } from "../src/content/fragments";
import { analyzePage, hideTarget, restoreAll } from "../src/content/page";

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
function fixture() {
  document.body.innerHTML = `<svg id="drawing" width="160" height="80" viewBox="0 0 160 80" onclick="bad()">
  <defs><linearGradient id="paint"><stop style="stop-color:gold"/><stop offset="1" style="stop-color:green"/></linearGradient><clipPath id="clip"><rect width="150" height="75"/></clipPath><g id="leaf"><path d="M0 0L10 20Z"/></g></defs>
  <rect width="160" height="80" style="fill:url(#paint);clip-path:url(#clip)"/><use href="#leaf" x="20"/>
  <use href="https://example.com/foreign.svg#leaf"/>
  <script>bad()</script><foreignObject><button>bad</button></foreignObject><image href="https://example.com/a.png"/><animate attributeName="opacity"/>
  </svg>`;
  return document.querySelector("svg")!;
}
it("copies static geometry and own references without behavior or external resources", () => {
  const original = fixture(),
    before = original.outerHTML;
  const result = visualClone(original);
  expect(result.querySelector("svg")!.getAttribute("viewBox")).toBe(
    "0 0 160 80",
  );
  expect(
    result.querySelector("script,foreignObject,button,image,animate,[onclick]"),
  ).toBeNull();
  expect(result.querySelector("#paint,#clip,#leaf,#drawing")).toBeNull();
  const gradient = result.querySelector("linearGradient")!,
    clip = result.querySelector("clipPath")!;
  const rect = result.querySelector("svg > rect") as SVGElement;
  expect(rect.style.fill).toContain("#" + gradient.id);
  expect(rect.style.clipPath).toContain("#" + clip.id);
  const uses = result.querySelectorAll("use");
  expect(uses[0].getAttribute("href")).toBe(
    "#" + result.querySelector("g")!.id,
  );
  expect(uses[1].hasAttribute("href")).toBe(false);
  expect(original.outerHTML).toBe(before);
});
it("gives each fragment independent definitions and retains references after another fragment disappears", () => {
  const template = visualClone(fixture());
  const a = cloneVisualTemplate(template),
    b = cloneVisualTemplate(template);
  document.body.append(a, b);
  const idsA = new Set([...a.querySelectorAll("[id]")].map((n) => n.id));
  expect([...b.querySelectorAll("[id]")].some((n) => idsA.has(n.id))).toBe(
    false,
  );
  a.remove();
  const gradient = b.querySelector("linearGradient")!;
  expect((b.querySelector("svg > rect") as SVGElement).style.fill).toContain(
    "#" + gradient.id,
  );
  expect(b.querySelector("use")!.getAttribute("href")).toBe(
    "#" + b.querySelector("g")!.id,
  );
});
it("keeps inline SVG and its computed paint", () => {
  const p = document.createElement("p");
  p.innerHTML =
    '文字 <svg width="24" height="24"><path d="M0 0L10 20Z" style="fill:rgb(10, 80, 30)"/></svg> text';
  document.body.append(p);
  const result = visualClone(p, false);
  expect(result.textContent).toBe("文字  text");
  expect(result.querySelector("svg path")!.getAttribute("d")).toBe(
    "M0 0L10 20Z",
  );
  expect((result.querySelector("svg path") as SVGElement).style.fill).toBe(
    "rgb(10, 80, 30)",
  );
});
it("does not apply the original root opacity twice", () => {
  const original = fixture();
  original.style.opacity = ".5";
  const result = visualClone(original);
  expect(result.style.opacity).toBe("0.5");
  expect(result.querySelector("svg")!.style.opacity).toBe("1");
});
it("registers a standalone SVG once and restores only the extension's hiding effect", () => {
  const svg = fixture();
  vi.spyOn(svg, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 160, 80),
  );
  const effect = { pause: vi.fn(), cancel: vi.fn(), currentTime: 0 };
  svg.animate = vi.fn().mockReturnValue(effect);
  const snapshot = analyzePage();
  expect(snapshot.targets).toHaveLength(1);
  const target = snapshot.targets[0];
  expect(target.element).toBe(svg);
  expect(target.kind).toBe("image");
  hideTarget(target);
  expect(effect.pause).toHaveBeenCalledOnce();
  restoreAll(snapshot.targets);
  expect(effect.cancel).toHaveBeenCalledOnce();
  expect(document.querySelector("svg")).toBe(svg);
});
