export type AudioCue = { event: string; at: number; pan?: number };
type PendingCue = AudioCue & { sent?: number; consumed: boolean };
/** A short lookahead follows the same foreground clock as the animation.
 * Never queue an entire long action in the independent audio clock: a pause must
 * cancel pending sounds, and returning to the tab must not replay past impacts.
 */
export class AudioCues {
  private cues: PendingCue[];
  constructor(
    cues: AudioCue[],
    private send: (event: string, dueAt: number, pan: number) => void,
  ) {
    this.cues = cues.map((cue) => ({ ...cue, consumed: false }));
  }
  tick(time: number, wallTime: number, enabled: boolean) {
    for (const cue of this.cues) {
      if (cue.consumed) continue;
      const remaining = cue.at - time;
      if (
        cue.sent === undefined &&
        remaining <= 120 &&
        remaining >= -50 &&
        enabled
      ) {
        cue.sent = wallTime + Math.max(0, remaining);
        this.send(cue.event, cue.sent, cue.pan ?? 0);
      }
      if (remaining <= 0) cue.consumed = true;
    }
  }
  pause(time: number, wallTime: number) {
    for (const cue of this.cues) {
      if (cue.at <= time || (cue.sent !== undefined && cue.sent <= wallTime))
        cue.consumed = true;
      else cue.sent = undefined;
    }
  }
}
