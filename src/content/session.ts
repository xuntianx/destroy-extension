import {
  StateMachine,
  recoveryBudget,
  languageFor,
  type Settings,
  type Question,
  type Phase,
} from "../shared/core";
import { musicFor } from "../audio/catalog";
import { strings } from "../shared/strings";
import {
  meleeStance,
  feedScroll,
  type Stance,
  type Action,
  type Point,
} from "./director";
import { prepareFracture } from "./fragments";
import { SessionClock } from "./clock";
import { recoveryFrame } from "./recovery";
import { blastImpactTimes } from "./blast";
import { pageExitReason } from "./page-guard";
import { breathMarkup } from "./breath-fx";
import { UiBridge } from "./ui-bridge";
import { AudioCues, type AudioCue } from "./audio-cues";
import {
  analyzePage,
  refreshTargets,
  hideTarget,
  showTarget,
  restoreAll,
  fracture,
  StyleLease,
  type PageSnapshot,
  type Target,
} from "./page";
import { Rig, neutral, sample, tracks } from "./rig.js";
import {
  motionFrame,
  motionDuration,
  motionMarkers,
  repairPose,
} from "./motions";
import css from "./overlay.css?inline";
const smooth = (p: number) => p * p * (3 - 2 * p),
  clamp = (x: number, min: number, max: number) =>
    Math.max(min, Math.min(max, x));
export class Session {
  readonly state = new StateMachine();
  readonly page: PageSnapshot;
  readonly host = document.createElement("div");
  private root: ShadowRoot;
  private dialog: HTMLDialogElement;
  private mount: HTMLElement;
  private fragments: HTMLElement;
  private fx: SVGSVGElement;
  private ui: UiBridge;
  private label = "";
  private audioAvailable = true;
  private rig: Rig;
  private lease = new StyleLease();
  private clock: SessionClock;
  private disposed = false;
  private unlocked = false;
  private controller = new AbortController();
  private heartbeat = 0;
  private refreshTimer = 0;
  private audioSequence = 0;
  private activeCues?: { timeline: AudioCues; start: number };
  private musicId: string | undefined;
  private musicStarted = 0;
  private observer: MutationObserver;
  private destructionStarted = 0;
  private firstHit: number | undefined;
  private groundY = 0;
  private rubbleIndex = 0;
  private reaches: Record<Action, Point> = {
    claw: { x: 0, y: 0 },
    tail: { x: 0, y: 0 },
  };
  private destroyMs = 0;
  private lang;
  private copy;
  private reduced = matchMedia("(prefers-reduced-motion:reduce)").matches;
  private initialUrl = location.href;
  constructor(
    private token: string,
    private settings: Settings,
    private question: Question,
    private finished: () => void,
  ) {
    this.page = analyzePage();
    this.lang = languageFor(settings, navigator.language);
    this.copy = strings[this.lang];
    this.host.dataset.destroyRoot = token;
    this.root = this.host.attachShadow({ mode: "open" });
    this.root.innerHTML = `<style>${css}</style><dialog class="surface" aria-label="${this.copy.name}"><div class="world"><div class="ground"></div><div class="fragments" aria-hidden="true"></div><div class="monster" aria-hidden="true"></div><svg class="effects" width="100%" height="100%" aria-hidden="true"></svg></div><span class="zzz" aria-hidden="true">z Z z</span></dialog>`;
    this.dialog = this.root.querySelector("dialog")!;
    this.mount = this.root.querySelector(".monster")!;
    this.mount.style.opacity = "0";
    this.fragments = this.root.querySelector(".fragments")!;
    this.fx = this.root.querySelector("svg.effects")!;
    this.ui = new UiBridge(
      chrome.runtime.getURL("overlay.html"),
      { language: this.lang, question: question[this.lang] },
      (event) => {
        if (this.disposed || this.unlocked) return;
        if (event === "toggle-sound") {
          this.settings.sound = !this.audioAvailable || !this.settings.sound;
          if (!this.settings.sound) this.pauseCues();
          this.updateSound();
          void this.audio(this.settings.sound ? "heartbeat" : "pause");
        } else if (event === "answered" && this.state.acknowledgeAnswer()) {
          void this.restore().catch((e) => this.abort(e));
        }
      },
      (error) => this.abort(error),
    );
    this.dialog.append(this.ui.frame);
    this.clock = new SessionClock((error) => this.abort(error));
    this.rig = new Rig(this.mount);
    this.observer = new MutationObserver(() => {
      this.checkPage();
      if (
        !this.disposed &&
        !this.refreshTimer &&
        ["RUINS", "AWAITING_ANSWER"].includes(this.state.phase)
      )
        this.refreshTimer = window.setTimeout(() => {
          this.refreshTimer = 0;
          if (
            this.disposed ||
            !["RUINS", "AWAITING_ANSWER"].includes(this.state.phase)
          )
            return;
          try {
            refreshTargets(this.page)?.forEach(hideTarget);
          } catch (error) {
            this.abort(error);
          }
        }, 150);
    });
  }
  async start() {
    try {
      document.documentElement.append(this.host);
      this.dialog.addEventListener("cancel", (e) => e.preventDefault(), {
        signal: this.controller.signal,
      });
      // Open the modal before loading the child document so it is initialized
      // inside the active top layer, rather than inheriting an inert subtree.
      this.dialog.showModal();
      await this.ui.initialize();
      if (this.disposed || !this.host.isConnected)
        throw Error("Interface removed");
      this.ui.frame.focus({ preventScroll: true });
      this.lock();
      this.page.scroller.scrollLeft = this.page.scrollX;
      this.page.scroller.scrollTop = this.page.scrollY;
      this.host.dataset.initialScroll = String(this.page.scrollY);
      this.phase("SUMMONING", this.copy.ready);
      this.updateSound();
      this.observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
      this.observer.observe(this.dialog, { childList: true });
      this.heartbeat = window.setInterval(() => {
        this.checkPage();
        if (!this.disposed && !document.hidden) void this.audio("heartbeat");
      }, 5000);
      document.addEventListener(
        "visibilitychange",
        () => {
          if (document.hidden) this.pauseCues();
          void this.audio(document.hidden ? "pause" : "heartbeat");
        },
        { signal: this.controller.signal },
      );
      window.addEventListener("pagehide", () => this.cleanup(), {
        signal: this.controller.signal,
      });
      for (const event of ["hashchange", "popstate"])
        window.addEventListener(event, () => this.checkPage(), {
          signal: this.controller.signal,
        });
      // Layout coordinates are session-local. A resize invalidates the current attack path.
      window.addEventListener(
        "resize",
        () => {
          if (
            innerWidth !== this.page.width ||
            innerHeight !== this.page.height
          )
            this.abort(
              `Viewport changed (${this.page.width}x${this.page.height} -> ${innerWidth}x${innerHeight})`,
              true,
            );
        },
        { signal: this.controller.signal },
      );
      void this.run().catch((e) => this.abort(e));
    } catch (e) {
      this.abort(e);
      throw e;
    }
  }
  private checkPage() {
    if (this.disposed || this.unlocked) return;
    const exit = pageExitReason({
      initialUrl: this.initialUrl,
      currentUrl: location.href,
      hostConnected: this.host.isConnected,
      frameConnected: this.ui.frame.isConnected,
      scrollerConnected: this.page.scroller.isConnected,
    });
    if (exit) this.abort(exit.reason, exit.expected);
  }
  private phase(phase: Phase, label: string) {
    this.state.move(phase);
    this.host.dataset.phase = phase;
    this.label = label;
    this.updateSound();
    void this.audio("heartbeat");
  }
  private lock() {
    const root = document.documentElement,
      body = document.body;
    const scrollbar = innerWidth - root.clientWidth;
    if (scrollbar > 0)
      this.lease.set(
        root,
        "padding-right",
        parseFloat(getComputedStyle(root).paddingRight) + scrollbar + "px",
      );
    for (const el of new Set([root, body, this.page.scroller])) {
      this.lease.set(el, "overflow", "hidden");
      this.lease.set(el, "scroll-behavior", "auto");
      this.lease.set(el, "scroll-snap-type", "none");
      this.lease.set(el, "overflow-anchor", "none");
    }
    const signal = this.controller.signal;
    for (const type of ["wheel", "touchmove", "dragstart", "selectstart"])
      this.dialog.addEventListener(type, (e) => e.preventDefault(), {
        passive: false,
        signal,
      });
  }
  private updateSound() {
    this.ui.state({
      phase: this.state.phase,
      label: this.label,
      sound: this.settings.sound,
      audioAvailable: this.audioAvailable,
    });
  }
  private planCues(cues: AudioCue[]) {
    const timeline = new AudioCues(cues, (event, dueAt, pan) => {
      this.host.dataset.plannedAudioCues = String(
        Number(this.host.dataset.plannedAudioCues ?? 0) + 1,
      );
      void this.audio("effect", event, pan, dueAt);
    });
    this.activeCues = { timeline, start: this.clock.time };
    return timeline;
  }
  private pauseCues() {
    const active = this.activeCues;
    if (active)
      active.timeline.pause(this.clock.time - active.start, Date.now());
  }
  private async audio(action: string, event?: string, pan = 0, dueAt?: number) {
    if (this.disposed && action !== "stop") return;
    const musicId = musicFor(this.state.phase);
    if (musicId !== this.musicId) {
      this.musicId = musicId;
      this.musicStarted = this.clock.time;
    }
    if (document.hidden && action !== "stop") action = "pause";
    try {
      const result = await chrome.runtime.sendMessage({
        type: "AUDIO",
        token: this.token,
        action,
        event,
        pan,
        seq: ++this.audioSequence,
        phase: this.state.phase,
        musicElapsed: (this.clock.time - this.musicStarted) / 1000,
        sentAt: Date.now(),
        dueAt,
        musicVolume: this.settings.musicVolume,
        effectsVolume: this.settings.effectsVolume,
        sound: this.settings.sound,
        volume: this.settings.volume,
      });
      if (result?.ok === false && this.settings.sound) {
        this.audioAvailable = false;
        this.updateSound();
      } else if (result?.ok && !this.audioAvailable) {
        this.audioAvailable = true;
        this.updateSound();
      }
    } catch {
      /* Audio is optional; recovery is not. */
    }
  }
  private positionDefault() {
    const clipBottom =
      this.page.scroller === document.scrollingElement
        ? innerHeight
        : Math.min(
            innerHeight,
            this.page.scroller.getBoundingClientRect().bottom,
          );
    this.groundY = clipBottom - 28;
    this.mount.style.left = Math.max(8, innerWidth * 0.5 - 124) + "px";
    this.mount.style.top = this.groundY - 492 * 0.4 + "px";
    const ground = this.root.querySelector<HTMLElement>(".ground")!;
    ground.style.top = this.groundY + "px";
    this.host.dataset.groundY = String(this.groundY);
  }
  private measureReach() {
    this.mount.style.transform = "";
    const box = this.mount.getBoundingClientRect();
    for (const action of ["claw", "tail"] as const) {
      this.rig.pose(sample(action, tracks[action].hit));
      const point = this.rig.point(action);
      this.reaches[action] = { x: point.x - box.left, y: point.y - box.top };
    }
    this.rig.pose(neutral);
  }
  private async moveTo(left: number, mirror: boolean) {
    const start = parseFloat(this.mount.style.left) || 0;
    const distance = Math.abs(left - start);
    this.mount.style.transform = mirror ? "scaleX(-1)" : "";
    if (distance < 2) return;
    await this.clock.animate(Math.min(380, 180 + distance * 0.35), (p) => {
      this.mount.style.left = start + (left - start) * smooth(p) + "px";
      const hop = this.reduced ? 0 : -Math.sin(p * Math.PI) * 9;
      this.mount.style.translate = `0 ${hop}px`;
      this.rig.pose({ ...neutral, headR: Math.sin(p * Math.PI) * -3 });
      this.rig.nodes["monster-shadow"].setAttribute(
        "transform",
        `translate(0 ${-hop / 0.4})`,
      );
    });
    this.mount.style.translate = "";
    this.rig.pose(neutral);
  }
  private markHit() {
    if (this.firstHit === undefined) {
      this.firstHit = this.clock.time;
      this.host.dataset.firstHitScroll = String(this.page.scroller.scrollTop);
    }
  }
  private trimDebris() {
    const debris = this.page.targets.filter((t) => t.fragments.length);
    while (debris.reduce((n, t) => n + t.fragments.length, 0) > 72) {
      const oldest = debris.shift()!;
      oldest.fragments.forEach((node) => {
        const fade = node.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 120,
          fill: "forwards",
        });
        void fade.finished.then(
          () => node.remove(),
          () => node.remove(),
        );
      });
      oldest.fragments = [];
    }
  }
  private fragmentPose(node: HTMLElement) {
    const matrix = new DOMMatrix(node.style.transform || undefined);
    return {
      x: parseFloat(node.style.left) + matrix.e,
      y: parseFloat(node.style.top) + matrix.f,
      rotation: (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI,
      scale: Math.hypot(matrix.a, matrix.b),
    };
  }
  private async settleDebris() {
    const moving: {
      node: HTMLElement;
      from: ReturnType<Session["fragmentPose"]>;
      x: number;
      y: number;
      rotation: number;
      scale: number;
      discard: boolean;
    }[] = [];
    // Gather recognizable pieces before scrolling, rather than teleporting afterwards.
    for (const target of this.page.targets) {
      const fresh = target.fragments.filter((node) => !node.dataset.rubble);
      for (const [i, node] of fresh.entries()) {
        const index = this.rubbleIndex++;
        node.dataset.rubble = "1";
        const from = this.fragmentPose(node);
        const scale = target.kind === "text" ? 0.68 : 0.6;
        const width = node.offsetWidth * scale;
        const x = clamp(
          target.rect.left +
            Number(node.dataset.fragmentLeft ?? 0) +
            Math.sin(index * 2.4) * 85,
          14,
          Math.max(14, innerWidth - width - 14),
        );
        moving.push({
          node,
          from,
          x,
          y:
            this.groundY -
            Math.min(node.offsetHeight * scale, 110) -
            (index % 4) * 8,
          rotation: Math.sin(index * 1.7) * 17,
          scale,
          discard: i >= 4,
        });
      }
    }
    if (!moving.length) return;
    void this.audio("effect", "debris");
    await this.clock.animate(this.reduced ? 120 : 320, (p) => {
      const t = smooth(p);
      for (const item of moving) {
        const { node, from } = item;
        node.style.left = `${from.x + (item.x - from.x) * t}px`;
        node.style.top = `${from.y + (item.y - from.y) * t}px`;
        node.style.transform = `rotate(${from.rotation * (1 - t) + item.rotation * t}deg) scale(${from.scale * (1 - t) + item.scale * t})`;
        if (item.discard) node.style.opacity = String(1 - t);
      }
    });
    moving.filter((item) => item.discard).forEach((item) => item.node.remove());
    for (const target of this.page.targets)
      target.fragments = target.fragments.filter((node) => node.isConnected);
    this.trimDebris();
  }
  private async run() {
    this.positionDefault();
    const entranceCues = this.planCues([
      {
        event: "landing",
        at: motionDuration.entrance * motionMarkers.entrance.landing,
      },
    ]);
    await this.clock.animate(motionDuration.entrance, (p) => {
      const frame = motionFrame("entrance", p);
      this.mount.style.translate = `${frame.x}px ${frame.y}px`;
      this.mount.style.opacity = String(frame.opacity);
      this.rig.pose(frame.pose);
      this.rig.nodes["monster-shadow"].setAttribute(
        "transform",
        `translate(0 ${-frame.y / 0.4})`,
      );
      entranceCues.tick(
        p * motionDuration.entrance,
        Date.now(),
        this.settings.sound && !document.hidden,
      );
      if (p >= motionMarkers.entrance.landing && !this.host.dataset.landed) {
        this.host.dataset.landed = "1";
      }
    });
    this.activeCues = undefined;
    this.mount.style.translate = "";
    this.phase("DESTROYING", this.copy.destroying);
    void this.audio("effect", "roar");
    this.destructionStarted = this.clock.time;
    this.measureReach();
    const initialY = this.page.scrollY;
    let count = 0;
    while (this.clock.time - this.destructionStarted < 50000) {
      if (this.disposed) return;
      const pending = this.page.targets.filter(
        (t) => !t.decoration && !t.hidden && t.element.isConnected,
      );
      for (const target of pending)
        target.rect = target.element.getBoundingClientRect();
      const top = this.groundY - 492 * 0.4,
        currentLeft = parseFloat(this.mount.style.left);
      const preferred: Action = count % 4 === 3 ? "tail" : "claw";
      const possible = pending
        .map((target) => ({
          target,
          stance: meleeStance(
            target.rect,
            this.reaches,
            top,
            innerWidth,
            currentLeft,
            preferred,
          ),
        }))
        .filter(
          (entry): entry is { target: Target; stance: Stance } =>
            !!entry.stance,
        );
      if (possible.length) {
        const choice = possible.sort(
          (a, b) =>
            Math.abs(a.stance.left - currentLeft) -
            Math.abs(b.stance.left - currentLeft),
        )[0];
        await this.attack(choice.target, choice.stance);
        count++;
      } else if (this.firstHit === undefined) {
        // First release stays in the user's current viewport, even when content starts above the strike line.
        const visible = pending.filter(
          (t) =>
            t.rect.bottom > 30 &&
            t.rect.top < innerHeight - 40 &&
            t.rect.right > 0 &&
            t.rect.left < innerWidth,
        );
        const first = visible.sort(
          (a, b) =>
            Math.abs(a.rect.bottom - this.groundY + 65) -
            Math.abs(b.rect.bottom - this.groundY + 65),
        )[0];
        if (!first) break;
        await this.blast([first], true);
      } else {
        const next = feedScroll(
          pending.filter((t) => t.rect.left < innerWidth),
          top + this.reaches.claw.y,
          this.page.scroller.scrollTop,
          initialY,
          this.page.height,
          this.settings.screens,
          this.page.scroller.scrollHeight - this.page.scroller.clientHeight,
        );
        if (next === undefined) break;
        await this.settleDebris();
        const start = this.page.scroller.scrollTop;
        await this.clock.animate(650, (p) => {
          this.page.scroller.scrollTop = start + (next - start) * smooth(p);
        });
      }
      if (!this.page.targets.some((t) => !t.hidden && t.element.isConnected))
        break;
    }
    refreshTargets(this.page);
    const remaining = this.page.targets.filter(
      (t) => !t.hidden && t.element.isConnected,
    );
    if (remaining.length) {
      this.phase("FINAL_BLAST", this.copy.blast);
      await this.blast(remaining);
    }
    await this.settleDebris();
    // Lazy-loaded content may arrive while the final sweep is animating.
    refreshTargets(this.page)?.forEach(hideTarget);
    this.phase("RUINS", this.copy.ruins);
    void this.audio("effect", "accent");
    void this.audio("effect", "breathing");
    this.destroyMs =
      this.clock.time - (this.firstHit ?? this.destructionStarted);
    this.host.dataset.destroyMs = String(this.destroyMs);
    await this.clock.wait(2000);
    this.phase("AWAITING_ANSWER", this.copy.waiting);
    void this.audio("effect", "question");
    while (this.state.phase === "AWAITING_ANSWER" && !this.disposed)
      await this.clock.animate(2400, (p) => {
        if (this.state.phase === "AWAITING_ANSWER")
          this.rig.pose({ ...neutral, bodyY: Math.sin(p * Math.PI * 2) * 2 });
      });
  }
  private async attack(target: Target, stance: Stance) {
    const { action, point } = stance,
      track = tracks[action];
    await this.moveTo(stance.left, stance.mirror);
    this.host.dataset.attackLane = stance.lane;
    this.host.dataset.attackAction = action;
    const prepared = prepareFracture(
      target.element,
      target.kind === "text",
      this.reduced,
    );
    let hit = false,
      attempted = false,
      invalidated = false;
    const pan = (point.x / innerWidth) * 2 - 1;
    const cues = this.planCues([
      { event: "whoosh", at: track.hit - 170, pan },
      { event: action, at: track.hit, pan },
      {
        event: target.element.matches("p,h1,h2,h3,li,blockquote")
          ? "paper"
          : "debris",
        at: track.hit,
        pan,
      },
    ]);
    let pieces: ReturnType<typeof fracture> = [];
    await this.clock.animate(track.duration, (p) => {
      const time = p * track.duration;
      if (!attempted && !invalidated) {
        const rect = target.element.getBoundingClientRect();
        if (
          !target.element.isConnected ||
          point.x < rect.left - 8 ||
          point.x > rect.right + 8 ||
          point.y < rect.top - 8 ||
          point.y > rect.bottom + 8
        ) {
          invalidated = true;
          void this.audio("cancel-effects");
        }
      }
      cues.tick(
        time,
        Date.now(),
        !invalidated && this.settings.sound && !document.hidden,
      );
      // Always render the contact pose once even if a frame steps over the hit marker.
      this.rig.pose(
        sample(action, !attempted && time >= track.hit ? track.hit : time),
      );
      if (!attempted && time >= track.hit) {
        attempted = true;
        if (invalidated) return;
        const actual = this.rig.point(action === "tail" ? "tail" : "claw"),
          now = target.element.getBoundingClientRect();
        if (
          actual.x < now.left - 8 ||
          actual.x > now.right + 8 ||
          actual.y < now.top - 8 ||
          actual.y > now.bottom + 8
        )
          return;
        hit = true;
        this.host.dataset.meleeHits = String(
          Number(this.host.dataset.meleeHits ?? 0) + 1,
        );
        const foot = this.rig.point("near-foot");
        this.host.dataset.maxFootDrift = String(
          Math.max(
            Number(this.host.dataset.maxFootDrift ?? 0),
            Math.abs(foot.y - this.groundY),
          ),
        );
        this.markHit();
        pieces = fracture(
          target,
          this.fragments,
          point,
          this.reduced,
          prepared,
        );
        hideTarget(target);
      }
      if (hit) {
        const elapsed = Math.max(0, (time - track.hit) / 1000);
        for (const f of pieces) {
          const floor = Math.max(
            0,
            this.groundY - f.y - Math.min(f.node.offsetHeight, 70),
          );
          f.node.style.transform = `translate(${f.vx * elapsed * (this.reduced ? 0.3 : 1)}px,${Math.min(floor, f.vy * elapsed + 680 * elapsed * elapsed)}px) rotate(${f.rotation * elapsed}deg)`;
        }
        if (elapsed < 0.17)
          this.fx.innerHTML = `<circle cx="${point.x}" cy="${point.y}" r="${12 + elapsed * 160}" fill="none" stroke="#edb262" stroke-width="${6 - elapsed * 25}" opacity="${1 - elapsed / 0.17}"/>`;
        else this.fx.replaceChildren();
      }
    });
    this.activeCues = undefined;
    this.fx.replaceChildren();
    if (!target.hidden && target.element.isConnected)
      await this.blast([target], true);
    this.trimDebris();
  }
  private async blast(targets: Target[], single = false) {
    single ||= targets.length === 1;
    const aim = targets
      .map((t) => t.element.getBoundingClientRect())
      .find(
        (r) =>
          r.bottom > 0 &&
          r.top < innerHeight &&
          r.right > 0 &&
          r.left < innerWidth,
      );
    if (aim) {
      const center = clamp(aim.left + aim.width * 0.5, 0, innerWidth);
      const mirror = center < innerWidth * 0.5;
      const dy = Math.max(0, this.groundY - 100 - aim.top - aim.height * 0.5);
      const standBack = clamp(200 + dy * 0.8, 300, 620);
      // Stand behind the target before charging, so an article above the center does not fire back through the face.
      await this.moveTo(
        clamp(
          mirror ? center + standBack - 248 : center - standBack,
          8,
          Math.max(8, innerWidth - 256),
        ),
        mirror,
      );
    }
    this.host.dataset.attackAction = "breath";
    let duration = single ? 1500 : motionDuration.breath;
    const markers = motionMarkers.breath;
    const mouthAtStart = this.rig.point("mouth");
    const entries = targets
      .map((target) => {
        const rect = target.element.getBoundingClientRect();
        const visible =
          rect.bottom > 0 &&
          rect.top < innerHeight &&
          rect.right > 0 &&
          rect.left < innerWidth;
        return {
          at: markers.hit,
          target,
          rect,
          visible,
          point: {
            x: clamp(rect.left + rect.width * 0.5, 0, innerWidth),
            y: clamp(rect.top + rect.height * 0.5, 0, innerHeight),
          },
        };
      })
      .sort(
        (a, b) =>
          Number(b.visible) - Number(a.visible) ||
          Math.hypot(a.point.x - mouthAtStart.x, a.point.y - mouthAtStart.y) -
            Math.hypot(b.point.x - mouthAtStart.x, b.point.y - mouthAtStart.y),
      );
    const visible = entries.filter((entry) => entry.visible);
    if (!single) {
      const times = blastImpactTimes(
        entries.map((entry) => entry.visible),
        markers.hit,
        markers.end - 0.04,
      );
      entries.forEach((entry, index) => (entry.at = times[index]));
      entries.sort((a, b) => a.at - b.at);
      if (!visible.length) duration = 1200;
    }
    const prepared = new Map(
      visible
        .filter((entry) => !entry.target.decoration)
        .slice(0, single ? 1 : 3)
        .map((entry) => [
          entry.target,
          prepareFracture(
            entry.target.element,
            entry.target.kind === "text",
            this.reduced,
          ),
        ]),
    );
    const pieces: (ReturnType<typeof fracture>[number] & { born: number })[] =
      [];
    const dust: { x: number; y: number; born: number }[] = [];
    let cursor = 0;
    const cues = this.planCues([
      { event: "charge", at: 0 },
      { event: single ? "roar" : "breath", at: duration * markers.fire },
      { event: "release", at: duration * markers.hit },
    ]);
    await this.clock.animate(duration, (p) => {
      this.host.dataset.blastProgress = String(Math.floor(p * 100));
      cues.tick(
        p * duration,
        Date.now(),
        this.settings.sound && !document.hidden,
      );
      const frame = motionFrame("breath", p);
      this.rig.pose(frame.pose);
      const mouth = this.rig.point("mouth");
      const sweep =
        clamp((p - markers.hit) / (markers.end - 0.04 - markers.hit), 0, 1) *
        Math.max(0, visible.length - 1);
      const a = visible[Math.floor(sweep)]?.point ?? {
        x: innerWidth * 0.9,
        y: innerHeight * 0.2,
      };
      const b =
        visible[Math.min(visible.length - 1, Math.floor(sweep) + 1)]?.point ??
        a;
      const end = {
        x: a.x + (b.x - a.x) * (sweep % 1),
        y: a.y + (b.y - a.y) * (sweep % 1),
      };
      while (cursor < entries.length && p >= entries[cursor].at) {
        const entry = entries[cursor++];
        if (!entry.target.element.isConnected) continue;
        this.markHit();
        if (prepared.has(entry.target)) {
          pieces.push(
            ...fracture(
              entry.target,
              this.fragments,
              entry.point,
              this.reduced,
              prepared.get(entry.target),
            ).map((piece) => ({ ...piece, born: p })),
          );
        }
        hideTarget(entry.target);
        if (entry.visible) dust.push({ ...entry.point, born: p });
      }
      const shapes: string[] = [
        breathMarkup(
          mouth,
          end,
          p,
          single,
          this.reduced,
          this.mount.style.transform.includes("-1"),
        ),
      ];
      for (const impact of dust.slice(-12)) {
        const age = ((p - impact.born) * duration) / 1000;
        if (age < 0.28)
          shapes.push(
            `<circle cx="${impact.x}" cy="${impact.y}" r="${12 + age * 120}" fill="#d5dabd" opacity="${0.5 * (1 - age / 0.28)}"/><circle cx="${impact.x}" cy="${impact.y}" r="${8 + age * 90}" fill="none" stroke="#eeb972" stroke-width="3" opacity="${1 - age / 0.28}"/>`,
          );
      }
      this.fx.innerHTML = shapes.join("");
      for (const f of pieces) {
        const elapsed = ((p - f.born) * duration) / 1000;
        f.node.style.transform = `translate(${f.vx * elapsed}px,${Math.min(Math.max(0, this.groundY - f.y - Math.min(f.node.offsetHeight, 70)), f.vy * elapsed + elapsed * elapsed * 680)}px) rotate(${f.rotation * elapsed}deg)`;
      }
      this.mount.style.filter = frame.glow
        ? `drop-shadow(0 0 ${frame.glow}px #edbf52)`
        : "";
    });
    this.activeCues = undefined;
    // Finish rounding or disconnected-target cases without leaving hidden-state gaps.
    entries.slice(cursor).forEach((entry) => hideTarget(entry.target));
    this.fx.replaceChildren();
    this.mount.style.filter = "";
    this.trimDebris();
  }
  private async restore() {
    this.host.dataset.phase = "RESTORING";
    this.label = this.copy.restoring;
    this.updateSound();
    void this.audio("effect", "confirm");
    let assembleCue = -1;
    const budget = recoveryBudget(this.destroyMs),
      started = this.clock.time;
    const ordered = [...this.page.targets].sort(
      (a, b) =>
        a.element.getBoundingClientRect().top -
        b.element.getBoundingClientRect().top,
    );
    const snapshots = ordered.flatMap((t, rank) =>
      t.fragments.map((node) => ({
        node,
        owner: t,
        target: t.element,
        from: this.fragmentPose(node),
        offset: {
          left: Number(node.dataset.fragmentLeft ?? 0),
          top: Number(node.dataset.fragmentTop ?? 0),
        },
        delay: (rank / Math.max(1, ordered.length - 1)) * 0.15,
      })),
    );
    await this.clock.animate(budget * 0.6, (p) => {
      this.rig.pose(repairPose(p));
      const cue = Math.floor(p * 3);
      if (cue > assembleCue) {
        assembleCue = cue;
        void this.audio("effect", "assemble");
      }
      this.mount.style.filter = `drop-shadow(0 0 ${Math.sin(p * Math.PI) * 20}px #e5f8bd)`;
      for (const f of snapshots) {
        if (!f.target.isConnected) {
          f.node.remove();
          continue;
        }
        const frame = recoveryFrame(
          f.from,
          f.target.getBoundingClientRect(),
          f.offset,
          (p - f.delay) / (1 - f.delay),
        );
        f.node.style.left = `${frame.x}px`;
        f.node.style.top = `${frame.y}px`;
        f.node.style.transform = `rotate(${frame.rotation}deg) scale(${frame.scale})`;
        f.node.style.opacity = String(frame.opacity);
        if (frame.arrived) showTarget(f.owner);
      }
      const upto = Math.floor(ordered.length * p);
      for (let i = 0; i < upto; i++)
        if (!ordered[i].fragments.length) showTarget(ordered[i]);
    });
    restoreAll(this.page.targets);
    this.mount.style.filter = "";
    this.phase("RETURNING", this.copy.restoring);
    const x = this.page.scroller.scrollLeft,
      y = this.page.scroller.scrollTop;
    await this.clock.animate(
      Math.max(0, budget - (this.clock.time - started) - 100),
      (p) => {
        this.page.scroller.scrollLeft = x + (this.page.scrollX - x) * smooth(p);
        this.page.scroller.scrollTop = y + (this.page.scrollY - y) * smooth(p);
      },
    );
    this.page.scroller.scrollTop = this.page.scrollY;
    this.page.scroller.scrollLeft = this.page.scrollX;
    this.unlock();
    this.host.dataset.restoreMs = String(this.clock.time - started);
    this.phase("SLEEPING", this.copy.sleep);
    void this.audio("effect", "accent");
    let snored = false;
    const z = this.root.querySelector<HTMLElement>(".zzz")!;
    await this.clock.animate(motionDuration.sleep, (p) => {
      if (!snored && p > motionMarkers.sleep.snore) {
        snored = true;
        void this.audio("effect", "snore");
      }
      const frame = motionFrame("sleep", p);
      this.rig.pose(frame.pose);
      const mouth = this.rig.point("mouth");
      z.style.left = clamp(mouth.x - 14, 12, innerWidth - 60) + "px";
      z.style.top = mouth.y - 55 + "px";
      this.mount.style.opacity = String(frame.opacity);
      z.style.opacity = String(frame.zOpacity);
      z.style.translate = `0 ${frame.zY}px`;
    });
    this.state.move("DONE");
    this.cleanup();
  }
  private unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    this.ui.dispose();
    this.lease.restore();
    this.dialog.close();
    this.dialog.classList.add("sleeping");
    this.dialog.style.pointerEvents = "none";
    this.dialog.setAttribute("open", "");
    this.host.style.pointerEvents = "none";
    this.observer.disconnect();
    if (this.page.focus?.isConnected)
      this.page.focus.focus({ preventScroll: true });
  }
  abort(error: unknown, expected = false) {
    if (this.disposed) return;
    // Resizing invalidates saved coordinates, but is an expected safety exit.
    // Keep actual failures visible without reporting a normal resize as an error.
    const log = expected ? console.info : console.warn;
    log(
      "[Destroy] Session safely stopped:",
      error instanceof Error ? error.message : String(error),
    );
    this.state.move("ABORTING");
    this.cleanup();
  }
  cleanup() {
    if (this.disposed) return;
    this.disposed = true;
    this.observer.disconnect();
    clearInterval(this.heartbeat);
    clearTimeout(this.refreshTimer);
    this.controller.abort();
    this.ui.dispose();
    this.clock.cancel();
    restoreAll(this.page.targets);
    this.lease.restore();
    this.dialog.close();
    this.host.remove();
    if (!this.unlocked) {
      this.page.scroller.scrollTop = this.page.scrollY;
      this.page.scroller.scrollLeft = this.page.scrollX;
      if (this.page.focus?.isConnected)
        this.page.focus.focus({ preventScroll: true });
    }
    void this.audio("stop");
    this.finished();
  }
}
