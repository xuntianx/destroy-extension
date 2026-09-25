import { AudioMixer } from "../audio/mixer";
const mixer = new AudioMixer((file) =>
  chrome.runtime.getURL("assets/audio/" + file),
);
chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (
    sender.id !== chrome.runtime.id ||
    m?.target !== "offscreen" ||
    m.type !== "AUDIO" ||
    !Number.isInteger(m.tabId)
  )
    return;
  if (m.action === "stop" && !m.token) {
    mixer.stop(m.tabId);
    reply({ ok: true });
    return;
  }
  if (typeof m.token !== "string" || !Number.isFinite(m.seq)) return;
  void mixer
    .handle(m)
    .then(() => reply({ ok: true }))
    .catch(() => reply({ ok: false }));
  return true;
});
setInterval(() => mixer.sweep(), 5000);
