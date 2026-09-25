import { AudioMixer } from "../../src/audio/mixer";
import { Session } from "../../src/content/session";
import { defaults, questions } from "../../src/shared/core";
const sections = document.querySelector("#sections")!;
const layout = new URLSearchParams(location.search).get("layout");
const coverageReview = new URLSearchParams(location.search).has("coverage");
if (coverageReview) {
  const style = document.createElement("style");
  style.textContent =
    '.short #sections{display:block}.coverage-card{background:#fff;border:1px solid #ddd;border-radius:18px;box-shadow:0 6px 20px #0001;padding:20px;margin:20px 0}.coverage-dot{width:32px;height:32px;background:#ece0ff;border:1px solid #a684ea;border-radius:50%}.coverage-pseudo::before{content:"";display:block;width:40px;height:12px;background:coral}';
  document.head.append(style);
  const card = document.createElement("div");
  card.className = "coverage-card";
  card.innerHTML =
    '<p>Card content / 卡片正文</p><div class="coverage-dot"></div><div class="coverage-pseudo"></div>';
  sections.append(card);
}
const blastReview =
  new URLSearchParams(location.search).get("review") === "blast";
if (blastReview)
  document.querySelector("aside")!.textContent +=
    " 本次使用一屏推进预算，便于观察长页的真实收尾吐息；不代表默认时长。";
if (layout === "short" || layout === "container")
  document.body.classList.add(layout);
const scroller = () =>
  layout === "container"
    ? document.querySelector<HTMLElement>("main")!
    : document.scrollingElement!;
for (let i = 1; i <= (layout === "short" ? 0 : 9); i++) {
  const section = document.createElement("section");
  section.innerHTML = `<h2>第 ${i} 节 · A little room to breathe</h2><p>一段文字，有<strong>加粗的想法</strong>、<em>斜体的停顿</em>和 <a href="#sections">继续阅读</a>。怪兽会从你正在看的地方开始，逐渐向下推进。</p><p>Not every thought needs an answer immediately. This is a line of English text, mixed with 中文，to inspect local visual fragments and typography.</p>${i % 3 === 0 ? '<img alt="图像切片检查" src="/tests/fixtures/landscape.svg">' : ""}`;
  sections.append(section);
}
let count = 0;
document.querySelector("#count")!.addEventListener("click", () => {
  document.querySelector("#counter")!.textContent = String(++count);
});
document
  .querySelector("#middle")!
  .addEventListener("click", () =>
    scroller().scrollTo({ top: 1800, behavior: "instant" }),
  );
let language: "zh" | "en" = "zh";
document
  .querySelector("#english")!
  .addEventListener(
    "click",
    () => (language = language === "zh" ? "en" : "zh"),
  );
const mixer = new AudioMixer((file) => "/assets/audio/" + file);
// Development-only transport; the same mixer as offscreen, no Chrome runtime here.
(globalThis as any).chrome = {
  runtime: {
    getURL: (file: string) => {
      if (new URLSearchParams(location.search).get("ui") === "missing")
        file = "missing-interface.html";
      if (new URLSearchParams(location.search).get("ui") === "unresponsive")
        file = "tests/fixtures/unresponsive-frame.html";
      const url = new URL("/" + file, location.href);
      url.hostname =
        location.hostname === "127.0.0.1" ? "localhost" : "127.0.0.1";
      return url.href;
    },
    sendMessage: async (m: any) => {
      if (m.action === "effect" && Number.isFinite(m.dueAt)) {
        const data = document.body.dataset;
        data.audioPlanned = String(Number(data.audioPlanned ?? 0) + 1);
        data.audioMaxLeadMs = String(
          Math.max(Number(data.audioMaxLeadMs ?? 0), m.dueAt - Date.now()),
        );
        data.audioMaxReceiptLateMs = String(
          Math.max(
            Number(data.audioMaxReceiptLateMs ?? 0),
            Date.now() - m.dueAt,
          ),
        );
      }
      await mixer.handle({ ...m, tabId: 1 });
      return { ok: true };
    },
  },
};
let session: Session | undefined;
async function startSession() {
  document.body.dataset.triggerScroll = String(scroller().scrollTop);
  if (session) return;
  document.querySelector("#fixture-status")!.textContent = "运行中";
  void mixer.unlock();
  try {
    session = new Session(
      crypto.randomUUID(),
      { ...defaults, language, ...(blastReview ? { screens: 1 } : {}) },
      questions[0],
      () => {
        if (session) {
          document.body.dataset.lastSession = JSON.stringify({
            phase: session.state.phase,
            destroyMs: Number(session.host.dataset.destroyMs),
            restoreMs: Number(session.host.dataset.restoreMs),
            startScroll: session.page.scrollY,
            endScroll: scroller().scrollTop,
          });
          if (session.state.phase === "DONE")
            document.body.dataset.completedSessions = String(
              Number(document.body.dataset.completedSessions ?? 0) + 1,
            );
        }
        session = undefined;
        document.querySelector("#fixture-status")!.textContent =
          "已复原；可重新召唤";
      },
    );
    await session.start();
    if (new URLSearchParams(location.search).has("navigation"))
      window.setTimeout(() => {
        location.hash = "route-changed";
      }, 2200);
    if (coverageReview) {
      const liveSession = session;
      const monitor = window.setInterval(() => {
        if (!liveSession.host.isConnected) {
          clearInterval(monitor);
          return;
        }
        if (liveSession.state.phase === "AWAITING_ANSWER") {
          clearInterval(monitor);
          const late = document.createElement("div");
          late.id = "late-card";
          late.className = "coverage-card";
          late.innerHTML =
            '<p>Late arriving content</p><div class="coverage-dot"></div>';
          sections.append(late);
        }
      }, 200);
    }
  } catch (e) {
    document.querySelector("#fixture-status")!.textContent = String(e);
  }
}
document.querySelector("#start")!.addEventListener("click", startSession);
// Local harness shortcut, not evidence that Chrome commands/activeTab work.
document.addEventListener("keydown", (event) => {
  if (event.altKey && event.shiftKey && event.code === "KeyD") {
    event.preventDefault();
    startSession();
  }
});
// Register page handlers before any overlay exists, like a real website.
for (const type of ["keydown", "keyup", "input", "click"] as const) {
  for (const [name, target] of [
    ["Window", window],
    ["Document", document],
  ] as const)
    target.addEventListener(
      type,
      () => {
        const key = "capture" + name + type[0].toUpperCase() + type.slice(1);
        document.body.dataset[key] = String(
          Number(document.body.dataset[key] ?? 0) + 1,
        );
      },
      true,
    );
  document.addEventListener(type, () => {
    const key = "page" + type[0].toUpperCase() + type.slice(1);
    document.body.dataset[key] = String(
      Number(document.body.dataset[key] ?? 0) + 1,
    );
  });
}
