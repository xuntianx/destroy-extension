import {
  isUiEvent,
  isUiPulse,
  type UiConfig,
  type UiEvent,
  type UiState,
} from "../shared/ui-protocol";
/** A private MessagePort carries controls only; answer text never enters this document. */
export class UiBridge {
  readonly frame = document.createElement("iframe");
  private port?: MessagePort;
  private disposed = false;
  private ready = false;
  private channel = crypto.randomUUID();
  private rejectReady?: (error: Error) => void;
  private timer = 0;
  private healthTimer = 0;
  private lastCheck = 0;
  private pulseId = 0;
  private pendingPulse?: { id: number; elapsed: number };
  private visibility = () => {
    this.pendingPulse = undefined;
    this.lastCheck = performance.now();
  };
  constructor(
    private url: string,
    private config: UiConfig,
    private onEvent: (event: UiEvent["type"]) => void,
    private onFailure: (error: Error) => void,
  ) {
    this.frame.className = "interaction-frame";
    this.frame.title =
      config.language === "zh"
        ? "Destroy：声音与回答"
        : "Destroy: sound and reflection";
    this.frame.setAttribute("referrerpolicy", "no-referrer");
  }
  initialize() {
    const url = new URL(this.url);
    url.searchParams.set("parentOrigin", location.origin);
    const origin =
      url.protocol === "chrome-extension:"
        ? `chrome-extension://${url.host}`
        : url.origin;
    return new Promise<void>((resolve, reject) => {
      this.rejectReady = reject;
      this.timer = window.setTimeout(
        () => this.fail("Interface did not initialize"),
        8000,
      );
      let loaded = false;
      this.frame.onload = () => {
        if (this.disposed) return;
        if (loaded) {
          this.fail("Interface navigated");
          return;
        }
        loaded = true;
        const pair = new MessageChannel();
        this.port = pair.port1;
        this.port.onmessage = ({ data }) => {
          if (this.disposed) return;
          if (isUiPulse(data, this.channel, "pong")) {
            if (this.pendingPulse?.id === data.id)
              this.pendingPulse = undefined;
            return;
          }
          if (!isUiEvent(data, this.channel)) return;
          if (data.type === "ready") {
            if (this.ready) return;
            this.ready = true;
            clearTimeout(this.timer);
            this.rejectReady = undefined;
            this.lastCheck = performance.now();
            document.addEventListener("visibilitychange", this.visibility);
            this.healthTimer = window.setInterval(
              () => this.checkHealth(),
              1000,
            );
            resolve();
          } else if (this.ready && data.type === "closed")
            this.fail("Interface closed");
          else if (this.ready) this.onEvent(data.type);
        };
        this.port.onmessageerror = () => this.fail("Invalid interface message");
        try {
          this.frame.contentWindow!.postMessage(
            {
              type: "DESTROY_UI_INIT",
              channel: this.channel,
              config: this.config,
            },
            origin,
            [pair.port2],
          );
        } catch {
          pair.port2.close();
          this.fail("Interface connection failed");
        }
      };
      this.frame.src = url.href;
    });
  }
  state(state: UiState) {
    if (this.ready && !this.disposed)
      this.port?.postMessage({ type: "state", channel: this.channel, state });
  }
  private checkHealth() {
    const now = performance.now();
    // Whole-browser suspension must not consume the deadline in one callback.
    const elapsed = Math.min(2000, Math.max(0, now - this.lastCheck));
    this.lastCheck = now;
    if (this.disposed || !this.ready || document.hidden) return;
    if (this.pendingPulse) {
      this.pendingPulse.elapsed += elapsed;
      if (this.pendingPulse.elapsed >= 8000)
        this.fail("Interface stopped responding");
      return;
    }
    this.pendingPulse = { id: ++this.pulseId, elapsed: 0 };
    try {
      this.port?.postMessage({
        type: "ping",
        channel: this.channel,
        id: this.pulseId,
      });
    } catch {
      this.fail("Interface connection lost");
    }
  }
  private fail(message: string) {
    if (this.disposed) return;
    const error = new Error(message);
    this.rejectReady?.(error);
    this.rejectReady = undefined;
    this.dispose();
    this.onFailure(error);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    clearTimeout(this.timer);
    clearInterval(this.healthTimer);
    document.removeEventListener("visibilitychange", this.visibility);
    this.pendingPulse = undefined;
    this.rejectReady?.(new Error("Interface cancelled"));
    this.rejectReady = undefined;
    this.frame.onload = null;
    this.port?.close();
    this.frame.remove();
  }
}
