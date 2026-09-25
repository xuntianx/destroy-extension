import {
  defaults,
  drawQuestion,
  settingsFrom,
  languageFor,
} from "../shared/core";
import { errorText, strings } from "../shared/strings";
import { AudioSessions } from "./audio-sessions";
let starting = Promise.resolve();
const audioSessions = new AudioSessions(chrome.storage.session);
let creating: Promise<void> | undefined;
async function offscreen() {
  if (!creating)
    creating = (async () => {
      const contexts = await chrome.runtime.getContexts({
        contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
        documentUrls: [chrome.runtime.getURL("offscreen.html")],
      });
      if (contexts.length) return;
      await chrome.offscreen.createDocument({
        url: "offscreen.html",
        reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
        justification:
          "Play local monster effects and music during user-triggered sessions.",
      });
    })().finally(() => {
      creating = undefined;
    });
  await creating;
}
async function summon(tabId: number) {
  let token: string | undefined;
  const tab = await chrome.tabs.get(tabId);
  const url = new URL(tab.url ?? "about:blank");
  if (
    !["http:", "https:", "file:"].includes(url.protocol) ||
    ["chromewebstore.google.com", "chrome.google.com"].includes(url.hostname)
  )
    return { ok: false, error: "unsupported" };
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
    const current = await chrome.tabs.sendMessage(tabId, {
      type: "DESTROY_STATUS",
    });
    if (current?.active) return { ok: false, error: "duplicate" };
    const saved = await chrome.storage.local.get([
      "settings",
      "questionHistory",
    ]);
    const selection = drawQuestion(saved.questionHistory ?? []);
    token = crypto.randomUUID();
    await audioSessions.open(tabId, token);
    const response = await chrome.tabs.sendMessage(tabId, {
      type: "DESTROY_SUMMON",
      token,
      settings: settingsFrom(saved.settings),
      question: selection.question,
    });
    if (response?.ok)
      await chrome.storage.local.set({ questionHistory: selection.history });
    else await audioSessions.close(tabId, token);
    return response ?? { ok: false, error: "failed" };
  } catch {
    if (token) await audioSessions.close(tabId, token).catch(() => {});
    return { ok: false, error: "unsupported" };
  }
}
function queueSummon(tabId: number) {
  const result = starting.then(async () => {
    const result = await summon(tabId).catch(() => ({
      ok: false,
      error: "failed",
    }));
    try {
      const saved = await chrome.storage.local.get("settings");
      const language = languageFor(
        settingsFrom(saved.settings),
        chrome.i18n.getUILanguage(),
      );
      const name = strings[language].name;
      await Promise.allSettled([
        chrome.action.setBadgeText({ tabId, text: result.ok ? "" : "!" }),
        chrome.action.setTitle({
          tabId,
          title: result.ok
            ? name
            : `${name}: ${errorText(language, result.error)}`,
        }),
      ]);
    } catch {
      /* Toolbar failures must not change the actual session result. */
    }
    return result;
  });
  starting = result.then(
    () => {},
    () => {},
  );
  return result;
}
chrome.commands.onCommand.addListener((command) => {
  if (command === "summon-monster")
    void chrome.tabs
      .query({ active: true, lastFocusedWindow: true })
      .then(async ([tab]) => {
        if (tab?.id !== undefined) await queueSummon(tab.id);
      })
      .catch(() => {});
});
chrome.runtime.onInstalled.addListener(async () => {
  const saved = await chrome.storage.local.get("settings");
  if (!saved.settings) await chrome.storage.local.set({ settings: defaults });
});
chrome.tabs.onRemoved.addListener((tabId) => {
  void audioSessions.close(tabId).catch(() => {});
  void chrome.runtime
    .sendMessage({ target: "offscreen", type: "AUDIO", action: "stop", tabId })
    .catch(() => {});
});
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || message?.target === "offscreen")
    return;
  if (message?.type === "POPUP_SUMMON" && !sender.tab) {
    void chrome.tabs
      .query({ active: true, lastFocusedWindow: true })
      .then(([tab]) =>
        tab?.id !== undefined
          ? queueSummon(tab.id)
          : { ok: false, error: "unsupported" },
      )
      .then(reply)
      .catch(() => reply({ ok: false, error: "failed" }));
    return true;
  }
  if (message?.type === "AUDIO" && sender.tab?.id !== undefined) {
    const tabId = sender.tab.id;
    if (typeof message.token !== "string" || !Number.isFinite(message.seq)) {
      reply({ ok: false });
      return;
    }
    const current = () => audioSessions.current(tabId, message);
    void (async () => {
      const admitted = await audioSessions.admit(tabId, message);
      if (admitted !== "accepted") return { ok: admitted === "stale" };
      if (!current()) return { ok: true };
      if (message.action === "stop") {
        await audioSessions.close(tabId, message.token);
        await chrome.runtime
          .sendMessage({ ...message, target: "offscreen", tabId })
          .catch(() => {});
        return { ok: true };
      }
      if (message.action !== "pause" && message.sound !== false)
        await offscreen();
      if (!current()) return { ok: true };
      const stillActive = await chrome.storage.session.get("session:" + tabId);
      if (stillActive["session:" + tabId] !== message.token)
        return { ok: false };
      if (!current()) return { ok: true };
      return await chrome.runtime
        .sendMessage({ ...message, target: "offscreen", tabId })
        .catch(() => ({ ok: false }));
    })()
      .then(reply)
      .catch(() => reply({ ok: false }));
    return true;
  }
});
