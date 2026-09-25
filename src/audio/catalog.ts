import data from "../../public/assets/audio/catalog.json";
import type { Phase } from "../shared/core";
export const catalog: Record<
  string,
  {
    file: string;
    kind: string;
    gain: number;
    duration: number;
    crossfade: number;
  }
> = data;
export function musicFor(phase: Phase): string | undefined {
  if (phase === "SUMMONING") return "entrance";
  if (["DESTROYING", "FINAL_BLAST"].includes(phase)) return "destruction";
  if (["RUINS", "AWAITING_ANSWER"].includes(phase)) return "ruins";
  if (["RESTORING", "RETURNING"].includes(phase)) return "restoration";
  if (phase === "SLEEPING") return "sleep";
}
export const effectGroups: Record<string, string[]> = {
  claw: ["claw0", "claw1"],
  tail: ["tail0", "tail1"],
  debris: ["debris0", "debris1"],
  paper: ["paper0", "paper1"],
  whoosh: ["whoosh0", "whoosh1"],
  landing: ["claw0"],
  assemble: ["assemble", "assemble1"],
};
export type AudioMessage = {
  type: "AUDIO";
  tabId: number;
  token: string;
  seq: number;
  action: "heartbeat" | "effect" | "cancel-effects" | "pause" | "stop";
  phase: Phase;
  musicElapsed: number;
  sentAt: number;
  /** Wall-clock deadline, converted to the receiver's AudioContext clock. */
  dueAt?: number;
  event?: string;
  pan?: number;
  sound: boolean;
  volume: number;
  musicVolume: number;
  effectsVolume: number;
};
export const level = (v: number, fallback = 0.5) =>
  Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback;
