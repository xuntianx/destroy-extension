import { AudioMixer } from "./mixer";
import { AUDIO_PCM_BUDGET, pcmBytes } from "./buffer-cache";
import { catalog, musicFor, type AudioMessage } from "./catalog";
import { settingsFrom, type Phase } from "../shared/core";
import "./preview.css";
const $ = (id: string) => document.getElementById(id)!;
const url = (file: string) =>
  new URL("assets/audio/" + file, location.href).href;
const mixer = new AudioMixer(url);
let phase: Phase = "PREPARING",
  seq = 0,
  elapsed = 0,
  since = performance.now(),
  paused = false;
const token = crypto.randomUUID();
if (typeof chrome !== "undefined" && chrome.storage?.local) {
  const saved = settingsFrom(
    (await chrome.storage.local.get("settings")).settings,
  );
  for (const [id, value] of [
    ["master", saved.volume],
    ["music", saved.musicVolume],
    ["effects", saved.effectsVolume],
  ] as const)
    ($(id) as HTMLInputElement).value = String(value * 100);
}
const clock = () => elapsed + (paused ? 0 : (performance.now() - since) / 1000);
const volume = (id: string) => Number(($(id) as HTMLInputElement).value) / 100;
async function send(action: AudioMessage["action"], event?: string) {
  try {
    await mixer.handle({
      type: "AUDIO",
      tabId: 0,
      token,
      seq: ++seq,
      action,
      phase,
      event,
      sentAt: Date.now(),
      musicElapsed: clock(),
      sound: true,
      volume: volume("master"),
      musicVolume: volume("music"),
      effectsVolume: volume("effects"),
    });
    document.body.dataset.audio = action;
  } catch {
    $("status").textContent =
      "声音未能启动，请再点击试听。 / Click again to enable audio.";
  }
}
const stages: [Phase, string][] = [
  ["SUMMONING", "登场 / Entrance"],
  ["DESTROYING", "破坏 / Destruction"],
  ["RUINS", "废墟 / Reflection"],
  ["RESTORING", "重建 / Recovery"],
  ["SLEEPING", "睡眠 / Sleep"],
];
for (const [next, label] of stages) {
  const b = document.createElement("button");
  b.textContent = label;
  b.onclick = () => {
    mixer.stop(0);
    phase = next;
    elapsed = 0;
    since = performance.now();
    paused = false;
    void send("heartbeat");
    $("status").textContent = label;
  };
  $("stages").append(b);
}
const effects = {
  landing: "落地 / Landing",
  roar: "吼叫 / Roar",
  whoosh: "挥动 / Whoosh",
  claw: "爪击 / Claw",
  tail: "尾扫 / Tail",
  paper: "文字 / Paper",
  debris: "碎片 / Debris",
  charge: "蓄力 / Charge",
  breath: "吐息 / Breath",
  release: "爆破 / Release",
  breathing: "呼吸 / Breathing",
  question: "提问 / Question",
  confirm: "回答 / Answer",
  assemble: "归位 / Assemble",
  accent: "收尾 / Accent",
  snore: "鼾声 / Snore",
};
for (const [id, label] of Object.entries(effects)) {
  const b = document.createElement("button");
  b.textContent = label;
  b.onclick = () => {
    if (paused) {
      since = performance.now();
      paused = false;
    }
    void send("effect", id);
  };
  $("effects-list").append(b);
}
$("pause").onclick = () => {
  elapsed = clock();
  paused = true;
  void send("pause");
  $("status").textContent = "已暂停 / Paused";
};
$("resume").onclick = () => {
  if (paused) {
    since = performance.now();
    paused = false;
  }
  void send("heartbeat");
  $("status").textContent = "继续播放 / Resumed";
};
$("stop").onclick = () => {
  phase = "PREPARING";
  elapsed = 0;
  paused = true;
  void send("stop");
  $("status").textContent = "已停止 / Stopped";
};
for (const id of ["master", "music", "effects"])
  $(id).oninput = () => {
    if (!paused) void send("heartbeat");
  };
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    elapsed = clock();
    paused = true;
    void send("pause");
    $("status").textContent = "已暂停，点击继续 / Paused; choose Resume";
  }
});
window.addEventListener("pagehide", () => mixer.dispose());
setInterval(() => {
  if (!paused && musicFor(phase)) void send("heartbeat");
}, 5000);
$("verify").onclick = async () => {
  ($("verify") as HTMLButtonElement).disabled = true;
  const output = $("verification"),
    context = new AudioContext();
  output.textContent = "检查中 / Checking…";
  try {
    let bytes = 0,
      seconds = 0,
      peak = 0,
      decodedBytes = 0,
      largestBufferBytes = 0;
    for (const meta of Object.values(catalog)) {
      const r = await fetch(url(meta.file));
      if (!r.ok) throw Error(meta.file);
      const raw = await r.arrayBuffer();
      bytes += raw.byteLength;
      const buffer = await context.decodeAudioData(raw);
      decodedBytes += pcmBytes(buffer);
      largestBufferBytes = Math.max(largestBufferBytes, pcmBytes(buffer));
      seconds += buffer.duration;
      for (let c = 0; c < buffer.numberOfChannels; c++)
        for (const x of buffer.getChannelData(c))
          peak = Math.max(peak, Math.abs(x));
    }
    output.textContent = JSON.stringify({
      files: Object.keys(catalog).length,
      bytes,
      decodedSeconds: +seconds.toFixed(3),
      peak: +peak.toFixed(4),
      budgetPassed: bytes <= 3000000,
      sampleRate: context.sampleRate,
      decodedBytes,
      largestBufferBytes,
      decodedBudgetBytes: AUDIO_PCM_BUDGET,
      decodedBudgetPassed: decodedBytes <= AUDIO_PCM_BUDGET,
      mixerCache: mixer.audioMemory(),
    });
  } catch (e) {
    output.textContent = String(e);
  } finally {
    await context.close();
    ($("verify") as HTMLButtonElement).disabled = false;
  }
};
