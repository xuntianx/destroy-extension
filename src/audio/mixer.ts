import {
  catalog,
  effectGroups,
  level,
  musicFor,
  type AudioMessage,
} from "./catalog";
import { AudioBufferCache } from "./buffer-cache";
type Voice = {
  source: AudioBufferSourceNode;
  gain: GainNode;
  pan?: StereoPannerNode;
  when?: number;
};
type Music = {
  id: string;
  voices: Set<Voice>;
  timer?: ReturnType<typeof setInterval>;
};
type Session = {
  token: string;
  phase: string;
  seq: number;
  epoch: number;
  lastSeen: number;
  paused: boolean;
  master: GainNode;
  musicBus: GainNode;
  effectsBus: GainNode;
  duck: GainNode;
  music?: Music;
  voices: Set<Voice>;
  variants: Map<string, number>;
  lastEffect: Map<string, number>;
};
export class AudioMixer {
  private sessions = new Map<number, Session>();
  private buffers: AudioBufferCache;
  private disposed = false;
  private context?: AudioContext;
  private limiter?: DynamicsCompressorNode;
  constructor(
    private url: (file: string) => string,
    private createContext = () => new AudioContext(),
  ) {
    this.buffers = new AudioBufferCache(async (id, signal) => {
      const context = this.ensureContext();
      const response = await fetch(this.url(catalog[id].file), { signal });
      if (!response.ok) throw Error(`Missing audio: ${id}`);
      return context.decodeAudioData(await response.arrayBuffer());
    });
  }
  audioMemory() {
    return this.buffers.snapshot();
  }
  private ensureContext() {
    if (!this.context) {
      this.context = this.createContext();
      this.limiter = this.context.createDynamicsCompressor();
      this.limiter.threshold.value = -3;
      this.limiter.knee.value = 0;
      this.limiter.ratio.value = 20;
      this.limiter.attack.value = 0.003;
      this.limiter.release.value = 0.12;
      this.limiter.connect(this.context.destination);
    }
    return this.context;
  }
  async unlock() {
    await this.ensureContext().resume();
  }
  private load(id: string) {
    return this.buffers.load(id);
  }
  private ramp(param: AudioParam, value: number) {
    param.cancelScheduledValues(this.context!.currentTime);
    param.setTargetAtTime(value, this.context!.currentTime, 0.015);
  }
  private stopVoice(v: Voice, fade = false) {
    if (fade) {
      const now = this.context!.currentTime;
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setTargetAtTime(0, now, 0.01);
      try {
        v.source.stop(now + 0.06);
      } catch {}
      return; // onended owns disconnection after the fade.
    }
    try {
      v.source.stop();
    } catch {}
    v.source.disconnect();
    v.gain.disconnect();
    v.pan?.disconnect();
  }
  private silence(s: Session, fade = false) {
    s.epoch++;
    s.lastEffect.clear();
    s.duck.gain.cancelScheduledValues(this.context!.currentTime);
    s.duck.gain.setValueAtTime(1, this.context!.currentTime);
    if (s.music) {
      clearInterval(s.music.timer);
      s.music.voices.forEach((v) => this.stopVoice(v, fade));
      s.music = undefined;
    }
    s.voices.forEach((v) =>
      this.stopVoice(
        v,
        fade && (v.when === undefined || v.when <= this.context!.currentTime),
      ),
    );
    s.voices.clear();
  }
  stop(tabId: number, token?: string) {
    const s = this.sessions.get(tabId);
    if (!s || (token && token !== s.token)) return;
    this.silence(s);
    s.master.disconnect();
    s.musicBus.disconnect();
    s.effectsBus.disconnect();
    s.duck.disconnect();
    this.sessions.delete(tabId);
  }
  sweep(now = Date.now()) {
    for (const [id, s] of this.sessions)
      if (now - s.lastSeen > 15000) this.stop(id);
  }
  dispose() {
    this.disposed = true;
    for (const id of this.sessions.keys()) this.stop(id);
    this.buffers.close();
    void this.context?.close();
  }
  async handle(m: AudioMessage) {
    if (this.disposed) return;
    let s = this.sessions.get(m.tabId);
    if (m.action === "stop") {
      this.stop(m.tabId, m.token);
      return;
    }
    if (s?.token !== m.token) {
      this.stop(m.tabId);
      const c = this.ensureContext();
      s = {
        token: m.token,
        phase: m.phase,
        seq: -1,
        epoch: 0,
        lastSeen: Date.now(),
        paused: false,
        master: c.createGain(),
        musicBus: c.createGain(),
        effectsBus: c.createGain(),
        duck: c.createGain(),
        voices: new Set(),
        variants: new Map(),
        lastEffect: new Map(),
      };
      s.musicBus.connect(s.duck).connect(s.master);
      s.effectsBus.connect(s.master);
      s.master.connect(this.limiter!);
      this.sessions.set(m.tabId, s);
    }
    if (m.seq <= s.seq) return;
    s.seq = m.seq;
    s.lastSeen = Date.now();
    if (s.phase !== m.phase) {
      s.phase = m.phase;
      s.epoch++;
      s.duck.gain.cancelScheduledValues(this.context!.currentTime);
      s.duck.gain.setTargetAtTime(1, this.context!.currentTime, 0.015);
      for (const voice of s.voices) {
        if (
          voice.when !== undefined &&
          voice.when > this.context!.currentTime
        ) {
          this.stopVoice(voice);
          s.voices.delete(voice);
        }
      }
    }
    if (m.action === "pause" || !m.sound) {
      s.paused = true;
      this.silence(s, true);
      return;
    }
    if (m.action === "cancel-effects") {
      s.epoch++;
      for (const voice of s.voices) {
        if (
          voice.when !== undefined &&
          voice.when > this.context!.currentTime
        ) {
          this.stopVoice(voice);
          s.voices.delete(voice);
        }
      }
      s.duck.gain.cancelScheduledValues(this.context!.currentTime);
      s.duck.gain.setTargetAtTime(1, this.context!.currentTime, 0.015);
      return;
    }
    s.paused = false;
    this.ramp(s.master.gain, level(m.volume));
    this.ramp(s.musicBus.gain, level(m.musicVolume, 0.55));
    this.ramp(s.effectsBus.gain, level(m.effectsVolume, 0.8));
    const epoch = s.epoch;
    await this.unlock();
    if (this.context!.state !== "running") throw Error("Audio suspended");
    if (this.sessions.get(m.tabId) !== s || s.paused || s.epoch !== epoch)
      return;
    const id = musicFor(m.phase);
    if (s.music?.id !== id) {
      if (s.music) {
        const old = s.music;
        clearInterval(old.timer);
        for (const v of old.voices) {
          v.gain.gain.cancelScheduledValues(this.context!.currentTime);
          v.gain.gain.setTargetAtTime(0, this.context!.currentTime, 0.045);
          try {
            v.source.stop(this.context!.currentTime + 0.25);
          } catch {}
          // Retain ownership during fade-out so pause/stop still cancels it.
          s.voices.add(v);
        }
        s.music = undefined;
      }
      if (id) {
        const music: Music = { id, voices: new Set() };
        s.music = music;
        void this.startMusic(
          s,
          music,
          Math.max(0, m.musicElapsed),
          Date.now(),
        ).catch(() => {
          if (s!.music === music) s!.music = undefined;
        });
      }
    }
    if (m.phase === "SUMMONING")
      for (const id of Object.keys(catalog)) void this.load(id).catch(() => {});
    if (m.action === "effect" && m.event) await this.effect(s, m);
  }
  private voice(
    buffer: AudioBuffer,
    bus: AudioNode,
    owned: Set<Voice>,
    pan?: number,
  ): Voice {
    const c = this.context!,
      source = c.createBufferSource(),
      gain = c.createGain();
    source.buffer = buffer;
    const v: Voice = { source, gain };
    source.connect(gain);
    if (pan !== undefined) {
      v.pan = c.createStereoPanner();
      v.pan.pan.value = Math.max(
        -1,
        Math.min(1, Number.isFinite(pan) ? pan : 0),
      );
      gain.connect(v.pan).connect(bus);
    } else gain.connect(bus);
    owned.add(v);
    source.onended = () => {
      owned.delete(v);
      for (const s of this.sessions.values()) s.voices.delete(v);
      source.disconnect();
      gain.disconnect();
      v.pan?.disconnect();
    };
    return v;
  }
  private async startMusic(
    s: Session,
    music: Music,
    elapsed: number,
    requested: number,
  ) {
    const buffer = await this.load(music.id);
    if (s.music !== music || s.paused) return;
    const c = this.context!,
      meta = catalog[music.id];
    elapsed += (Date.now() - requested) / 1000;
    const fade = Math.min(meta.crossfade, buffer.duration / 4),
      period = buffer.duration - fade;
    if (meta.kind !== "loop" && elapsed >= buffer.duration) return;
    const offset = meta.kind === "loop" ? elapsed % period : elapsed;
    const schedule = (start: number, offset: number, warm: boolean) => {
      const v = this.voice(buffer, s.musicBus, music.voices),
        end = start + buffer.duration - offset;
      v.gain.gain.setValueAtTime(0, start);
      v.gain.gain.linearRampToValueAtTime(
        meta.gain,
        Math.min(end, start + (warm ? 0.025 : Math.max(fade, 0.025))),
      );
      v.gain.gain.setValueAtTime(
        meta.gain,
        Math.max(start, end - Math.max(fade, 0.03)),
      );
      v.gain.gain.linearRampToValueAtTime(0, end);
      v.source.start(start, offset);
      v.source.stop(end);
    };
    schedule(c.currentTime + 0.015, offset, true);
    if (meta.kind !== "loop") return;
    let next = c.currentTime + 0.015 + period - offset;
    music.timer = setInterval(() => {
      if (s.music !== music || s.paused) {
        clearInterval(music.timer);
        return;
      }
      if (next < c.currentTime) {
        // Continue at the current musical position after timer throttling, no backlog.
        const late = (c.currentTime - next) % period;
        schedule(c.currentTime + 0.015, late, true);
        next = c.currentTime + 0.015 + period - late;
      } else if (next < c.currentTime + 0.3) {
        schedule(next, 0, false);
        next += period;
      }
    }, 100);
  }
  private async effect(s: Session, m: AudioMessage) {
    const event = m.event!,
      group = effectGroups[event] ?? [event];
    if (!catalog[group[0]] || catalog[group[0]].kind !== "effect") return;
    const now = Date.now();
    const planned = m.dueAt !== undefined;
    const due = m.dueAt ?? now;
    if (
      !Number.isFinite(due) ||
      (planned && (due - now > 250 || now - due > 50)) ||
      (!planned && now - m.sentAt > 350) ||
      due - (s.lastEffect.get(event) ?? 0) < 65
    )
      return;
    s.lastEffect.set(event, due);
    const previous = s.variants.get(event);
    const index =
      previous === undefined
        ? Math.floor(Math.random() * group.length)
        : group.length < 2
          ? 0
          : (previous + 1 + Math.floor(Math.random() * (group.length - 1))) %
            group.length;
    s.variants.set(event, index);
    const id = group[index],
      epoch = s.epoch,
      buffer = await this.load(id);
    if (
      s.paused ||
      s.epoch !== epoch ||
      this.sessions.get(m.tabId) !== s ||
      (planned ? Date.now() - due > 50 : Date.now() - m.sentAt > 350) ||
      s.voices.size >= 6
    )
      return;
    const v = this.voice(buffer, s.effectsBus, s.voices, m.pan ?? 0);
    const when =
      this.context!.currentTime + Math.max(0, (due - Date.now()) / 1000);
    v.when = when;
    if (["claw", "tail", "release", "landing"].includes(event)) {
      const now = this.context!.currentTime;
      s.duck.gain.cancelScheduledValues(now);
      s.duck.gain.setTargetAtTime(0.42, when, 0.012);
      s.duck.gain.setTargetAtTime(1, when + 0.12, 0.1);
    }
    v.gain.gain.value = catalog[id].gain;
    v.source.start(when);
  }
}
