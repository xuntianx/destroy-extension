import { Session } from "./session";
import { settingsFrom } from "../shared/core";
const scope = globalThis as typeof globalThis & {
  __destroyInstalled?: boolean;
};
if (!scope.__destroyInstalled) {
  scope.__destroyInstalled = true;
  let session: Session | undefined;
  chrome.runtime.onMessage.addListener((message, _sender, reply) => {
    if (message?.type === "DESTROY_STATUS") {
      reply({ active: !!session, phase: session?.state.phase });
      return;
    }
    if (message?.type !== "DESTROY_SUMMON") return;
    if (session) {
      reply({ ok: false, error: "duplicate" });
      return;
    }
    void (async () => {
      try {
        session = new Session(
          message.token,
          settingsFrom(message.settings),
          message.question,
          () => (session = undefined),
        );
        await session.start();
        reply({ ok: true });
      } catch (e) {
        session?.cleanup();
        session = undefined;
        reply({
          ok: false,
          error:
            e instanceof Error &&
            ["unsupported", "tooLarge"].includes(e.message)
              ? e.message
              : "failed",
        });
      }
    })();
    return true;
  });
}
