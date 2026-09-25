import { languageFor, settingsFrom } from "../shared/core";
import { errorText, strings } from "../shared/strings";
import "./style.css";
import "../shared/fonts.css";
const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const saved = await chrome.storage.local.get("settings");
let settings = settingsFrom(saved.settings);
let noticeError: unknown;
let renderRevision = 0;
function render() {
  const revision = ++renderRevision;
  const lang = languageFor(settings, chrome.i18n.getUILanguage()),
    s = strings[lang];
  document.documentElement.lang = lang;
  document.title = s.name;
  document.querySelector<HTMLOptionElement>(
    '#language option[value="auto"]',
  )!.textContent = s.auto;
  $("notice").textContent =
    noticeError === undefined ? "" : errorText(lang, noticeError);
  for (const [id, key] of Object.entries({
    name: "name",
    hint: "hint",
    summon: "summon",
    "shortcut-label": "shortcut",
    "language-label": "language",
    "sound-label": "sound",
    "volume-label": "volume",
    "musicVolume-label": "musicVolume",
    "effectsVolume-label": "effectsVolume",
    preview: "preview",
    privacy: "privacy",
    "about-label": "about",
  }))
    $(id).textContent = s[key as keyof typeof s];
  $<HTMLSelectElement>("language").value = settings.language;
  $<HTMLInputElement>("sound").checked = settings.sound;
  $<HTMLInputElement>("volume").value = String(settings.volume * 100);
  for (const id of ["musicVolume", "effectsVolume"] as const)
    $<HTMLInputElement>(id).value = String(settings[id] * 100);
  void chrome.commands
    .getAll()
    .then((commands) => {
      if (revision !== renderRevision) return;
      $("shortcut").textContent =
        commands.find((c) => c.name === "summon-monster")?.shortcut ||
        s.unbound;
    })
    .catch(() => {
      if (revision === renderRevision) $("shortcut").textContent = s.unbound;
    });
}
for (const id of [
  "language",
  "sound",
  "volume",
  "musicVolume",
  "effectsVolume",
])
  $(id).addEventListener("change", async () => {
    settings = settingsFrom({
      ...settings,
      language: $<HTMLSelectElement>("language")
        .value as typeof settings.language,
      sound: $<HTMLInputElement>("sound").checked,
      volume: Number($<HTMLInputElement>("volume").value) / 100,
      musicVolume: Number($<HTMLInputElement>("musicVolume").value) / 100,
      effectsVolume: Number($<HTMLInputElement>("effectsVolume").value) / 100,
    });
    await chrome.storage.local.set({ settings });
    render();
  });
$("shortcut").addEventListener("click", () =>
  chrome.tabs.create({ url: "chrome://extensions/shortcuts" }),
);
$("summon").addEventListener("click", async () => {
  const button = $<HTMLButtonElement>("summon");
  button.disabled = true;
  noticeError = undefined;
  $("notice").textContent = "";
  try {
    const result = await chrome.runtime.sendMessage({ type: "POPUP_SUMMON" });
    if (result.ok) window.close();
    else {
      noticeError = result.error ?? "failed";
      render();
    }
  } catch {
    noticeError = "failed";
    render();
  } finally {
    button.disabled = false;
  }
});
render();

$("preview").addEventListener("click", () =>
  chrome.tabs.create({ url: chrome.runtime.getURL("preview.html") }),
);
