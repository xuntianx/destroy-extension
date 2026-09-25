/** PCM sample storage only; browser decoder/node overhead is outside this budget. */
export const AUDIO_PCM_BUDGET = 64 * 1024 * 1024;

export function pcmBytes(buffer: AudioBuffer) {
  const bytes =
    buffer.length * buffer.numberOfChannels * Float32Array.BYTES_PER_ELEMENT;
  if (!Number.isSafeInteger(bytes) || bytes <= 0)
    throw Error("Invalid audio buffer");
  return bytes;
}

export class AudioBufferCache {
  private entries = new Map<string, Promise<AudioBuffer>>();
  private queue: Array<() => void> = [];
  private active = 0;
  private bytes = 0;
  private decoded = 0;
  private closed = false;
  private controller = new AbortController();

  constructor(
    private decode: (id: string, signal: AbortSignal) => Promise<AudioBuffer>,
    private budget = AUDIO_PCM_BUDGET,
  ) {}

  snapshot() {
    return {
      cachedBytes: this.bytes,
      decodedFiles: this.decoded,
      pendingFiles: this.entries.size - this.decoded,
      activeDecodes: this.active,
      limitBytes: this.budget,
    };
  }

  load(id: string): Promise<AudioBuffer> {
    if (this.closed) return Promise.reject(Error("Audio cache closed"));
    const existing = this.entries.get(id);
    if (existing) return existing;
    const promise = new Promise<AudioBuffer>((resolve, reject) => {
      this.queue.push(() => {
        if (this.closed) {
          reject(Error("Audio cache closed"));
          return;
        }
        this.active++;
        void Promise.resolve()
          .then(() => this.decode(id, this.controller.signal))
          .then((buffer) => {
            if (this.closed) throw Error("Audio cache closed");
            const bytes = pcmBytes(buffer);
            if (this.bytes + bytes > this.budget)
              throw Error("Audio PCM budget exceeded");
            this.bytes += bytes;
            this.decoded++;
            resolve(buffer);
          })
          .catch((error) => {
            this.entries.delete(id);
            reject(error);
          })
          .finally(() => {
            this.active--;
            this.pump();
          });
      });
    });
    this.entries.set(id, promise);
    this.pump();
    return promise;
  }

  private pump() {
    while (this.active < 2 && this.queue.length) this.queue.shift()!();
  }

  close() {
    this.closed = true;
    this.controller.abort();
    this.entries.clear();
    this.bytes = this.decoded = 0;
    // Pending tasks are rejected without starting another fetch/decode.
    for (const task of this.queue.splice(0)) task();
  }
}
