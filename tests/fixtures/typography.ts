import {
  prepareFracture,
  type VisualElement,
} from "../../src/content/fragments";
import {
  fracture,
  hideTarget,
  restoreAll,
  type Target,
} from "../../src/content/page";
const host = document.createElement("div"),
  shadow = host.attachShadow({ mode: "open" }),
  layer = document.createElement("div");
Object.assign(host.style, {
  position: "fixed",
  inset: "0",
  pointerEvents: "none",
  zIndex: "1",
});
shadow.append(layer);
document.body.append(host);
const $ = (id: string) => document.getElementById(id)!;
let target: Target | undefined,
  animations: Animation[] = [];
const ctx = ($("canvas") as HTMLCanvasElement).getContext("2d")!;
ctx.fillStyle = "#75996b";
ctx.fillRect(0, 0, 480, 160);
ctx.fillStyle = "#f6e4bc";
ctx.beginPath();
ctx.arc(70, 80, 45, 0, Math.PI * 2);
ctx.fill();
ctx.fillStyle = "#263c31";
ctx.font = "24px Georgia";
ctx.fillText("A little room to breathe.", 130, 90);
function cleanup() {
  animations.forEach((a) => a.cancel());
  animations = [];
  if (target) restoreAll([target]);
  target = undefined;
  layer.replaceChildren();
}
function selected() {
  return $(($("target") as HTMLSelectElement).value) as VisualElement;
}
function render(moving: boolean) {
  cleanup();
  const element = selected();

  const prepared = prepareFracture(
    element,
    !element.matches("canvas,svg"),
    false,
  );
  target = {
    element,
    rect: element.getBoundingClientRect(),
    fragments: [],
    kind: element.matches("canvas,svg") ? "image" : "text",
  };
  const pieces = fracture(
    target,
    layer,
    {
      x: target.rect.left + target.rect.width * 0.5,
      y: target.rect.top + target.rect.height * 0.5,
    },
    false,
    prepared,
  );
  hideTarget(target);
  $("status").textContent = JSON.stringify({
    mode: prepared?.mode,
    pieces: pieces.length,
    prepareMs: +(prepared?.preparedMs ?? 0).toFixed(2),
  });
  if (moving)
    for (const f of pieces)
      animations.push(
        f.node.animate(
          [
            { transform: "translate(0,0) rotate(0)" },
            {
              transform: `translate(${f.vx * 0.4}px,110px) rotate(${f.rotation * 0.4}deg)`,
            },
          ],
          {
            duration: 1200,
            fill: "forwards",
            easing: "cubic-bezier(.15,.7,.2,1)",
          },
        ),
      );
}
$("original").onclick = () => {
  cleanup();
  $("status").textContent = "原节点已恢复";
};
$("still").onclick = () => render(false);
$("break").onclick = () => render(true);
$("target").onchange = () => {
  cleanup();
  selected().scrollIntoView({ block: "center", behavior: "instant" });
};
window.addEventListener("resize", cleanup);
window.addEventListener("scroll", () => {
  if (target) {
    cleanup();
    $("status").textContent = "滚动后已恢复原文，可重新生成切片。";
  }
});
$("compare").onclick = () => {
  cleanup();
  const source = selected(),
    rect = source.getBoundingClientRect(),
    copy = prepareFracture(
      source,
      !source.matches("canvas,svg"),
      false,
    )!.template;
  Object.assign(copy.style, {
    position: "fixed",
    left: rect.left + "px",
    top: rect.top + "px",
    boxSizing: "border-box",
    width: rect.width + "px",
    height: rect.height + "px",
    margin: "0",
  });
  layer.append(copy);
  const textRects = (element: VisualElement) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT),
      out: { text: string; rects: number[][] }[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (!node.textContent?.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      out.push({
        text: node.textContent,
        rects: [...range.getClientRects()].map((r) => [
          r.left,
          r.top,
          r.width,
          r.height,
        ]),
      });
    }
    return out;
  };
  const originals = textRects(source),
    copies = textRects(copy);
  let maxDelta = 0,
    missing = 0;
  for (const original of originals) {
    const clone = copies.find((c) => c.text === original.text);
    if (!clone || clone.rects.length !== original.rects.length) {
      missing++;
      continue;
    }
    original.rects.forEach((r, i) =>
      r.forEach(
        (x, j) =>
          (maxDelta = Math.max(maxDelta, Math.abs(x - clone.rects[i][j]))),
      ),
    );
  }
  const images = [...source.querySelectorAll("img")].map((img, i) => {
    const a = img.getBoundingClientRect(),
      b = copy.querySelectorAll("img")[i].getBoundingClientRect();
    return {
      widthDelta: Math.abs(a.width - b.width),
      heightDelta: Math.abs(a.height - b.height),
    };
  });
  copy.remove();
  $("status").textContent = JSON.stringify({
    textRuns: originals.length,
    missing,
    maxRectDelta: +maxDelta.toFixed(3),
    images,
  });
};

void document.fonts.ready.then(() => {
  document.body.dataset.webfontReady = String(
    document.fonts.check("20px GelasioFixture"),
  );
});
