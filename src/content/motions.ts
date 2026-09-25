import { neutral, sample, tracks } from "./rig.js";
export type MotionName = "entrance" | "claw" | "tail" | "breath" | "sleep";
export const motionDuration: Record<MotionName, number> = {
  entrance: 1800,
  claw: tracks.claw.duration,
  tail: tracks.tail.duration,
  breath: 3400,
  sleep: 3500,
};
// Normalized markers are shared by the puppet, effects and audio scheduling.
export const motionMarkers = {
  entrance: { landing: 0.7 },
  breath: { charge: 0, fire: 0.3, hit: 0.46, end: 0.9 },
  sleep: { snore: 0.3 },
};
const clamp = (p: number) => Math.max(0, Math.min(1, p));
const smooth = (p: number) => {
  p = clamp(p);
  return p * p * (3 - 2 * p);
};
/** Pure, seekable poses used by both the extension and the visual review page. */
export function motionFrame(name: MotionName, progress: number) {
  const p = clamp(progress);
  const frame = {
    pose: { ...neutral },
    x: 0,
    y: 0,
    opacity: 1,
    zOpacity: 0,
    zY: 0,
    glow: 0,
    beam: false,
  };
  if (name === "claw" || name === "tail") {
    frame.pose = sample(name, p * motionDuration[name]) as typeof neutral;
  } else if (name === "entrance") {
    const flight = clamp(p / motionMarkers.entrance.landing);
    const settle = Math.sin(clamp((p - 0.7) / 0.3) * Math.PI);
    frame.x = (1 - smooth(flight)) * -220;
    frame.y = -Math.sin(flight * Math.PI) * 35;
    frame.opacity = clamp(p * 4);
    frame.pose = {
      ...neutral,
      bodyY: settle * 12,
      headR: settle * 4,
      armR: settle * 9,
      tailR: -settle * 7,
    };
  } else if (name === "breath") {
    const charge = Math.sin(p * Math.PI);
    frame.pose = {
      ...neutral,
      bodyX: -charge * 70,
      bodyR: -charge * 6,
      headR: -charge * 14,
      armR: -charge * 25,
      jawOpen: clamp((p - 0.22) * 7) * clamp((1 - p) * 7),
      jawAngle: 12 + charge * 16,
    };
    frame.beam = p > motionMarkers.breath.fire && p < motionMarkers.breath.end;
    frame.glow = charge * 14;
  } else {
    const settle = smooth(p * 3);
    const breathing = Math.sin(p * Math.PI * 4) * 1.6 * settle;
    frame.pose = {
      ...neutral,
      bodyY: 15 * settle + breathing,
      bodyR: 5 * settle,
      headR: 16 * settle,
      tailR: -12 * settle,
      armR: 18 * settle,
      eyesClosed: smooth(p * 4),
    };
    frame.opacity = 1 - smooth((p - 0.65) / 0.35);
    frame.zOpacity = Math.sin(p * Math.PI);
    frame.zY = -p * 20;
  }
  return frame;
}

// A small repair gesture, not a sixth full action or a carrying animation.
export function repairPose(progress: number) {
  const amount = Math.sin(clamp(progress) * Math.PI);
  return {
    ...neutral,
    headR: -5 * amount,
    armR: -30 * amount,
    foreR: -15 * amount,
    farR: -12 * amount,
    tailR: 8 * amount,
  };
}
