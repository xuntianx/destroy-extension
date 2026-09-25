// A bounded static SVG copy. Never import scripts, event attributes, navigation,
// foreignObject, external images or SMIL behavior from the page.
const ns = "http://www.w3.org/2000/svg";
const tags = new Set(
  "svg g defs symbol use path rect circle ellipse line polyline polygon text tspan textPath linearGradient radialGradient stop clipPath mask pattern filter feGaussianBlur feOffset feBlend feColorMatrix feComponentTransfer feFuncR feFuncG feFuncB feFuncA feComposite feFlood feMerge feMergeNode feMorphology feTurbulence feDisplacementMap".split(
    " ",
  ),
);
const attrs = new Set(
  "viewBox preserveAspectRatio x y x1 x2 y1 y2 cx cy r rx ry width height d points transform pathLength dx dy rotate textLength lengthAdjust startOffset method spacing gradientUnits gradientTransform spreadMethod offset fx fy fr clipPathUnits maskUnits maskContentUnits patternUnits patternContentUnits patternTransform filterUnits primitiveUnits in in2 result stdDeviation edgeMode mode type values operator k1 k2 k3 k4 tableValues slope intercept amplitude exponent radius baseFrequency numOctaves seed stitchTiles scale xChannelSelector yChannelSelector".split(
    " ",
  ),
);
const styles =
  "color fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset clip-rule clip-path mask filter opacity display visibility stop-color stop-opacity flood-color flood-opacity lighting-color font-family font-size font-style font-weight font-stretch font-variant letter-spacing word-spacing text-anchor dominant-baseline alignment-baseline direction unicode-bidi white-space paint-order vector-effect shape-rendering text-rendering color-interpolation color-interpolation-filters transform transform-origin transform-box".split(
    " ",
  );

function localId(value: string, source: Element) {
  try {
    const url = new URL(value, source.baseURI);
    const here = new URL(source.ownerDocument.URL);
    if (
      url.origin !== here.origin ||
      url.pathname !== here.pathname ||
      url.search !== here.search
    )
      return undefined;
    return decodeURIComponent(url.hash.slice(1));
  } catch {
    return undefined;
  }
}
function rewritePaint(
  value: string,
  source: Element,
  ids: Map<string, string>,
) {
  return value.replace(
    /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi,
    (_all, a, b, c) => {
      const id = localId((a ?? b ?? c).trim(), source);
      return id && ids.has(id) ? `url("#${ids.get(id)}")` : "none";
    },
  );
}
export function snapshotSvg(source: SVGSVGElement): SVGSVGElement {
  const ids = new Map<string, string>(),
    prefix = "destroy-svg-" + crypto.randomUUID();
  for (const el of [source, ...source.querySelectorAll("[id]")])
    if (el.id && tags.has(el.localName))
      ids.set(el.id, `${prefix}-${ids.size}`);
  function copy(el: Element): SVGElement | undefined {
    if (el.namespaceURI !== ns || !tags.has(el.localName)) return undefined;
    const node = document.createElementNS(ns, el.localName);
    if (el.id && ids.has(el.id)) node.id = ids.get(el.id)!;
    for (const attr of el.attributes) {
      if (attrs.has(attr.name)) node.setAttribute(attr.name, attr.value);
      else if (
        attr.localName === "href" &&
        [
          "use",
          "textPath",
          "linearGradient",
          "radialGradient",
          "pattern",
        ].includes(el.localName)
      ) {
        const id = localId(attr.value, el);
        if (id && ids.has(id)) node.setAttribute("href", "#" + ids.get(id));
      }
    }
    const computed = getComputedStyle(el);
    for (const property of styles) {
      const value = computed.getPropertyValue(property);
      if (value) node.style.setProperty(property, rewritePaint(value, el, ids));
    }
    node.style.pointerEvents = "none";
    for (const child of el.childNodes) {
      if (child.nodeType === Node.TEXT_NODE)
        node.append(document.createTextNode(child.textContent ?? ""));
      else if (child instanceof Element) {
        const cloned = copy(child);
        if (cloned) node.append(cloned);
      }
    }
    return node;
  }
  const result = copy(source) as SVGSVGElement;
  result.setAttribute("aria-hidden", "true");
  result.setAttribute("focusable", "false");
  // The HTML wrapper owns the outer box and CSS transform. Keep the viewBox and
  // internal transforms, but do not apply the root transform a second time.
  Object.assign(result.style, {
    width: "100%",
    height: "100%",
    display: "block",
    transform: "none",
    opacity: "1",
  });
  return result;
}

/** Each fragment needs its own definitions, even when earlier fragments vanish. */
export function rekeySvgDefinitions(root: HTMLElement) {
  const ids = new Map<string, string>(),
    prefix = "destroy-piece-" + crypto.randomUUID();
  for (const node of root.querySelectorAll("svg [id],svg[id]")) {
    ids.set(node.id, `${prefix}-${ids.size}`);
    node.id = ids.get(node.id)!;
  }
  for (const node of root.querySelectorAll<SVGElement>("svg,svg *")) {
    const href = node.getAttribute("href");
    if (href?.startsWith("#") && ids.has(href.slice(1)))
      node.setAttribute("href", "#" + ids.get(href.slice(1)));
    for (const property of ["fill", "stroke", "clip-path", "mask", "filter"]) {
      const value = node.style.getPropertyValue(property);
      if (value)
        node.style.setProperty(
          property,
          value.replace(/url\(["']?#([^"')]+)["']?\)/g, (all, id) =>
            ids.has(id) ? `url("#${ids.get(id)}")` : all,
          ),
        );
    }
  }
}
