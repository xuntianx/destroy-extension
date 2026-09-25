/** Only visible foreground time advances. All session effects use this clock. */
export class SessionClock {
  time = 0;
  private previous = 0;
  private raf = 0;
  private stopped = false;
  private jobs = new Set<{
    start: number;
    duration: number;
    draw: (progress: number) => void;
    resolve: () => void;
    reject: (e: Error) => void;
  }>();
  private visibility = () => {
    this.previous = 0;
  };
  constructor(private onError: (error: unknown) => void) {
    document.addEventListener("visibilitychange", this.visibility);
    this.raf = requestAnimationFrame(this.tick);
  }
  private tick = (now: number) => {
    if (this.stopped) return;
    const delta = this.previous ? now - this.previous : 0;
    this.previous = now;
    if (!document.hidden) {
      this.time += delta;
      try {
        for (const job of [...this.jobs]) {
          const p = Math.min(
            1,
            (this.time - job.start) / Math.max(1, job.duration),
          );
          job.draw(p);
          if (p >= 1) {
            this.jobs.delete(job);
            job.resolve();
          }
        }
      } catch (e) {
        this.onError(e);
      }
    }
    this.raf = requestAnimationFrame(this.tick);
  };
  animate(duration: number, draw: (p: number) => void) {
    return new Promise<void>((resolve, reject) => {
      if (this.stopped) {
        reject(Error("Session cancelled"));
        return;
      }
      this.jobs.add({ start: this.time, duration, draw, resolve, reject });
    });
  }
  wait(ms: number) {
    return this.animate(ms, () => {});
  }
  cancel() {
    if (this.stopped) return;
    this.stopped = true;
    document.removeEventListener("visibilitychange", this.visibility);
    cancelAnimationFrame(this.raf);
    for (const j of this.jobs) j.reject(Error("Session cancelled"));
    this.jobs.clear();
  }
}
