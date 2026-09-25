export const strings = {
  zh: {
    name: "Destroy",
    summon: "召唤小怪兽",
    hint: "让它砸一会儿。回答一个问题，页面就会恢复。",
    sound: "声音",
    volume: "总音量",
    musicVolume: "音乐音量",
    effectsVolume: "音效音量",
    preview: "试听音乐与音效",
    language: "语言",
    auto: "跟随浏览器",
    shortcut: "快捷键",
    unbound: "未绑定或快捷键冲突，点此设置",
    ready: "小怪兽正在醒来…",
    destroying: "让它替你砸一会儿",
    blast: "剩下的，交给这一口吐息",
    ruins: "先停一会儿。",
    answerHint: "写下你的想法……",
    help: "没有标准答案。回答后，页面会慢慢恢复。",
    submit: "Done",
    waiting: "给自己一点思考的空间",
    restoring: "让一切慢慢归位",
    sleep: "小怪兽睡着了，你可以继续了",
    unsupported: "这个页面暂时不支持。请在普通文章或网页上使用。",
    tooLarge: "页面结构超出当前支持规模，本次没有修改网页。",
    failed: "未能完成本次体验，已清理插件效果。",
    duplicate: "小怪兽已经在这个页面里了，请完成当前的问题。",
    enableSound: "开启声音",
    soundOff: "静音",
    about: "关于与素材",
    saved: "设置已保存",
    privacy: "回答只在当前页面使用，不上传、不保存。",
  },
  en: {
    name: "Destroy",
    summon: "Summon the monster",
    hint: "Let it smash for a moment. Answer one question to restore your page.",
    sound: "Sound",
    volume: "Master volume",
    musicVolume: "Music volume",
    effectsVolume: "Effects volume",
    preview: "Preview music & effects",
    language: "Language",
    auto: "Browser language",
    shortcut: "Shortcut",
    unbound: "Unassigned or conflicting — configure",
    ready: "The little monster is waking up…",
    destroying: "Let it take the frustration",
    blast: "One last breath for the rest",
    ruins: "Take a moment.",
    answerHint: "Write down your thoughts…",
    help: "There is no right answer. Reply to restore the page.",
    submit: "Done",
    waiting: "A little space to reflect",
    restoring: "Putting things back together",
    sleep: "The monster is asleep. You can carry on.",
    unsupported:
      "This page is not supported yet. Try a regular article or webpage.",
    tooLarge: "This page exceeds the supported size. Nothing has been changed.",
    failed:
      "The session could not finish. Extension effects have been cleaned up.",
    duplicate:
      "The monster is already here. Finish the current question first.",
    enableSound: "Enable sound",
    soundOff: "Mute",
    about: "About & assets",
    saved: "Settings saved",
    privacy: "Your answer stays on this page. It is never sent or saved.",
  },
} as const;

export function errorText(language: keyof typeof strings, error: unknown) {
  const copy = strings[language];
  return error === "unsupported" ||
    error === "tooLarge" ||
    error === "duplicate"
    ? copy[error]
    : copy.failed;
}
