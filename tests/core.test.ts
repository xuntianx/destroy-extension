import { describe, it, expect } from "vitest";
import {
  StateMachine,
  validAnswer,
  recoveryBudget,
  drawQuestion,
  questions,
  settingsFrom,
  languageFor,
} from "../src/shared/core";
describe("mandatory reflection", () => {
  it("rejects whitespace and invisible-only answers without rejecting uncertainty or emoji", () => {
    for (const s of [
      "",
      " \n\t",
      "\u200b\u200d\ufeff",
      "\u2060\u00ad",
      "\u0301",
    ])
      expect(validAnswer(s)).toBe(false);
    for (const s of ["不知道", "I do not know", "🙂", "é", "a\u0301"])
      expect(validAnswer(s)).toBe(true);
  });
  it("cannot restore from destruction or waiting timers, accepts exactly one valid answer", () => {
    const state = new StateMachine();
    state.move("SUMMONING");
    state.move("DESTROYING");
    expect(() => state.move("RESTORING")).toThrow();
    expect(state.answer("yes")).toBe(false);
    state.move("RUINS");
    state.move("AWAITING_ANSWER");
    expect(state.answer(" ")).toBe(false);
    expect(state.phase).toBe("AWAITING_ANSWER");
    expect(state.answer("不知道")).toBe(true);
    expect(state.answer("again")).toBe(false);
  });
  it("never introduces a minimum recovery duration that violates a short destruction budget", () => {
    for (const ms of [0, 75, 600, 1234, 30000, 60000])
      expect(recoveryBudget(ms)).toBeLessThanOrEqual(Math.min(ms / 3, 12000));
  });
});
describe("bilingual local question deck", () => {
  it("has 50 paired unique questions", () => {
    expect(questions).toHaveLength(50);
    expect(new Set(questions.map((q) => q.id)).size).toBe(50);
    for (const q of questions) {
      expect(q.zh.length).toBeGreaterThan(5);
      expect(q.en.length).toBeGreaterThan(10);
    }
  });
  it("draws every question exactly once per round and avoids the last question across rounds", () => {
    let history: string[] = [],
      last = "";
    for (let cycle = 0; cycle < 4; cycle++) {
      const current = [];
      for (let i = 0; i < 50; i++) {
        const selection = drawQuestion(history, () => 0.999);
        if (i === 0) expect(selection.question.id).not.toBe(last);
        current.push(selection.question.id);
        history = selection.history;
        last = selection.question.id;
      }
      expect(new Set(current).size).toBe(50);
    }
  });
  it("repairs corrupt settings and enforces the eight-screen ceiling", () => {
    expect(settingsFrom(null).screens).toBe(6);
    expect(settingsFrom({ screens: 999 }).screens).toBe(8);
    expect(settingsFrom({ volume: -3 }).volume).toBe(0);
    expect(languageFor(settingsFrom(), "zh-TW")).toBe("zh");
    expect(languageFor(settingsFrom(), "fr")).toBe("en");
  });
});
