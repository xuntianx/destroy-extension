import { containOverlayInput } from "../../src/content/input-shield";
import { validAnswer } from "../../src/shared/core";
const host = document.getElementById("shadow")!;
const frame = document.getElementById("frame") as HTMLIFrameElement;
const frameHome = frame.parentElement!;
const dialog = document.getElementById("full-screen") as HTMLDialogElement;
const metrics: Record<string, number> = {};
let accepted = 0;
const render = () => {
  document.getElementById("metrics")!.textContent = JSON.stringify(
    metrics,
    null,
    2,
  );
  document.body.dataset.metrics = JSON.stringify(metrics);
};
// These are deliberately registered before either input surface is mounted.
for (const target of [window, document]) {
  for (const type of ["keydown", "keyup", "input", "click"]) {
    for (const capture of [true, false]) {
      const key = `${target === window ? "window" : "document"}.${capture ? "capture" : "bubble"}.${type}`;
      metrics[key] = 0;
      target.addEventListener(
        type,
        (event) => {
          if (
            !dialog.open &&
            !event.composedPath().includes(host) &&
            !event.composedPath().includes(frame)
          )
            return;
          metrics[key]++;
          render();
        },
        { capture },
      );
    }
  }
}
const root = host.attachShadow({ mode: "open" });
root.innerHTML = `<style>:host{display:block;box-sizing:border-box;padding:20px}textarea{display:block;width:100%;box-sizing:border-box;height:100px;margin:12px 0;font:16px/1.6 system-ui}button{font:inherit;padding:8px 14px}p{margin:0}</style><form><p>今天，你可以放下哪一件小事？</p><textarea aria-label="Shadow 回答"></textarea><button disabled>回答并清空</button><output></output></form>`;
const controller = new AbortController();
containOverlayInput(root, controller.signal);
const input = root.querySelector("textarea")!,
  submit = root.querySelector("button")!;
input.addEventListener("input", () => {
  submit.disabled = !validAnswer(input.value);
});
root.querySelector("form")!.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!validAnswer(input.value)) return;
  input.value = "";
  submit.disabled = true;
  root.querySelector("output")!.textContent = "已回答";
});
const url = new URL("input-frame.html", location.href);
url.hostname = location.hostname === "127.0.0.1" ? "localhost" : "127.0.0.1";
url.searchParams.set("parent", location.origin);
const channel = crypto.randomUUID();
url.hash = channel;
window.addEventListener("message", (event) => {
  if (
    !event.isTrusted ||
    event.source !== frame.contentWindow ||
    event.origin !== url.origin
  )
    return;
  const data = event.data;
  if (
    !data ||
    typeof data !== "object" ||
    data.kind !== "answered" ||
    data.channel !== channel ||
    Object.keys(data).sort().join() !== "channel,kind"
  )
    return;
  accepted++;
  if (dialog.open) {
    dialog.close();
    frameHome.append(frame);
  }
  document.body.dataset.accepted = String(accepted);
  document.body.dataset.messageKeys = Object.keys(data).sort().join();
  document.getElementById("bridge")!.textContent =
    `收到 ${accepted} 次完成信号，消息字段：channel、kind`;
});
frame.src = url.href;
document.getElementById("full")!.onclick = (event) => {
  event.stopPropagation();
  for (const key of Object.keys(metrics)) metrics[key] = 0;
  render();
  dialog.append(frame);
  dialog.showModal();
  frame.focus();
};
dialog.addEventListener("cancel", (event) => event.preventDefault());
document.getElementById("reset")!.onclick = () => {
  for (const key of Object.keys(metrics)) metrics[key] = 0;
  render();
};
document.getElementById("probe")!.onclick = () => {
  let frameReadable = false;
  try {
    frameReadable = !!frame.contentWindow!.document.querySelector("textarea");
  } catch {
    /* Expected same-origin policy boundary. */
  }
  const shadowReadable = !!host.shadowRoot?.querySelector("textarea");
  document.body.dataset.frameReadable = String(frameReadable);
  document.body.dataset.shadowReadable = String(shadowReadable);
  document.getElementById("probe-result")!.textContent =
    `父页面读取：Shadow ${shadowReadable ? "可读" : "被阻止"}；iframe ${frameReadable ? "可读" : "被阻止"}`;
};
document.getElementById("forge")!.onclick = () => {
  window.postMessage({ kind: "answered", channel }, location.origin);
};
render();
