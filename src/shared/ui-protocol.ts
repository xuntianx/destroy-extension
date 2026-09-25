import type { Language, Phase } from "./core";
export type UiConfig = { language: Language; question: string };
export type UiState = {
  phase: Phase;
  label: string;
  sound: boolean;
  audioAvailable: boolean;
};
export type UiEvent = {
  type: "ready" | "answered" | "toggle-sound" | "closed";
  channel: string;
};
export type UiPulse = { type: "ping" | "pong"; channel: string; id: number };
export function isUiPulse(
  data: unknown,
  channel: string,
  type: UiPulse["type"],
): data is UiPulse {
  if (!data || typeof data !== "object") return false;
  const value = data as Record<string, unknown>;
  return (
    Object.keys(value).sort().join() === "channel,id,type" &&
    value.channel === channel &&
    value.type === type &&
    Number.isSafeInteger(value.id) &&
    Number(value.id) > 0
  );
}
export function isUiEvent(data: unknown, channel: string): data is UiEvent {
  if (!data || typeof data !== "object") return false;
  const value = data as Record<string, unknown>;
  return (
    Object.keys(value).sort().join() === "channel,type" &&
    value.channel === channel &&
    typeof value.type === "string" &&
    ["ready", "answered", "toggle-sound", "closed"].includes(value.type)
  );
}
