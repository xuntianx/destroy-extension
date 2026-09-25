import { snapshotSvg, rekeySvgDefinitions } from "./svg-snapshot";
export type VisualElement = HTMLElement | SVGSVGElement;
export type Rect = { left: number; top: number; width: number; height: number };
export type PreparedFracture = {
  rect: DOMRect;
  template: HTMLElement;
  regions: Rect[];
  mode: "lines" | "grid";
  preparedMs: number;
  signature: string;
};
const ignored =
  "script,style,link,meta,noscript,template,dialog,[hidden],[data-destroy-root]";
// Explicit visual properties: no animations, transitions, event attributes or custom-element constructors.
const properties =
  `color background-color background-image background-size background-position background-repeat background-origin background-clip
font-family font-size font-style font-weight font-variant font-stretch font-kerning font-feature-settings font-variation-settings font-optical-sizing font-size-adjust
line-height letter-spacing word-spacing text-align text-align-last text-transform text-decoration text-decoration-color text-decoration-thickness text-underline-offset text-shadow text-indent text-overflow text-rendering text-size-adjust
white-space word-break overflow-wrap hyphens tab-size direction unicode-bidi writing-mode text-orientation
padding-top padding-right padding-bottom padding-left margin-top margin-right margin-bottom margin-left
border-top border-right border-bottom border-left border-radius border-collapse border-spacing box-sizing box-shadow
display vertical-align object-fit object-position width height min-width min-height max-width max-height
position top right bottom left float clear overflow overflow-x overflow-y opacity transform transform-origin
flex-direction flex-wrap align-items align-content justify-content gap row-gap column-gap flex-grow flex-shrink flex-basis align-self order
grid-template-columns grid-template-rows grid-auto-flow grid-column grid-row list-style-type list-style-position`.split(
    /\s+/,
  );
const safeTags = new Set(
  "div span p h1 h2 h3 h4 h5 h6 strong em b i u s small sub sup code pre blockquote q br wbr ul ol li dl dt dd table thead tbody tfoot tr th td caption colgroup col hr figure figcaption mark ruby rt rp".split(
    " ",
  ),
);

function copyStyle(source: CSSStyleDeclaration, clone: HTMLElement) {
  for (const property of properties) {
    const value = source.getPropertyValue(property);
    if (value) clone.style.setProperty(property, value);
  }
  clone.style.setProperty("pointer-events", "none");
  clone.style.setProperty("animation", "none");
  clone.style.setProperty("transition", "none");
  clone.style.setProperty("content-visibility", "visible");
}
function imageURL(value: string) {
  return /^(https?:|blob:|data:image\/)/i.test(value) ? value : "";
}
/** CSS string content only; counters, quotes keywords and generated images remain unsupported. */
export function pseudoText(content: string) {
  if (!/^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')$/s.test(content)) return "";
  return content
    .slice(1, -1)
    .replace(/\\([0-9a-f]{1,6})\s?|\\(.)/gis, (_, hex, char) =>
      hex
        ? String.fromCodePoint(Math.min(parseInt(hex, 16) || 0xfffd, 0x10ffff))
        : char,
    );
}
function pseudo(source: HTMLElement, which: "::before" | "::after") {
  const style = getComputedStyle(source, which),
    text = pseudoText(style.content);
  if (!text || style.display === "none") return undefined;
  const span = document.createElement("span");
  copyStyle(style, span);
  span.textContent = text;
  return span;
}
/** Preserve inline semantics and computed typography, but never clone behavior or original IDs. */
export function visualClone(
  source: VisualElement,
  includePseudo = true,
): HTMLElement {
  if (source instanceof SVGSVGElement) {
    const wrapper = document.createElement("span");
    copyStyle(getComputedStyle(source), wrapper);
    wrapper.style.display = "inline-block";
    const rect = source.getBoundingClientRect();
    wrapper.style.width = rect.width + "px";
    wrapper.style.height = rect.height + "px";
    wrapper.setAttribute("aria-hidden", "true");
    wrapper.append(snapshotSvg(source));
    return wrapper;
  }
  const tag = source.localName;
  const clone = document.createElement(
    source instanceof HTMLImageElement
      ? "img"
      : source instanceof HTMLCanvasElement
        ? "canvas"
        : safeTags.has(tag)
          ? tag
          : "span",
  );
  copyStyle(getComputedStyle(source), clone);
  clone.setAttribute("aria-hidden", "true");
  const lang = source.closest("[lang]")?.getAttribute("lang");
  if (lang) clone.lang = lang;
  if (source.hasAttribute("dir")) clone.dir = source.getAttribute("dir")!;
  if (source instanceof HTMLImageElement) {
    const src = imageURL(source.currentSrc || source.src);
    if (src) (clone as HTMLImageElement).src = src;
    (clone as HTMLImageElement).alt = "";
    clone.style.width = getComputedStyle(source).width;
    clone.style.height = getComputedStyle(source).height;
  } else if (source instanceof HTMLCanvasElement) {
    const canvas = clone as HTMLCanvasElement;
    const scale = Math.min(
      1,
      1024 / Math.max(1, source.width),
      1024 / Math.max(1, source.height),
    );
    canvas.width = Math.max(1, Math.ceil(source.width * scale));
    canvas.height = Math.max(1, Math.ceil(source.height * scale));
    try {
      canvas
        .getContext("2d")
        ?.drawImage(source, 0, 0, canvas.width, canvas.height);
    } catch {
      clone.style.backgroundColor = "#a5b5a0";
    }
  } else if (
    source instanceof HTMLInputElement ||
    source instanceof HTMLTextAreaElement ||
    source instanceof HTMLSelectElement
  ) {
    clone.textContent =
      source instanceof HTMLInputElement && source.type === "password"
        ? "••••••"
        : source.value;
  } else if (source.matches("video,iframe")) {
    clone.style.backgroundColor = "#a5b5a0";
  } else {
    if (includePseudo) {
      const before = pseudo(source, "::before");
      if (before) clone.append(before);
    }
    for (const child of source.childNodes) {
      if (child.nodeType === Node.TEXT_NODE)
        clone.append(document.createTextNode(child.textContent ?? ""));
      else if (
        (child instanceof HTMLElement || child instanceof SVGSVGElement) &&
        !child.matches(ignored)
      )
        clone.append(visualClone(child, includePseudo));
    }
    if (includePseudo) {
      const after = pseudo(source, "::after");
      if (after) clone.append(after);
    }
  }
  return clone;
}

/** Group visual runs from Range rects, including mixed font sizes and bidirectional text. */
export function lineRegions(
  rects: Rect[],
  width: number,
  height: number,
  maxPieces = 8,
): Rect[] {
  const lines: { top: number; bottom: number }[] = [];
  for (const r of rects
    .filter(
      (r) =>
        r.width > 0.1 &&
        r.height > 0.1 &&
        r.top < height &&
        r.top + r.height > 0,
    )
    .sort((a, b) => a.top - b.top || a.left - b.left)) {
    const bottom = r.top + r.height;
    const line = lines.find(
      (l) =>
        Math.min(l.bottom, bottom) - Math.max(l.top, r.top) >
        Math.min(l.bottom - l.top, r.height) * 0.35,
    );
    if (line) {
      line.top = Math.min(line.top, r.top);
      line.bottom = Math.max(line.bottom, bottom);
    } else lines.push({ top: r.top, bottom });
  }
  if (!lines.length) return [];
  lines.sort((a, b) => a.top - b.top);
  const stride = Math.max(1, Math.ceil(lines.length / maxPieces));
  const cuts = [0];
  for (let i = stride; i < lines.length; i += stride)
    cuts.push(
      Math.max(
        cuts.at(-1)!,
        Math.min(height, (lines[i - 1].bottom + lines[i].top) / 2),
      ),
    );
  cuts.push(height);
  return cuts
    .slice(1)
    .map((bottom, i) => ({
      left: 0,
      top: cuts[i],
      width,
      height: bottom - cuts[i],
    }))
    .filter((r) => r.height > 0.1);
}
function textRects(source: VisualElement, origin: DOMRect): Rect[] {
  const rects: Rect[] = [],
    walker = document.createTreeWalker(source, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (!node.textContent?.trim() || node.parentElement?.closest(ignored))
      continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const r of range.getClientRects())
      rects.push({
        left: r.left - origin.left,
        top: r.top - origin.top,
        width: r.width,
        height: r.height,
      });
    if (rects.length > 500) return [];
  }
  return rects;
}
export function prepareFracture(
  source: VisualElement,
  text: boolean,
  reduced: boolean,
): PreparedFracture | undefined {
  const started = performance.now(),
    rect = source.getBoundingClientRect();
  if (
    rect.width < 1 ||
    rect.height < 1 ||
    source.querySelectorAll("*").length > 120 ||
    (source.textContent?.length ?? 0) > 20000 ||
    rect.width * rect.height > innerWidth * innerHeight * 2
  )
    return undefined;
  const style = getComputedStyle(source);
  const lineSafe =
    text &&
    style.writingMode === "horizontal-tb" &&
    style.transform === "none" &&
    !(source instanceof SVGSVGElement) &&
    !source.querySelector("img,video,canvas,iframe,svg,table,ul,ol");
  const rows = lineSafe
    ? lineRegions(
        textRects(source, rect),
        rect.width,
        rect.height,
        reduced ? 4 : 8,
      )
    : [];
  const mode = rows.length > 1 ? "lines" : "grid";
  const regions: Rect[] = mode === "lines" ? rows : [];
  if (!regions.length) {
    const columns = reduced ? 2 : 3,
      count = rect.height > 100 ? 2 : 1;
    for (let y = 0; y < count; y++)
      for (let x = 0; x < columns; x++)
        regions.push({
          left: (x * rect.width) / columns,
          top: (y * rect.height) / count,
          width: rect.width / columns,
          height: rect.height / count,
        });
  }
  const template = visualClone(source);
  Object.assign(template.style, {
    position: "absolute",
    boxSizing: "border-box",
    margin: "0",
    width: rect.width + "px",
    height: rect.height + "px",
    minWidth: "0",
    minHeight: "0",
    maxWidth: "none",
    maxHeight: "none",
    left: "0",
    top: "0",
    right: "auto",
    bottom: "auto",
  });
  return {
    rect,
    template,
    regions,
    mode,
    preparedMs: performance.now() - started,
    signature: source.innerHTML,
  };
}
export function cloneVisualTemplate(template: HTMLElement) {
  const clone = template.cloneNode(true) as HTMLElement;
  rekeySvgDefinitions(clone);
  const originals = [
    ...(template instanceof HTMLCanvasElement ? [template] : []),
    ...template.querySelectorAll("canvas"),
  ];
  const copies = [
    ...(clone instanceof HTMLCanvasElement ? [clone] : []),
    ...clone.querySelectorAll("canvas"),
  ];
  originals.forEach((canvas, i) => {
    try {
      copies[i].getContext("2d")?.drawImage(canvas, 0, 0);
    } catch {}
  });
  return clone;
}
