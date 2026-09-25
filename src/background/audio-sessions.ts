export type AudioControl = {
  token: string;
  seq: number;
  phase: string;
  action: string;
  sound: boolean;
};
type Store = Pick<chrome.storage.StorageArea, "get" | "set" | "remove">;
type Record = { token?: string; control?: AudioControl; pending: number };
/** Token writes are ordered per tab; slow validation cannot overwrite a newer record. */
export class AudioSessions {
  private records = new Map<number, Record>();
  private writes = new Map<number, Promise<void>>();
  constructor(private store: Store) {}
  private write(tabId: number, action: () => Promise<void>) {
    const job = (this.writes.get(tabId) ?? Promise.resolve())
      .catch(() => {})
      .then(action);
    this.writes.set(tabId, job);
    const clear = () => {
      if (this.writes.get(tabId) === job) this.writes.delete(tabId);
    };
    void job.then(clear, clear);
    return job;
  }
  async open(tabId: number, token: string) {
    const record = { token, pending: 0 };
    this.records.set(tabId, record);
    try {
      await this.write(tabId, () =>
        this.store.set({ ["session:" + tabId]: token }),
      );
    } catch (error) {
      if (this.records.get(tabId) === record) this.records.delete(tabId);
      throw error;
    }
  }
  async close(tabId: number, token?: string) {
    const record = this.records.get(tabId);
    if (token && record?.token && record.token !== token) return;
    this.records.delete(tabId); // Invalidates every validator still awaiting storage.
    await this.write(tabId, async () => {
      const key = "session:" + tabId;
      if (!token || (await this.store.get(key))[key] === token)
        await this.store.remove(key);
    });
  }
  async admit(tabId: number, message: AudioControl) {
    let record = this.records.get(tabId);
    if (!record) {
      record = { pending: 0 };
      this.records.set(tabId, record);
    }
    record.pending++;
    try {
      await this.writes.get(tabId);
      if (
        this.records.get(tabId) !== record ||
        (record.token && record.token !== message.token)
      )
        return "rejected";
      const key = "session:" + tabId;
      const stored = await this.store.get(key);
      if (this.records.get(tabId) !== record || stored[key] !== message.token) {
        return "rejected";
      }
      record.token = message.token;
      if (record.control && message.seq <= record.control.seq) return "stale";
      record.control = message;
      return "accepted";
    } finally {
      record.pending--;
      if (
        !record.pending &&
        !record.token &&
        this.records.get(tabId) === record
      )
        this.records.delete(tabId);
    }
  }
  current(tabId: number, message: AudioControl) {
    const latest = this.records.get(tabId)?.control;
    return (
      !!latest &&
      latest.token === message.token &&
      (latest.seq === message.seq ||
        (message.action === "effect" &&
          latest.phase === message.phase &&
          latest.sound &&
          !["pause", "stop"].includes(latest.action)))
    );
  }
}
