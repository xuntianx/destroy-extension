import { validAnswer, phases } from "../shared/core";
import { strings } from "../shared/strings";
import { isUiPulse, type UiState } from "../shared/ui-protocol";
import css from "../content/overlay.css?inline";
import "../shared/fonts.css";
const style = document.createElement("style");
style.textContent = `${css}\nhtml,body{width:100%;height:100%;margin:0;overflow:hidden;background:transparent;color:#253b31;font:14px/1.6 var(--destroy-font)}`;
document.head.append(style);
const panel = document.querySelector("form")!,
  input = document.querySelector("textarea")!,
  submit = panel.querySelector("button")!,
  sound = document.querySelector<HTMLButtonElement>(".sound")!,
  status = document.querySelector<HTMLElement>(".status")!;
let port: MessagePort | undefined,
  channel = "",
  composing = false,
  answered = false;
let state: UiState | undefined;
function fitAnswer() {
  input.style.height = "0px";
  input.style.height = `${Math.max(parseFloat(getComputedStyle(input).minHeight), input.scrollHeight)}px`;
}
const send = (type: string) => port?.postMessage({ type, channel });
const parentOrigin = new URLSearchParams(location.search).get("parentOrigin");
window.addEventListener("message", (event) => {
  if (
    port ||
    !event.isTrusted ||
    (event.source !== parent && event.source !== null) ||
    event.origin !== parentOrigin
  )
    return;
  const m = event.data;
  if (
    m?.type !== "DESTROY_UI_INIT" ||
    typeof m.channel !== "string" ||
    !["zh", "en"].includes(m.config?.language) ||
    typeof m.config?.question !== "string" ||
    m.config.question.length > 2000 ||
    event.ports.length !== 1
  )
    return;
  port = event.ports[0];
  channel = m.channel;
  const lang = m.config.language as "zh" | "en",
    copy = strings[lang];
  document.documentElement.lang = lang;
  document.title = copy.name;
  panel.querySelector("h1")!.textContent = m.config.question;
  input.placeholder = copy.answerHint;
  input.setAttribute("aria-label", m.config.question);
  submit.textContent = copy.submit;
  port.onmessage = ({ data }) => {
    if (isUiPulse(data, channel, "ping")) {
      port?.postMessage({ type: "pong", channel, id: data.id });
      return;
    }
    if (
      data?.type !== "state" ||
      data.channel !== channel ||
      !phases.includes(data.state?.phase) ||
      typeof data.state.label !== "string" ||
      typeof data.state.sound !== "boolean" ||
      typeof data.state.audioAvailable !== "boolean"
    )
      return;
    const previous = state?.phase;
    state = data.state;
    status.textContent = state!.label;
    const soundLabel =
      state!.sound && state!.audioAvailable ? copy.soundOff : copy.enableSound;
    sound.setAttribute("aria-label", soundLabel);
    sound.title = soundLabel;
    sound.dataset.muted = String(!state!.sound || !state!.audioAvailable);
    sound.setAttribute("aria-pressed", String(state!.sound));
    panel.hidden = state!.phase !== "AWAITING_ANSWER";
    if (previous !== state!.phase) {
      if (!panel.hidden && !answered) {
        fitAnswer();
        input.focus({ preventScroll: true });
      } else sound.focus({ preventScroll: true });
    }
  };
  port.start();
  send("ready");
});
sound.onclick = () => send("toggle-sound");
input.addEventListener("compositionstart", () => {
  composing = true;
});
input.addEventListener("compositionend", () => {
  composing = false;
  submit.disabled = answered || !validAnswer(input.value);
});
input.addEventListener("input", () => {
  fitAnswer();
  submit.disabled = answered || !validAnswer(input.value);
});
panel.addEventListener("submit", (event) => {
  event.preventDefault();
  if (
    state?.phase !== "AWAITING_ANSWER" ||
    answered ||
    composing ||
    !validAnswer(input.value)
  )
    return;
  answered = true;
  input.value = "";
  input.disabled = submit.disabled = true;
  send("answered");
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") event.preventDefault();
  if (event.key === "Tab") {
    event.preventDefault();
    const fields = [sound, input, submit].filter(
      (field) => !field.disabled && field.getClientRects().length > 0,
    );
    const current = fields.findIndex(
      (field) => field === document.activeElement,
    );
    fields[
      (current + (event.shiftKey ? -1 : 1) + fields.length) % fields.length
    ]?.focus();
  }
});
window.addEventListener(
  "wheel",
  (event) => {
    if (!(event.target instanceof Node) || !panel.contains(event.target))
      event.preventDefault();
  },
  { passive: false },
);
window.addEventListener(
  "touchmove",
  (event) => {
    if (!(event.target instanceof Node) || !panel.contains(event.target))
      event.preventDefault();
  },
  { passive: false },
);
window.addEventListener("pagehide", () => {
  send("closed");
  port?.close();
});
