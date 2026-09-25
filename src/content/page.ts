import {
  prepareFracture,
  cloneVisualTemplate,
  type PreparedFracture,
  type VisualElement,
} from "./fragments";
export type Target = {
  element: VisualElement;
  rect: DOMRect;
  hidden?: Animation;
  fragments: HTMLElement[];
  kind: "text" | "image" | "card";
  anchored?: boolean;
  decoration?: boolean;
  preserveBackground?: boolean;
  pseudoAnimations?: Animation[];
};
export type PageSnapshot = {
  targets: Target[];
  scroller: HTMLElement;
  scrollX: number;
  scrollY: number;
  focus: HTMLElement | null;
  height: number;
  width: number;
};
const ignored =
  "script,style,link,meta,noscript,template,dialog,[hidden],[data-destroy-root]";
export function analyzePage(): PageSnapshot {
  if (document.fullscreenElement || document.querySelector("dialog[open]"))
    throw Error("unsupported");
  const nodes = [...document.body.querySelectorAll<VisualElement>("*")];
  if (nodes.length > 20000) throw Error("tooLarge");
  const root = (document.scrollingElement ??
    document.documentElement) as HTMLElement;
  const scrollables = nodes.filter((e): e is HTMLElement => {
    if (!(e instanceof HTMLElement)) return false;
    if (
      e.clientHeight < innerHeight * 0.5 ||
      e.clientWidth < innerWidth * 0.45 ||
      e.scrollHeight <= e.clientHeight + 100
    )
      return false;
    return /auto|scroll/.test(getComputedStyle(e).overflowY);
  });
  if (scrollables.length > 1) throw Error("unsupported");
  const scroller =
    scrollables.length === 1 && root.scrollHeight <= innerHeight + 100
      ? scrollables[0]
      : root;
  if (scrollables.length && scroller === root) throw Error("unsupported");
  const targets = collectTargets(nodes, scroller);
  if (!targets.length) throw Error("unsupported");
  return {
    targets,
    scroller,
    scrollX: scroller.scrollLeft,
    scrollY: scroller.scrollTop,
    focus:
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null,
    height: innerHeight,
    width: innerWidth,
  };
}
export function collectTargets(
  nodes: VisualElement[],
  scroller: HTMLElement,
): Target[] {
  const visible = nodes.filter((e) => {
    if (
      e.closest(ignored) ||
      !(e instanceof HTMLElement || e instanceof SVGSVGElement)
    )
      return false;
    const style = getComputedStyle(e);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0"
    )
      return false;
    const rect = e.getBoundingClientRect();
    return rect.width >= 2 && rect.height >= 2;
  });
  const candidates = visible.filter((e) => {
    const rect = e.getBoundingClientRect();
    if (
      e.matches(
        "p,h1,h2,h3,h4,h5,h6,li,pre,blockquote,figcaption,button,a,input,textarea,select,img,video,canvas,iframe,svg,hr,th,td,label",
      )
    )
      return true;
    return (
      [...e.childNodes].some(
        (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim(),
      ) &&
      e !== scroller &&
      rect.height < innerHeight * 2
    );
  });
  const selected: VisualElement[] = [];
  const chosen = new Set<Element>();
  for (const e of candidates) {
    let parent = e.parentElement,
      inside = false;
    while (parent) {
      if (chosen.has(parent)) {
        inside = true;
        break;
      }
      parent = parent.parentElement;
    }
    if (!inside) {
      chosen.add(e);
      selected.push(e);
    }
  }
  if (selected.length > 1800) throw Error("tooLarge");
  const anchoredCache = new Map<Element, boolean>();
  const anchored = (element: Element): boolean => {
    if (anchoredCache.has(element)) return anchoredCache.get(element)!;
    const position = getComputedStyle(element).position;
    const value =
      /^(fixed|sticky)$/.test(position) ||
      (!!element.parentElement &&
        element !== document.body &&
        anchored(element.parentElement));
    anchoredCache.set(element, value);
    return value;
  };
  const targets: Target[] = selected.map((element) => ({
    element,
    rect: element.getBoundingClientRect(),
    fragments: [],
    anchored: anchored(element),
    kind: element.matches("img,video,canvas,iframe,svg")
      ? "image"
      : element.matches("button,input,select,textarea")
        ? "card"
        : "text",
  }));
  // Container paint is separate from its content: erasing a card must not
  // hide its children early or turn an entire article into one huge fragment.
  for (const element of visible) {
    if (
      element === scroller ||
      element === document.body ||
      chosen.has(element)
    )
      continue;
    let parent = element.parentElement;
    while (parent && !chosen.has(parent)) parent = parent.parentElement;
    if (parent) continue;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const preserveBackground =
      rect.width >= innerWidth * 0.9 && rect.height >= innerHeight * 0.9;
    const solid = (color: string) =>
      !!color &&
      color !== "transparent" &&
      !/rgba\([^)]*,\s*0\s*\)/.test(color);
    const background =
      solid(style.backgroundColor) ||
      (style.backgroundImage && style.backgroundImage !== "none");
    const border = ["Top", "Right", "Bottom", "Left"].some(
      (side) =>
        parseFloat(
          style.getPropertyValue(`border-${side.toLowerCase()}-width`),
        ) > 0 &&
        !/^(none|hidden)$/.test(
          style.getPropertyValue(`border-${side.toLowerCase()}-style`),
        ),
    );
    const shadow = !!style.boxShadow && style.boxShadow !== "none";
    const pseudo = ["::before", "::after"].some((part) => {
      const content = getComputedStyle(element, part).content;
      return !!content && content !== "none" && content !== "normal";
    });
    if ((!preserveBackground && background) || border || shadow || pseudo)
      targets.push({
        element,
        rect,
        fragments: [],
        kind: "card",
        decoration: true,
        preserveBackground,
      });
  }
  if (targets.length > 4000) throw Error("tooLarge");
  return targets;
}
export function refreshTargets(page: PageSnapshot) {
  const nodes = [...document.body.querySelectorAll<VisualElement>("*")];
  if (nodes.length > 20000) return;
  const known = new Set(page.targets.map((t) => t.element));
  const hiddenContent = new Set(
    page.targets.filter((t) => t.hidden && !t.decoration).map((t) => t.element),
  );
  const uncovered = nodes.filter((element) => {
    let parent = element.parentElement;
    while (parent) {
      if (hiddenContent.has(parent)) return false;
      parent = parent.parentElement;
    }
    return true;
  });
  const added = collectTargets(uncovered, page.scroller).filter(
    (t) => !known.has(t.element),
  );
  if (page.targets.length + added.length > 4000) return;
  page.targets.push(...added);
  return added;
}
export function hideTarget(target: Target) {
  if (target.hidden || !target.element.isConnected) return;
  const paint: Keyframe = target.decoration
    ? {
        borderColor: "transparent",
        boxShadow: "none",
        outlineColor: "transparent",
        ...(target.preserveBackground
          ? {}
          : { backgroundColor: "transparent", backgroundImage: "none" }),
      }
    : { opacity: 0 };
  const a = target.element.animate([paint, paint], {
    duration: 1,
    fill: "both",
  });
  a.pause();
  a.currentTime = 1;
  target.hidden = a;
  if (target.decoration)
    target.pseudoAnimations = ["::before", "::after"].map((pseudoElement) => {
      const animation = target.element.animate(
        [{ opacity: 0 }, { opacity: 0 }],
        {
          duration: 1,
          fill: "both",
          pseudoElement,
        },
      );
      animation.pause();
      animation.currentTime = 1;
      return animation;
    });
}
export function showTarget(target: Target) {
  target.hidden?.cancel();
  target.pseudoAnimations?.forEach((animation) => animation.cancel());
  target.pseudoAnimations = undefined;
  target.hidden = undefined;
}
export function restoreAll(targets: Target[]) {
  for (const t of targets) {
    showTarget(t);
    t.fragments.forEach((n) => n.remove());
    t.fragments = [];
  }
}
export { visualClone } from "./fragments";
export function fracture(
  target: Target,
  layer: HTMLElement,
  contact: { x: number; y: number },
  reduced: boolean,
  prepared?: PreparedFracture,
) {
  const rect = target.element.getBoundingClientRect();
  target.rect = rect;
  const snapshot =
    prepared &&
    prepared.signature === target.element.innerHTML &&
    Math.abs(prepared.rect.width - rect.width) < 0.5 &&
    Math.abs(prepared.rect.height - rect.height) < 0.5
      ? prepared
      : prepareFracture(target.element, target.kind === "text", reduced);
  const result: {
    node: HTMLElement;
    x: number;
    y: number;
    vx: number;
    vy: number;
    rotation: number;
  }[] = [];
  if (!snapshot) return result;
  for (const [index, region] of snapshot.regions.entries()) {
    const node = document.createElement("div"),
      copy = cloneVisualTemplate(snapshot.template);
    Object.assign(node.style, {
      position: "absolute",
      left: rect.left + region.left + "px",
      top: rect.top + region.top + "px",
      width: region.width + "px",
      height: region.height + "px",
      overflow: "hidden",
      clipPath: "inset(0)",
      pointerEvents: "none",
      transformOrigin: "0 0",
    });
    Object.assign(copy.style, {
      left: -region.left + "px",
      top: -region.top + "px",
    });
    node.dataset.fragmentMode = snapshot.mode;
    node.dataset.fragmentLeft = String(region.left);
    node.dataset.fragmentTop = String(region.top);
    node.append(copy);
    layer.append(node);
    target.fragments.push(node);
    const x = rect.left + region.left,
      y = rect.top + region.top;
    result.push({
      node,
      x,
      y,
      vx: (x + region.width * 0.5 - contact.x) * 0.8 + (index % 2 ? 50 : -50),
      vy: -130 - index * 12,
      rotation: index % 2 ? 40 : -50,
    });
  }
  return result;
}
export class StyleLease {
  private values: {
    el: HTMLElement;
    key: string;
    before: string;
    priority: string;
    owned: string;
  }[] = [];
  set(el: HTMLElement, key: string, value: string) {
    this.values.push({
      el,
      key,
      before: el.style.getPropertyValue(key),
      priority: el.style.getPropertyPriority(key),
      owned: value,
    });
    el.style.setProperty(key, value, "important");
  }
  restore() {
    for (const v of this.values.reverse()) {
      if (
        v.el.style.getPropertyValue(v.key) === v.owned &&
        v.el.style.getPropertyPriority(v.key) === "important"
      ) {
        if (v.before) v.el.style.setProperty(v.key, v.before, v.priority);
        else v.el.style.removeProperty(v.key);
      }
    }
    this.values = [];
  }
}
