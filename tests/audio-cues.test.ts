import { describe, expect, it, vi } from "vitest";
import { AudioCues } from "../src/content/audio-cues";
describe("foreground audio lookahead", () => {
  it("sends simultaneous hit and debris once, just before the visual deadline", () => {
    const send = vi.fn(),
      cues = new AudioCues(
        [
          { event: "claw", at: 500, pan: -0.5 },
          { event: "paper", at: 500 },
        ],
        send,
      );
    cues.tick(379, 1000, true);
    expect(send).not.toHaveBeenCalled();
    cues.tick(400, 1021, true);
    expect(send.mock.calls).toEqual([
      ["claw", 1121, -0.5],
      ["paper", 1121, 0],
    ]);
    cues.tick(450, 1071, true);
    cues.tick(510, 1131, true);
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("replans only the pending cue after a pause, using the new wall time", () => {
    const send = vi.fn(),
      cues = new AudioCues(
        [
          { event: "whoosh", at: 200 },
          { event: "claw", at: 500 },
        ],
        send,
      );
    cues.tick(100, 1000, true);
    cues.tick(400, 1300, true);
    cues.pause(410, 1310);
    cues.tick(410, 6310, true);
    expect(send.mock.calls).toEqual([
      ["whoosh", 1100, 0],
      ["claw", 1400, 0],
      ["claw", 6400, 0],
    ]);
  });
  it("does not replay a cue whose audio deadline passed before the last animation frame", () => {
    const send = vi.fn(),
      cues = new AudioCues([{ event: "claw", at: 500 }], send);
    cues.tick(400, 1000, true);
    cues.pause(480, 1110);
    cues.tick(490, 6000, true);
    expect(send).toHaveBeenCalledOnce();
  });
  it("drops missed or muted impacts instead of playing a backlog", () => {
    const send = vi.fn(),
      cues = new AudioCues(
        [
          { event: "claw", at: 500 },
          { event: "tail", at: 1000 },
        ],
        send,
      );
    cues.tick(560, 2000, true);
    cues.tick(1010, 2450, false);
    cues.tick(1020, 2460, true);
    expect(send).not.toHaveBeenCalled();
  });
});
