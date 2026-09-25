import questions from "./questions.json";
export type Language = "zh" | "en";
export type Settings = {
  language: "auto" | Language;
  sound: boolean;
  volume: number;
  musicVolume: number;
  effectsVolume: number;
  screens: number;
};
export const defaults: Settings = {
  language: "auto",
  sound: true,
  volume: 0.5,
  musicVolume: 0.55,
  effectsVolume: 0.8,
  screens: 6,
};
export function settingsFrom(input: unknown = {}): Settings {
  const value = (
    input && typeof input === "object" ? input : {}
  ) as Partial<Settings>;
  return {
    language: ["zh", "en", "auto"].includes(value.language ?? "")
      ? value.language!
      : "auto",
    sound: typeof value.sound === "boolean" ? value.sound : true,
    volume:
      typeof value.volume === "number" && Number.isFinite(value.volume)
        ? Math.min(1, Math.max(0, value.volume))
        : 0.5,
    musicVolume:
      typeof value.musicVolume === "number" &&
      Number.isFinite(value.musicVolume)
        ? Math.min(1, Math.max(0, value.musicVolume))
        : 0.55,
    effectsVolume:
      typeof value.effectsVolume === "number" &&
      Number.isFinite(value.effectsVolume)
        ? Math.min(1, Math.max(0, value.effectsVolume))
        : 0.8,
    screens:
      typeof value.screens === "number" && Number.isFinite(value.screens)
        ? Math.min(8, Math.max(1, Math.round(value.screens)))
        : 6,
  };
}
export function languageFor(settings: Settings, locale: string): Language {
  return settings.language === "auto"
    ? locale.toLowerCase().startsWith("zh")
      ? "zh"
      : "en"
    : settings.language;
}
export function validAnswer(answer: string) {
  return answer.replace(/[\s\p{Cf}\p{Cc}\p{Mn}\p{Me}]/gu, "").length > 0;
}
export function recoveryBudget(destroyMs: number) {
  return Math.min(Math.max(0, destroyMs) / 3, 12000);
}
export const phases = [
  "PREPARING",
  "SUMMONING",
  "DESTROYING",
  "FINAL_BLAST",
  "RUINS",
  "AWAITING_ANSWER",
  "RESTORING",
  "RETURNING",
  "SLEEPING",
  "DONE",
  "ABORTING",
] as const;
export type Phase = (typeof phases)[number];
const allowed: Partial<Record<Phase, Phase[]>> = {
  PREPARING: ["SUMMONING"],
  SUMMONING: ["DESTROYING"],
  DESTROYING: ["FINAL_BLAST", "RUINS"],
  FINAL_BLAST: ["RUINS"],
  RUINS: ["AWAITING_ANSWER"],
  AWAITING_ANSWER: ["RESTORING"],
  RESTORING: ["RETURNING"],
  RETURNING: ["SLEEPING"],
  SLEEPING: ["DONE"],
};
export class StateMachine {
  phase: Phase = "PREPARING";
  move(next: Phase) {
    if (next !== "ABORTING" && !allowed[this.phase]?.includes(next))
      throw Error(`Invalid phase ${this.phase} -> ${next}`);
    this.phase = next;
  }
  answer(value: string) {
    if (this.phase !== "AWAITING_ANSWER" || !validAnswer(value)) return false;
    return this.acknowledgeAnswer();
  }
  /** Only called for an already validated reply on the private UI channel. */
  acknowledgeAnswer() {
    if (this.phase !== "AWAITING_ANSWER") return false;
    this.move("RESTORING");
    return true;
  }
}
export type Question = (typeof questions)[number];
export function drawQuestion(
  history: unknown,
  random = Math.random,
): { question: Question; history: string[] } {
  const ids = new Set(questions.map((q) => q.id));
  let used = [
    ...new Set(
      (Array.isArray(history) ? history : []).filter(
        (id): id is string => typeof id === "string" && ids.has(id),
      ),
    ),
  ];
  const last = used.at(-1);
  if (used.length === questions.length) used = [];
  const choices = questions.filter(
    (q) => !used.includes(q.id) && (used.length > 0 || q.id !== last),
  );
  const question =
    choices[
      Math.min(choices.length - 1, Math.floor(random() * choices.length))
    ];
  return { question, history: [...used, question.id] };
}
export { questions };
