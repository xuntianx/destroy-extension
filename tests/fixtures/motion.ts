import { Rig, neutral, tracks } from "../../src/content/rig.js";
import { breathMarkup } from "../../src/content/breath-fx";
import {
  motionFrame,
  motionDuration,
  motionMarkers,
  type MotionName,
} from "../../src/content/motions";
const $ = (id: string) => document.getElementById(id)!;
const rig = new Rig($("monster"));
let raf = 0,
  mirror = false;
const pose = (action: MotionName, p: number) => motionFrame(action, p).pose;
function render(p: number) {
  const action = ($("action") as HTMLSelectElement).value as MotionName;
  const frame = motionFrame(action, p);
  rig.pose(frame.pose);
  rig.nodes["monster-shadow"].setAttribute(
    "transform",
    `translate(0 ${-frame.y / 0.4})`,
  );
  $("monster").style.translate = `${frame.x}px ${frame.y}px`;
  $("monster").style.opacity = String(frame.opacity);
  $("monster").style.filter = frame.glow
    ? `drop-shadow(0 0 ${frame.glow}px #edbf52)`
    : "";
  $("zzz").style.opacity = String(frame.zOpacity);
  $("zzz").style.translate = `0 ${frame.zY}px`;
  const rect = $("stage").getBoundingClientRect(),
    mouth = rig.point("mouth");
  $("beam").innerHTML =
    action === "breath"
      ? breathMarkup(
          { x: mouth.x - rect.left, y: mouth.y - rect.top },
          { x: mirror ? 30 : rect.width - 30, y: 80 },
          p,
          false,
          false,
          mirror,
        )
      : "";
  ($("scrub") as HTMLInputElement).value = String(p * 1000);
  $("status").textContent = `${action} ${Math.round(p * 100)}%`;
}
$("play").onclick = () => {
  cancelAnimationFrame(raf);
  const started = performance.now(),
    action = ($("action") as HTMLSelectElement).value as MotionName,
    duration = motionDuration[action];
  const tick = (now: number) => {
    const p = Math.min(1, (now - started) / duration);
    render(p);
    if (p < 1) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
};
$("scrub").oninput = () => {
  cancelAnimationFrame(raf);
  render(Number(($("scrub") as HTMLInputElement).value) / 1000);
};
$("action").onchange = () => {
  cancelAnimationFrame(raf);
  render(0);
};
$("keyframe").onclick = () => {
  cancelAnimationFrame(raf);
  const action = ($("action") as HTMLSelectElement).value as MotionName;
  const markers = {
    entrance: motionMarkers.entrance.landing,
    claw: tracks.claw.hit / tracks.claw.duration,
    tail: tracks.tail.hit / tracks.tail.duration,
    breath: motionMarkers.breath.hit,
    sleep: 0.5,
  };
  render(markers[action]);
};
$("mirror").onclick = () => {
  mirror = !mirror;
  $("monster").style.transform = mirror ? "scaleX(-1)" : "";
  render(Number(($("scrub") as HTMLInputElement).value) / 1000);
};
$("measure").onclick = () => {
  cancelAnimationFrame(raf);
  const results = [];
  for (const flip of [false, true]) {
    $("monster").style.transform = flip ? "scaleX(-1)" : "";
    rig.pose(neutral);
    const base = rig.point("near-foot");
    for (const action of ["claw", "tail", "breath", "sleep"] as const) {
      let drift = 0;
      for (let frame = 0; frame <= 100; frame++) {
        rig.pose(pose(action, frame / 100));
        const foot = rig.point("near-foot");
        drift = Math.max(drift, Math.hypot(foot.x - base.x, foot.y - base.y));
      }
      results.push({ action, mirror: flip, maxFootDrift: +drift.toFixed(5) });
    }
  }
  $("monster").style.transform = mirror ? "scaleX(-1)" : "";
  render(0);
  $("status").textContent = JSON.stringify(results);
};
render(0);
